const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { STAGES, STAGE_INFO } = require('../ipdas');

const router = express.Router();

function requireSuperadmin(req, res, next) {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Site admin only' });
  next();
}

router.use(requireAuth, requireSuperadmin);

// Site-wide overview: every project, its stage, last activity, and time between
// stages (derived from stage-change revisions), plus usage totals.
router.get('/overview', (req, res) => {
  const projects = db.prepare(`
    SELECT p.id, p.title, p.slug, p.stage, p.created_at, p.updated_at, p.repo_published, p.last_reviewed_at,
           o.name AS institution, u.name AS owner_name, u.email AS owner_email
    FROM projects p JOIN orgs o ON o.id = p.org_id
    LEFT JOIN users u ON u.id = p.created_by
    ORDER BY p.updated_at DESC
  `).all();

  // Stage entry timestamps from the audit trail, to measure time between stages.
  const withTimings = projects.map((p) => {
    const changes = db.prepare(`
      SELECT stage, MIN(created_at) AS entered FROM revisions
      WHERE project_id = ? AND action IN ('created', 'stage_change', 'stage_change_override')
      GROUP BY stage
    `).all(p.id);
    const entered = {};
    for (const c of changes) entered[c.stage] = c.entered;
    // Durations between consecutive reached stages (days).
    const durations = {};
    const reached = STAGES.filter((s) => entered[s]).sort((a, b) => new Date(entered[a]) - new Date(entered[b]));
    for (let i = 1; i < reached.length; i++) {
      const days = (new Date(entered[reached[i]]) - new Date(entered[reached[i - 1]])) / 86400000;
      durations[`${reached[i - 1]}->${reached[i]}`] = Math.round(days * 10) / 10;
    }
    return { ...p, stageEntered: entered, stageDurations: durations };
  });

  const counts = {
    projects: projects.length,
    byStage: Object.fromEntries(STAGES.map((s) => [s, projects.filter((p) => p.stage === s).length])),
    published: projects.filter((p) => p.repo_published).length,
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    institutions: db.prepare('SELECT COUNT(*) AS n FROM orgs').get().n,
    evaluations: db.prepare('SELECT COUNT(*) AS n FROM evaluations').get().n,
    toolViews: db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE event = 'view'").get().n,
  };

  // Median days per stage transition across all projects.
  const allDurations = {};
  for (const p of withTimings) {
    for (const [k, v] of Object.entries(p.stageDurations)) {
      (allDurations[k] = allDurations[k] || []).push(v);
    }
  }
  const medianDurations = Object.fromEntries(Object.entries(allDurations).map(([k, arr]) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return [k, Math.round(median * 10) / 10];
  }));

  res.json({ counts, projects: withTimings, medianDurations, stageInfo: STAGE_INFO });
});

module.exports = router;
