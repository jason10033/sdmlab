const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const surveillance = require('../services/surveillance');

const router = express.Router();

// Dashboard queue across all projects in the org.
router.get('/', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT si.*, p.title AS project_title, p.slug AS project_slug
    FROM surveillance_items si JOIN projects p ON p.id = si.project_id
    WHERE p.org_id = ?
    ORDER BY CASE si.status WHEN 'new' THEN 0 ELSE 1 END,
             CASE si.relevance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
             si.found_at DESC
  `).all(req.user.org_id);
  const feedback = db.prepare(`
    SELECT pf.*, p.title AS project_title
    FROM public_feedback pf JOIN projects p ON p.id = pf.project_id
    WHERE p.org_id = ? ORDER BY pf.created_at DESC LIMIT 100
  `).all(req.user.org_id);
  res.json({ items, feedback });
});

router.patch('/items/:itemId', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'reviewed', 'incorporated', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE surveillance_items SET status = ? WHERE id = ?').run(status, req.params.itemId);
  res.json({ ok: true });
});

router.patch('/feedback/:feedbackId', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'reviewed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE public_feedback SET status = ? WHERE id = ?').run(status, req.params.feedbackId);
  res.json({ ok: true });
});

// Manual run from the dashboard (and external cron via CRON_SECRET).
// Runs as a background job: real-AI triage exceeds proxy timeouts in one request.
let runJob = { status: 'idle' };

function startRun(res) {
  if (runJob.status === 'running') return res.status(409).json({ error: 'A scan is already running' });
  runJob = { status: 'running', startedAt: new Date().toISOString() };
  setImmediate(async () => {
    try {
      const results = await surveillance.runAll();
      runJob = { status: 'done', results };
    } catch (err) {
      runJob = { status: 'error', error: err.message };
    }
  });
  res.json({ ok: true, status: 'running' });
}

router.post('/run', (req, res) => {
  const auth = req.headers.authorization || '';
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (cronOk) return startRun(res);
  return requireAuth(req, res, () => startRun(res));
});

router.get('/run/status', requireAuth, (req, res) => res.json(runJob));

module.exports = router;
