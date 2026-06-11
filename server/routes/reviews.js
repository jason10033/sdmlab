const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProject, logRevision } = require('./projects');
const { instrumentsFor } = require('../instruments');

const router = express.Router();

// Open-ended questions shown alongside the validated instruments, by audience.
const OPEN_QUESTIONS = {
  provider: [
    { id: 'accuracy', label: 'Is the clinical content accurate and current?', type: 'scale' },
    { id: 'usability', label: 'Could you realistically use this during a visit?', type: 'scale' },
    { id: 'missing', label: 'What is missing or should change before patients see this?', type: 'text' },
  ],
  patient: [
    { id: 'respect', label: 'Did it feel respectful of you and your situation?', type: 'scale' },
    { id: 'confusing', label: 'Was anything confusing, missing, or off-putting?', type: 'text' },
  ],
};

function evalBundle(stage, audience) {
  return {
    instruments: instrumentsFor(stage, audience),
    openQuestions: OPEN_QUESTIONS[audience] || [],
  };
}

// ---- Authenticated builder endpoints ----

// Create single-use evaluation links (used for alpha; also available in beta).
router.post('/:id/invites', requireAuth, getProject, (req, res) => {
  const { audience, count = 1, label, stage } = req.body || {};
  if (!['provider', 'patient'].includes(audience)) return res.status(400).json({ error: 'audience must be provider or patient' });
  const evalStage = stage || req.project.stage;
  const created = [];
  for (let i = 0; i < Math.min(count, 25); i++) {
    const token = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO review_invites (project_id, token, audience, label, stage) VALUES (?, ?, ?, ?, ?)')
      .run(req.project.id, token, audience, label || null, evalStage);
    created.push(token);
  }
  logRevision(req.project.id, evalStage, 'invites_created', `${created.length} ${audience} evaluation link(s)`, req.user.id);
  res.json({ tokens: created });
});

router.get('/:id/invites', requireAuth, getProject, (req, res) => {
  res.json(db.prepare('SELECT * FROM review_invites WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id));
});

// All evaluations for the builder, with instrument data parsed.
router.get('/:id/feedback', requireAuth, getProject, (req, res) => {
  const rows = db.prepare('SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id);
  res.json(rows.map((r) => ({ ...r, instruments: r.instruments ? JSON.parse(r.instruments) : null })));
});

// ---- Public reviewer endpoints (token-based, no login) ----
router.get('/review/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM review_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid evaluation link' });
  const project = db.prepare('SELECT id, title, decision FROM projects WHERE id = ?').get(invite.project_id);
  const version = db.prepare('SELECT content_json, version FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(invite.project_id);
  if (!version) return res.status(404).json({ error: 'No draft available to evaluate yet' });
  const stage = invite.stage || 'alpha';
  res.json({
    audience: invite.audience,
    stage,
    completed: !!invite.completed_at,
    project: { title: project.title, decision: project.decision },
    content: JSON.parse(version.content_json),
    version: version.version,
    ...evalBundle(stage, invite.audience),
  });
});

router.post('/review/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM review_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid evaluation link' });
  if (invite.completed_at) return res.status(409).json({ error: 'This evaluation link was already used' });
  const { instruments, comment } = req.body || {};
  const stage = invite.stage || 'alpha';
  db.prepare('INSERT INTO evaluations (project_id, stage, audience, source, invite_id, instruments, comment) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(invite.project_id, stage, invite.audience, 'invite', invite.id, JSON.stringify(instruments || {}), comment || null);
  db.prepare('UPDATE review_invites SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);
  res.json({ ok: true });
});

module.exports = { router, evalBundle, OPEN_QUESTIONS };
