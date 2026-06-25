const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProject, logRevision } = require('./projects');
const { generateTool, generateTraining, isMock } = require('../services/generator');

const router = express.Router();
router.use(requireAuth);

// Generation can take a couple of minutes; run as a tracked job the client polls.
const jobs = new Map(); // projectId -> {status, error}

router.post('/:id/generate', getProject, (req, res) => {
  const projectId = req.project.id;
  const feedback = String(req.body?.feedback || '').trim();
  const stage = req.project.stage;
  if (jobs.get(projectId)?.status === 'running') {
    return res.status(409).json({ error: 'Generation already in progress' });
  }
  jobs.set(projectId, { status: 'running', step: feedback ? 'Revising the decision tool' : 'Drafting the decision tool' });
  res.json({ ok: true, status: 'running' });

  setImmediate(async () => {
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      const materials = db.prepare("SELECT label, content_text FROM materials WHERE project_id = ? AND status = 'ready'").all(projectId);
      const materialsText = materials
        .map((m) => `=== ${m.label} ===\n${(m.content_text || '').slice(0, 60000)}`)
        .join('\n\n')
        .slice(0, 250000);
      const evidence = db.prepare("SELECT * FROM evidence WHERE project_id = ? AND status = 'included'").all(projectId);
      const interview = project.interview_json ? JSON.parse(project.interview_json) : null;
      const options = project.options_json ? JSON.parse(project.options_json) : [];

      // For a revision, base it on the current version + the team's feedback.
      let currentContent = null;
      if (feedback) {
        const cur = db.prepare('SELECT content_json FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(projectId);
        if (cur) currentContent = JSON.parse(cur.content_json);
      }

      const tool = await generateTool({ decision: project.decision, materialsText, evidence, interview, options, feedback, currentContent });
      jobs.set(projectId, { status: 'running', step: 'Writing the training companion' });
      const training = await generateTraining({ decision: project.decision, tool, interview });

      const note = feedback
        ? `Revised per feedback: ${feedback.slice(0, 120)}`
        : (isMock() ? 'Fallback draft (no API key; workflow test only)' : 'AI-generated draft');
      const last = db.prepare('SELECT MAX(version) AS v FROM tool_versions WHERE project_id = ?').get(projectId).v || 0;
      db.prepare('INSERT INTO tool_versions (project_id, version, content_json, training_json, note) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, last + 1, JSON.stringify(tool), JSON.stringify(training), note);
      logRevision(projectId, stage, feedback ? 'revised' : 'generated', `Version ${last + 1} ${feedback ? 'revised' : 'generated'}`, null);
      jobs.set(projectId, { status: 'done' });
    } catch (err) {
      console.error('Generation failed:', err);
      jobs.set(projectId, { status: 'error', error: err.message });
    }
  });
});

router.get('/:id/generate/status', getProject, (req, res) => {
  res.json(jobs.get(req.project.id) || { status: 'idle' });
});

router.get('/:id/versions', getProject, (req, res) => {
  const rows = db.prepare('SELECT id, version, note, created_at FROM tool_versions WHERE project_id = ? ORDER BY version DESC').all(req.project.id);
  res.json(rows);
});

router.get('/:id/versions/latest', getProject, (req, res) => {
  const row = db.prepare('SELECT * FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(req.project.id);
  if (!row) return res.status(404).json({ error: 'No versions yet' });
  res.json({
    id: row.id, version: row.version, note: row.note, created_at: row.created_at,
    content: JSON.parse(row.content_json),
    training: row.training_json ? JSON.parse(row.training_json) : null,
  });
});

router.get('/:id/versions/:version', getProject, (req, res) => {
  const row = db.prepare('SELECT * FROM tool_versions WHERE project_id = ? AND version = ?').get(req.project.id, req.params.version);
  if (!row) return res.status(404).json({ error: 'Version not found' });
  res.json({
    id: row.id, version: row.version, note: row.note, created_at: row.created_at,
    content: JSON.parse(row.content_json),
    training: row.training_json ? JSON.parse(row.training_json) : null,
  });
});

// Restore an old version by copying it forward as a new version.
router.post('/:id/versions/:version/restore', getProject, (req, res) => {
  const row = db.prepare('SELECT * FROM tool_versions WHERE project_id = ? AND version = ?').get(req.project.id, req.params.version);
  if (!row) return res.status(404).json({ error: 'Version not found' });
  const last = db.prepare('SELECT MAX(version) AS v FROM tool_versions WHERE project_id = ?').get(req.project.id).v || 0;
  db.prepare('INSERT INTO tool_versions (project_id, version, content_json, training_json, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.project.id, last + 1, row.content_json, row.training_json, `Restored from version ${row.version}`, req.user.id);
  logRevision(req.project.id, req.project.stage, 'restored', `Version ${row.version} restored as v${last + 1}`, req.user.id);
  res.json({ version: last + 1 });
});

// Manual edits save as a new version (auditable trail of changes).
router.post('/:id/versions', getProject, (req, res) => {
  const { content, training, note } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const last = db.prepare('SELECT MAX(version) AS v FROM tool_versions WHERE project_id = ?').get(req.project.id).v || 0;
  db.prepare('INSERT INTO tool_versions (project_id, version, content_json, training_json, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.project.id, last + 1, JSON.stringify(content), training ? JSON.stringify(training) : null, note || 'Manual edit', req.user.id);
  logRevision(req.project.id, req.project.stage, 'edited', note || `Version ${last + 1} saved`, req.user.id);
  res.json({ version: last + 1 });
});

module.exports = router;
