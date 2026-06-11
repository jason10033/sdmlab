const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProject, logRevision } = require('./projects');

const router = express.Router();

// Structured questions shown to reviewers, by audience.
const REVIEW_QUESTIONS = {
  provider: [
    { id: 'accuracy', label: 'Is the clinical content accurate and current?', type: 'scale' },
    { id: 'balance', label: 'Are the options presented in a balanced way, without steering?', type: 'scale' },
    { id: 'usability', label: 'Could you realistically use this during a visit?', type: 'scale' },
    { id: 'language', label: 'Is the language appropriate for your patients?', type: 'scale' },
    { id: 'missing', label: 'What is missing or should change before patients see this?', type: 'text' },
  ],
  patient: [
    { id: 'clarity', label: 'Was this easy to understand?', type: 'scale' },
    { id: 'respect', label: 'Did it feel respectful of you and your situation?', type: 'scale' },
    { id: 'helpful', label: 'Did it help you think about what matters to you?', type: 'scale' },
    { id: 'length', label: 'Was the length about right?', type: 'scale' },
    { id: 'confusing', label: 'Was anything confusing, missing, or off-putting?', type: 'text' },
  ],
};

// ---- Authenticated builder endpoints ----
router.post('/:id/invites', requireAuth, getProject, (req, res) => {
  const { audience, count = 1, label } = req.body || {};
  if (!['provider', 'patient'].includes(audience)) return res.status(400).json({ error: 'audience must be provider or patient' });
  const created = [];
  for (let i = 0; i < Math.min(count, 25); i++) {
    const token = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO review_invites (project_id, token, audience, label) VALUES (?, ?, ?, ?)')
      .run(req.project.id, token, audience, label || null);
    created.push(token);
  }
  logRevision(req.project.id, req.project.stage, 'invites_created', `${created.length} ${audience} review link(s)`, req.user.id);
  res.json({ tokens: created });
});

router.get('/:id/invites', requireAuth, getProject, (req, res) => {
  res.json(db.prepare('SELECT * FROM review_invites WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id));
});

router.get('/:id/feedback', requireAuth, getProject, (req, res) => {
  const rows = db.prepare('SELECT * FROM review_feedback WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id);
  res.json(rows.map((r) => ({ ...r, responses: r.responses ? JSON.parse(r.responses) : null })));
});

// ---- Public reviewer endpoints (token-based, no login) ----
router.get('/review/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM review_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid review link' });
  const project = db.prepare('SELECT id, title, decision FROM projects WHERE id = ?').get(invite.project_id);
  const version = db.prepare('SELECT content_json, version FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(invite.project_id);
  if (!version) return res.status(404).json({ error: 'No draft available to review yet' });
  res.json({
    audience: invite.audience,
    completed: !!invite.completed_at,
    project: { title: project.title, decision: project.decision },
    content: JSON.parse(version.content_json),
    version: version.version,
    questions: REVIEW_QUESTIONS[invite.audience],
  });
});

router.post('/review/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM review_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid review link' });
  if (invite.completed_at) return res.status(409).json({ error: 'This review link was already used' });
  const { responses, comment } = req.body || {};
  db.prepare('INSERT INTO review_feedback (project_id, invite_id, audience, responses, comment) VALUES (?, ?, ?, ?, ?)')
    .run(invite.project_id, invite.id, invite.audience, JSON.stringify(responses || {}), comment || null);
  db.prepare('UPDATE review_invites SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);
  res.json({ ok: true });
});

module.exports = router;
