const express = require('express');
const db = require('../db');
const { evalBundle } = require('./reviews');

const router = express.Router();

// Tool content for patients and providers. Served at beta (field testing) and
// production. No login, no identifiers stored.
router.get('/tool/:slug', (req, res) => {
  const project = db.prepare('SELECT id, title, decision, stage, last_reviewed_at FROM projects WHERE slug = ?').get(req.params.slug);
  if (!project || !['beta', 'production'].includes(project.stage)) {
    return res.status(404).json({ error: 'Tool not found or not yet published' });
  }
  const version = db.prepare('SELECT content_json, training_json, version FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(project.id);
  if (!version) return res.status(404).json({ error: 'Tool not found' });
  db.prepare("INSERT INTO analytics_events (project_id, event) VALUES (?, 'view')").run(project.id);
  res.json({
    title: project.title,
    decision: project.decision,
    stage: project.stage,
    isBeta: project.stage === 'beta',
    lastReviewedAt: project.last_reviewed_at,
    content: JSON.parse(version.content_json),
    training: version.training_json ? JSON.parse(version.training_json) : null,
    version: version.version,
    // Field-testing eval instruments (patient set; provider can switch in the UI).
    evaluation: project.stage === 'beta'
      ? { patient: evalBundle('beta', 'patient'), provider: evalBundle('beta', 'provider') }
      : null,
  });
});

// Aggregate analytics only: event name + timestamp, nothing else.
router.post('/tool/:slug/event', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const event = String(req.body?.event || '');
  if (!['complete', 'print', 'guide_view', 'share'].includes(event)) return res.status(400).json({ error: 'Unknown event' });
  db.prepare('INSERT INTO analytics_events (project_id, event) VALUES (?, ?)').run(project.id, event);
  res.json({ ok: true });
});

// Anonymous in-tool feedback (production quick rating).
router.post('/tool/:slug/feedback', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const { audience, rating, helped, comment } = req.body || {};
  const aud = audience === 'provider' ? 'provider' : 'patient';
  const r = Number(rating);
  db.prepare('INSERT INTO public_feedback (project_id, audience, rating, helped, comment) VALUES (?, ?, ?, ?, ?)')
    .run(project.id, aud, Number.isFinite(r) ? Math.max(1, Math.min(5, r)) : null,
      helped ? String(helped).slice(0, 50) : null, comment ? String(comment).slice(0, 4000) : null);
  res.json({ ok: true });
});

// Beta field-testing evaluation (validated instruments, anonymous, open link).
router.post('/tool/:slug/evaluation', (req, res) => {
  const project = db.prepare('SELECT id, stage FROM projects WHERE slug = ?').get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.stage !== 'beta') return res.status(409).json({ error: 'Evaluations are only collected during beta field testing.' });
  const { audience, instruments, comment } = req.body || {};
  const aud = audience === 'provider' ? 'provider' : 'patient';
  db.prepare('INSERT INTO evaluations (project_id, stage, audience, source, instruments, comment) VALUES (?, ?, ?, ?, ?, ?)')
    .run(project.id, 'beta', aud, 'in_tool', JSON.stringify(instruments || {}), comment ? String(comment).slice(0, 4000) : null);
  res.json({ ok: true });
});

module.exports = router;
