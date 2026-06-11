const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { INTERVIEW_QUESTIONS } = require('../services/generator');

const router = express.Router();
router.use(requireAuth);

const STAGES = ['intake', 'evidence', 'interview', 'draft', 'provider_review', 'patient_review', 'live'];

function slugify(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'tool';
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) slug = `${base}-${n++}`;
  return slug;
}

function logRevision(projectId, stage, action, note, userId) {
  db.prepare('INSERT INTO revisions (project_id, stage, action, note, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, stage, action, note || null, userId || null);
}

function projectStats(id) {
  const provider = db.prepare("SELECT COUNT(*) AS n FROM review_feedback WHERE project_id = ? AND audience = 'provider'").get(id).n;
  const patient = db.prepare("SELECT COUNT(*) AS n FROM review_feedback WHERE project_id = ? AND audience = 'patient'").get(id).n;
  const versions = db.prepare('SELECT COUNT(*) AS n FROM tool_versions WHERE project_id = ?').get(id).n;
  const materials = db.prepare("SELECT COUNT(*) AS n FROM materials WHERE project_id = ? AND status = 'ready'").get(id).n;
  const evidenceIncluded = db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND status = 'included'").get(id).n;
  const surveillanceNew = db.prepare("SELECT COUNT(*) AS n FROM surveillance_items WHERE project_id = ? AND status = 'new'").get(id).n;
  return { provider, patient, versions, materials, evidenceIncluded, surveillanceNew };
}

router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE org_id = ? ORDER BY updated_at DESC').all(req.user.org_id);
  res.json(projects.map((p) => ({ ...p, stats: projectStats(p.id) })));
});

router.post('/', (req, res) => {
  const { title, decision } = req.body || {};
  if (!title || !decision) return res.status(400).json({ error: 'title and decision required' });
  const info = db.prepare('INSERT INTO projects (org_id, title, slug, decision, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.org_id, title, slugify(title), decision, req.user.id);
  logRevision(info.lastInsertRowid, 'intake', 'created', `Project created: ${title}`, req.user.id);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
});

function getProject(req, res, next) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  req.project = project;
  next();
}

router.get('/:id', getProject, (req, res) => {
  res.json({
    ...req.project,
    interview: req.project.interview_json ? JSON.parse(req.project.interview_json) : null,
    interviewQuestions: INTERVIEW_QUESTIONS,
    stats: projectStats(req.project.id),
    stages: STAGES,
  });
});

