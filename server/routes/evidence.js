const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProject, logRevision } = require('./projects');
const pubmed = require('../services/pubmed');
const reddit = require('../services/reddit');
const { buildPubmedQueries, tagEvidence, pickSubreddits } = require('../services/generator');

const router = express.Router();
router.use(requireAuth);

router.get('/:id/evidence', getProject, (req, res) => {
  const rows = db.prepare('SELECT * FROM evidence WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id);
  res.json(rows);
});

// Run the literature scan: build queries, search PubMed, screen abstracts with the LLM.
router.post('/:id/evidence/scan', getProject, async (req, res) => {
  try {
    const { queries, surveillanceQuery } = await buildPubmedQueries(req.project.decision);
    db.prepare('UPDATE projects SET pubmed_query = ? WHERE id = ?').run(surveillanceQuery, req.project.id);

    const seenPmids = new Set(
      db.prepare("SELECT external_id FROM evidence WHERE project_id = ? AND source = 'pubmed'").all(req.project.id).map((r) => r.external_id)
    );
    const articles = [];
    for (const q of queries) {
      const found = await pubmed.search(q.query, { retmax: 15 });
      for (const a of found) {
        if (!seenPmids.has(a.pmid) && !articles.some((x) => x.pmid === a.pmid)) articles.push(a);
      }
    }

    let inserted = 0;
    if (articles.length) {
      const tagged = await tagEvidence(req.project.decision, articles.slice(0, 60));
      const byPmid = new Map(tagged.items.map((t) => [t.pmid, t]));
      const insert = db.prepare(`
        INSERT OR IGNORE INTO evidence (project_id, source, external_id, title, abstract, journal, year, url, tags, summary, status)
        VALUES (?, 'pubmed', ?, ?, ?, ?, ?, ?, ?, ?, 'flagged')
      `);
      for (const a of articles) {
        const t = byPmid.get(a.pmid);
        if (!t || !t.relevant) continue;
        insert.run(req.project.id, a.pmid, a.title, a.abstract, a.journal, a.year, a.url, t.tags.join(','), t.summary);
        inserted++;
      }
    }
    logRevision(req.project.id, 'evidence', 'literature_scan', `${inserted} abstracts flagged for review`, req.user.id);
    res.json({ queries, surveillanceQuery, found: articles.length, flagged: inserted });
  } catch (err) {
    res.status(err.code === 'NO_API_KEY' ? 503 : 500).json({ error: err.message });
  }
});

// Manually add a known paper by PMID (no AI involved). Lands as included,
// since the builder is adding it deliberately.
router.post('/:id/evidence/pmid', getProject, async (req, res) => {
  const pmid = String(req.body?.pmid || '').replace(/\D/g, '');
  if (!pmid) return res.status(400).json({ error: 'A numeric PMID is required' });
  try {
    const [article] = await pubmed.fetchByIds([pmid]);
    if (!article) return res.status(404).json({ error: `PMID ${pmid} not found on PubMed` });
    db.prepare(`
      INSERT OR IGNORE INTO evidence (project_id, source, external_id, title, abstract, journal, year, url, tags, summary, status)
      VALUES (?, 'pubmed', ?, ?, ?, ?, ?, ?, 'manual', 'Added manually by the team', 'included')
    `).run(req.project.id, article.pmid, article.title, article.abstract, article.journal, article.year, article.url);
    logRevision(req.project.id, 'evidence', 'evidence_added_manually', `PMID ${pmid}: ${article.title.slice(0, 80)}`, req.user.id);
    res.json({ article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Builder reviews each flagged abstract: include or dismiss.
router.patch('/:id/evidence/:evidenceId', getProject, (req, res) => {
  const { status } = req.body || {};
  if (!['flagged', 'included', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE evidence SET status = ? WHERE id = ? AND project_id = ?').run(status, req.params.evidenceId, req.project.id);
  res.json({ ok: true });
});

// Reddit community discovery for this decision.
router.post('/:id/reddit/discover', getProject, async (req, res) => {
  try {
    const shortQuery = req.project.decision.split(/[.:]/)[0].slice(0, 80);
    const candidates = await reddit.findSubreddits(shortQuery);
    if (candidates.length === 0) return res.json({ picks: [] });
    const { picks } = await pickSubreddits(req.project.decision, candidates);
    const bySub = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
    const insert = db.prepare('INSERT OR IGNORE INTO subreddits (project_id, name, rationale, subscribers, approved) VALUES (?, ?, ?, ?, ?)');
    for (const p of picks) {
      const c = bySub.get(p.name.toLowerCase().replace(/^r\//, ''));
      insert.run(req.project.id, p.name.replace(/^r\//, ''), p.rationale, c ? c.subscribers : null, p.recommended ? 1 : 0);
    }
    logRevision(req.project.id, 'evidence', 'reddit_discovery', `${picks.length} communities evaluated`, req.user.id);
    res.json({ picks });
  } catch (err) {
    res.status(err.code === 'NO_API_KEY' ? 503 : 500).json({ error: err.message });
  }
});

router.get('/:id/subreddits', getProject, (req, res) => {
  res.json(db.prepare('SELECT * FROM subreddits WHERE project_id = ? ORDER BY subscribers DESC').all(req.project.id));
});

// Manually add a community the team already knows about.
router.post('/:id/subreddits', getProject, (req, res) => {
  const name = String(req.body?.name || '').replace(/^r\//i, '').replace(/[^A-Za-z0-9_]/g, '');
  if (!name) return res.status(400).json({ error: 'Subreddit name required' });
  db.prepare('INSERT OR IGNORE INTO subreddits (project_id, name, rationale, approved) VALUES (?, ?, ?, 1)')
    .run(req.project.id, name, 'Added manually by the team');
  logRevision(req.project.id, 'evidence', 'subreddit_added_manually', `r/${name}`, req.user.id);
  res.json({ ok: true });
});

router.patch('/:id/subreddits/:subId', getProject, (req, res) => {
  const { approved } = req.body || {};
  db.prepare('UPDATE subreddits SET approved = ? WHERE id = ? AND project_id = ?')
    .run(approved ? 1 : 0, req.params.subId, req.project.id);
  res.json({ ok: true });
});

module.exports = router;
