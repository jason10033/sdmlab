const express = require('express');
const db = require('../db');

const router = express.Router();

// Live tool content for patients and providers. No login, no identifiers stored.
router.get('/tool/:slug', (req, res) => {
  const project = db.prepare("SELECT id, title, decision, stage FROM projects WHERE slug = ?").get(req.params.slug);
  if (!project || project.stage !== 'live') return res.status(404).json({ error: 'Tool not found or not yet published' });
  const version = db.prepare('SELECT content_json, training_json, version FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(project.id);
  if (!version) return res.status(404).json({ error: 'Tool not found' });
  db.prepare("INSERT INTO analytics_events (project_id, event) VALUES (?, 'view')").run(project.id);
  res.json({
    title: project.title,
    decision: project.decision,
    content: JSON.parse(version.content_json),
    training: version.training_json ? JSON.parse(version.training_json) : null,
    version: version.version,
  });
});

// Aggregate analytics only: event name + timestamp, nothing else.
router.post('/tool/:slug/event', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const event = String(req.body?.event || '');
  if (!['complete', 'print', 'guide_view'].includes(event)) return res.status(400).json({ error: 'Unknown event' });
  db.prepare('INSERT INTO analytics_events (project_id, event) VALUES (?, ?)').run(project.id, event);
  res.json({ ok: true });
});

// Anonymous in-tool feedback.
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

module.exports = router;