router.put('/:id', getProject, (req, res) => {
  const { title, decision, provider_target, patient_target } = req.body || {};
  db.prepare(`
    UPDATE projects SET
      title = COALESCE(?, title),
      decision = COALESCE(?, decision),
      provider_target = COALESCE(?, provider_target),
      patient_target = COALESCE(?, patient_target),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title ?? null, decision ?? null, provider_target ?? null, patient_target ?? null, req.project.id);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.project.id));
});

router.delete('/:id', getProject, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.project.id);
  res.json({ ok: true });
});

// Save population interview answers
router.put('/:id/interview', getProject, (req, res) => {
  db.prepare('UPDATE projects SET interview_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(req.body || {}), req.project.id);
  logRevision(req.project.id, 'interview', 'interview_saved', null, req.user.id);
  res.json({ ok: true });
});

// Lifecycle: advance (or move back) with gate checks; override requires a note.
router.post('/:id/stage', getProject, (req, res) => {
  const { stage, note, override } = req.body || {};
  if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

  const stats = projectStats(req.project.id);
  const gates = [];
  if (stage === 'provider_review' && stats.versions === 0) gates.push('Generate a draft tool before starting provider review.');
  if (stage === 'patient_review' && stats.provider < req.project.provider_target) {
    gates.push(`Provider iteration target not met (${stats.provider}/${req.project.provider_target} structured reviews).`);
  }
  if (stage === 'live' && stats.patient < req.project.patient_target) {
    gates.push(`Patient iteration target not met (${stats.patient}/${req.project.patient_target} reviews).`);
  }
  if (gates.length && !override) return res.status(409).json({ error: 'Gate not met', gates });
  if (gates.length && override && !note) return res.status(400).json({ error: 'Overriding a gate requires a note for the audit trail.' });

  db.prepare(`UPDATE projects SET stage = ?, live_at = CASE WHEN ? = 'live' AND live_at IS NULL THEN CURRENT_TIMESTAMP ELSE live_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(stage, stage, req.project.id);
  logRevision(req.project.id, stage, gates.length ? 'stage_change_override' : 'stage_change',
    note || `Moved to ${stage}`, req.user.id);
  res.json({ ok: true, stage });
});

// Aggregate usage analytics for evaluation: event counts, total and last 30 days.
router.get('/:id/analytics', getProject, (req, res) => {
  const totals = db.prepare(`
    SELECT event, COUNT(*) AS total,
      SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last30
    FROM analytics_events WHERE project_id = ? GROUP BY event
  `).all(req.project.id);
  const byWeek = db.prepare(`
    SELECT strftime('%Y-%W', created_at) AS week, event, COUNT(*) AS n
    FROM analytics_events WHERE project_id = ?
    GROUP BY week, event ORDER BY week
  `).all(req.project.id);
  res.json({ totals, byWeek });
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res, filename, header, rows) {
  const lines = [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\r\n'));
}

// CSV of all structured review feedback plus anonymous in-tool feedback.
router.get('/:id/export/feedback.csv', getProject, (req, res) => {
  const reviews = db.prepare('SELECT * FROM review_feedback WHERE project_id = ? ORDER BY created_at').all(req.project.id);
  const publicFb = db.prepare('SELECT * FROM public_feedback WHERE project_id = ? ORDER BY created_at').all(req.project.id);
  const rows = [];
  for (const r of reviews) {
    const responses = r.responses ? JSON.parse(r.responses) : {};
    rows.push(['structured_review', r.audience, r.created_at, '', '', JSON.stringify(responses), r.comment || '']);
  }
  for (const f of publicFb) {
    rows.push(['in_tool', f.audience, f.created_at, f.rating ?? '', f.helped || '', '', f.comment || '']);
  }
  sendCsv(res, `${req.project.slug}-feedback.csv`,
    ['type', 'audience', 'created_at', 'rating', 'helped', 'responses_json', 'comment'], rows);
});

// CSV of aggregate analytics events.
router.get('/:id/export/analytics.csv', getProject, (req, res) => {
  const events = db.prepare('SELECT event, created_at FROM analytics_events WHERE project_id = ? ORDER BY created_at').all(req.project.id);
  sendCsv(res, `${req.project.slug}-analytics.csv`, ['event', 'created_at'], events.map((e) => [e.event, e.created_at]));
});

// Full project bundle (content versions, evidence, interview, audit trail) for archiving and methods reporting.
router.get('/:id/export/project.json', getProject, (req, res) => {
  const bundle = {
    exportedAt: new Date().toISOString(),
    project: req.project,
    interview: req.project.interview_json ? JSON.parse(req.project.interview_json) : null,
    materials: db.prepare('SELECT id, kind, label, url, status, created_at FROM materials WHERE project_id = ?').all(req.project.id),
    evidence: db.prepare('SELECT * FROM evidence WHERE project_id = ?').all(req.project.id),
    subreddits: db.prepare('SELECT * FROM subreddits WHERE project_id = ?').all(req.project.id),
    versions: db.prepare('SELECT version, note, created_at, content_json, training_json FROM tool_versions WHERE project_id = ? ORDER BY version').all(req.project.id)
      .map((v) => ({ version: v.version, note: v.note, created_at: v.created_at, content: JSON.parse(v.content_json), training: v.training_json ? JSON.parse(v.training_json) : null })),
    revisions: db.prepare('SELECT * FROM revisions WHERE project_id = ? ORDER BY created_at').all(req.project.id),
    surveillance: db.prepare('SELECT * FROM surveillance_items WHERE project_id = ?').all(req.project.id),
  };
  res.setHeader('Content-Disposition', `attachment; filename="${req.project.slug}-export.json"`);
  res.json(bundle);
});

router.get('/:id/revisions', getProject, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.name AS user_name FROM revisions r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.project_id = ? ORDER BY r.created_at DESC
  `).all(req.project.id);
  res.json(rows);
});

module.exports = { router, getProject, logRevision };
