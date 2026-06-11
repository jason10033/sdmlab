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

// --- Search queries: builder reviews and edits these before scanning ---

function savedQueries(project) {
  return project.search_queries ? JSON.parse(project.search_queries) : null;
}

router.get('/:id/evidence/queries', getProject, (req, res) => {
  res.json({ queries: savedQueries(req.project) || [], surveillanceQuery: req.project.pubmed_query || '' });
});

// Build suggested queries with AI (cheap call). Saves and returns them; the
// builder then edits before running the scan.
router.post('/:id/evidence/queries/suggest', getProject, async (req, res) => {
  try {
    const { queries, surveillanceQuery } = await buildPubmedQueries(req.project.decision);
    db.prepare('UPDATE projects SET search_queries = ?, pubmed_query = ? WHERE id = ?')
      .run(JSON.stringify(queries), surveillanceQuery, req.project.id);
    res.json({ queries, surveillanceQuery });
  } catch (err) {
    res.status(err.code === 'NO_API_KEY' ? 503 : 500).json({ error: err.message });
  }
});

// Save the builder's edited queries.
router.put('/:id/evidence/queries', getProject, (req, res) => {
  const { queries, surveillanceQuery } = req.body || {};
  if (!Array.isArray(queries)) return res.status(400).json({ error: 'queries must be an array' });
  const clean = queries
    .map((q) => ({ purpose: q.purpose || 'custom', query: String(q.query || '').trim() }))
    .filter((q) => q.query);
  db.prepare('UPDATE projects SET search_queries = ?, pubmed_query = ? WHERE id = ?')
    .run(JSON.stringify(clean), surveillanceQuery != null ? String(surveillanceQuery).trim() : req.project.pubmed_query, req.project.id);
  res.json({ ok: true, count: clean.length });
});

// Preview how many PubMed results each query returns (no AI, no screening) so
// the builder can see how strict each one is.
router.post('/:id/evidence/queries/counts', getProject, async (req, res) => {
  const { queries } = req.body || {};
  if (!Array.isArray(queries)) return res.status(400).json({ error: 'queries must be an array' });
  try {
    const counts = [];
    for (const q of queries) {
      const text = String(q.query || '').trim();
      if (!text) { counts.push({ query: text, count: 0 }); continue; }
      counts.push({ query: text, count: await pubmed.countResults(text) });
    }
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run the literature scan as a background job: with real AI the multiple model
// calls exceed proxy timeouts (Render kills HTTP requests at ~100s), so the
// client polls /evidence/scan/status, same pattern as generation.
const scanJobs = new Map(); // projectId -> {status, step, result, error}

router.post('/:id/evidence/scan', getProject, (req, res) => {
  const projectId = req.project.id;
  const project = req.project;
  if (scanJobs.get(projectId)?.status === 'running') {
    return res.status(409).json({ error: 'A literature scan is already in progress' });
  }
  scanJobs.set(projectId, { status: 'running', step: 'Building search queries' });
  res.json({ ok: true, status: 'running' });

  setImmediate(async () => {
    try {
      // Use the builder's reviewed/edited queries if present; otherwise build them.
      const fresh = db.prepare('SELECT search_queries, pubmed_query, decision FROM projects WHERE id = ?').get(projectId);
      let queries, surveillanceQuery;
      const saved = fresh.search_queries ? JSON.parse(fresh.search_queries) : null;
      if (saved && saved.length) {
        queries = saved;
        surveillanceQuery = fresh.pubmed_query || '';
      } else {
        ({ queries, surveillanceQuery } = await buildPubmedQueries(project.decision));
        db.prepare('UPDATE projects SET search_queries = ?, pubmed_query = ? WHERE id = ?')
          .run(JSON.stringify(queries), surveillanceQuery, projectId);
      }

      scanJobs.set(projectId, { status: 'running', step: 'Searching PubMed' });
      const seenPmids = new Set(
        db.prepare("SELECT external_id FROM evidence WHERE project_id = ? AND source = 'pubmed'").all(projectId).map((r) => r.external_id)
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
        scanJobs.set(projectId, { status: 'running', step: `Screening ${Math.min(articles.length, 60)} abstracts` });
        const tagged = await tagEvidence(project.decision, articles.slice(0, 60));
        const byPmid = new Map(tagged.items.map((t) => [t.pmid, t]));
        const insert = db.prepare(`
          INSERT OR IGNORE INTO evidence (project_id, source, external_id, title, abstract, journal, year, url, tags, summary, status)
          VALUES (?, 'pubmed', ?, ?, ?, ?, ?, ?, ?, ?, 'flagged')
        `);
        for (const a of articles) {
          const t = byPmid.get(a.pmid);
          if (!t || !t.relevant) continue;
          insert.run(projectId, a.pmid, a.title, a.abstract, a.journal, a.year, a.url, t.tags.join(','), t.summary);
          inserted++;
        }
      }
      logRevision(projectId, 'evidence', 'literature_scan', `${inserted} abstracts flagged for review`, req.user.id);
      scanJobs.set(projectId, { status: 'done', result: { queries, surveillanceQuery, found: articles.length, flagged: inserted } });
    } catch (err) {
      console.error('Evidence scan failed:', err);
      scanJobs.set(projectId, { status: 'error', error: err.message });
    }
  });
});

router.get('/:id/evidence/scan/status', getProject, (req, res) => {
  res.json(scanJobs.get(req.project.id) || { status: 'idle' });
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
    res.status(err.code === 'NO_API_KEY' || err.code === 'NO_REDDIT_CREDS' ? 503 : 500).json({ error: err.message });
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
