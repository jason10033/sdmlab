const db = require('../db');
const pubmed = require('./pubmed');
const reddit = require('./reddit');
const { triageSurveillance } = require('./generator');

function isoDateDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// Scan one live project: new PubMed items since last run + recent Reddit posts
// in approved communities. Everything goes through LLM triage, then lands in
// the surveillance_items review queue. Nothing edits the live tool.
async function scanProject(project) {
  const candidates = [];

  if (project.pubmed_query) {
    const articles = await pubmed.search(project.pubmed_query, { retmax: 20, mindate: isoDateDaysAgo(10) });
    for (const a of articles) {
      candidates.push({
        id: `pubmed:${a.pmid}`, source: 'pubmed', external_id: a.pmid,
        title: a.title, url: a.url, snippet: a.abstract,
      });
    }
  }

  const subs = db.prepare('SELECT name FROM subreddits WHERE project_id = ? AND approved = 1').all(project.id);
  const searchTerms = (project.decision || '').split(/\s+/).slice(0, 6).join(' ');
  for (const sub of subs) {
    try {
      const posts = await reddit.searchSubreddit(sub.name, searchTerms, { limit: 10, time: 'week' });
      for (const p of posts) {
        candidates.push({
          id: `reddit:${p.id}`, source: 'reddit', external_id: p.id,
          title: `r/${p.subreddit}: ${p.title}`, url: p.url,
          snippet: p.selftext || `(link post, ${p.numComments} comments, score ${p.score})`,
        });
      }
    } catch (err) {
      console.error(`Reddit scan failed for r/${sub.name}:`, err.message);
    }
  }

  // Drop items already in the queue
  const seen = db.prepare('SELECT source, external_id FROM surveillance_items WHERE project_id = ?').all(project.id);
  const seenKeys = new Set(seen.map((s) => `${s.source}:${s.external_id}`));
  const fresh = candidates.filter((c) => !seenKeys.has(`${c.source}:${c.external_id}`));
  if (fresh.length === 0) return { scanned: candidates.length, flagged: 0 };

  const triage = await triageSurveillance({ decision: project.decision, items: fresh });
  const byId = new Map(triage.items.map((t) => [t.id, t]));

  const insert = db.prepare(`
    INSERT OR IGNORE INTO surveillance_items
      (project_id, source, external_id, title, url, snippet, relevance, why_flagged, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `);
  let flagged = 0;
  for (const c of fresh) {
    const t = byId.get(c.id);
    if (!t || !t.flag) continue;
    insert.run(project.id, c.source, c.external_id, c.title, c.url, (c.snippet || '').slice(0, 2000), t.relevance, t.whyFlagged);
    flagged++;
  }

  db.prepare('UPDATE projects SET last_surveil_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);
  return { scanned: candidates.length, fresh: fresh.length, flagged };
}

async function runAll() {
  const live = db.prepare("SELECT * FROM projects WHERE stage = 'production'").all();
  const results = [];
  for (const project of live) {
    try {
      const r = await scanProject(project);
      results.push({ project: project.title, ...r });
    } catch (err) {
      console.error(`Surveillance failed for project ${project.id}:`, err.message);
      results.push({ project: project.title, error: err.message });
    }
  }
  return results;
}

// In-process weekly schedule. On Render, also expose POST /api/surveillance/run
// for an external cron job, since free instances sleep.
function startScheduler() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    runAll().then((r) => console.log('Weekly surveillance:', JSON.stringify(r)));
  }, WEEK);
}

module.exports = { scanProject, runAll, startScheduler };
