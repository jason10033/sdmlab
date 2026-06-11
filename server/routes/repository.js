const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Standard adaptation reasons (multi-select). Stored with each contributed fork
// and shown publicly for transparency.
const MOD_REASONS = [
  'Different patient population',
  'Different clinical setting',
  'Local guidelines or protocols',
  'Language or translation',
  'Reading level / health literacy',
  'Cultural tailoring',
  'Added or removed options',
  'Updated evidence',
  'Resource availability or cost context',
  'Other',
];

router.get('/meta', (req, res) => res.json({ reasons: MOD_REASONS }));

// Public repository listing: published production tools with provenance.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.title, p.slug, p.decision, p.repo_published_at, p.last_reviewed_at,
           p.parent_project_id, p.mod_reasons, p.mod_note,
           o.name AS institution,
           u.email AS author_email, u.name AS author_name,
           parent.title AS parent_title, parent.slug AS parent_slug
    FROM projects p
    JOIN orgs o ON o.id = p.org_id
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN projects parent ON parent.id = p.parent_project_id
    WHERE p.repo_published = 1
    ORDER BY p.repo_published_at DESC
  `).all();
  res.json(rows.map((r) => ({ ...r, mod_reasons: r.mod_reasons ? JSON.parse(r.mod_reasons) : null })));
});

// Fork a published tool into the current user's workspace (full editable copy).
router.post('/:slug/fork', requireAuth, (req, res) => {
  const source = db.prepare('SELECT * FROM projects WHERE slug = ? AND repo_published = 1').get(req.params.slug);
  if (!source) return res.status(404).json({ error: 'Published tool not found' });

  // Unique slug in the new workspace.
  function slugify(title) {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 46) || 'tool';
    let slug = `${base}-adapted`; let n = 2;
    while (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) slug = `${base}-adapted-${n++}`;
    return slug;
  }

  const newSlug = slugify(source.title);
  const info = db.prepare(`
    INSERT INTO projects (org_id, title, slug, decision, stage, interview_json, pubmed_query, parent_project_id, created_by)
    VALUES (?, ?, ?, ?, 'prototype', ?, ?, ?, ?)
  `).run(req.user.org_id, `${source.title} (adapted)`, newSlug, source.decision,
    source.interview_json, source.pubmed_query, source.id, req.user.id);
  const newId = info.lastInsertRowid;

  // Copy ready materials, included evidence, and the latest tool version as v1.
  const materials = db.prepare("SELECT label, content_text FROM materials WHERE project_id = ? AND status = 'ready'").all(source.id);
  const insMat = db.prepare("INSERT INTO materials (project_id, kind, label, content_text, status) VALUES (?, 'text', ?, ?, 'ready')");
  for (const m of materials) insMat.run(newId, m.label, m.content_text);

  const evidence = db.prepare("SELECT * FROM evidence WHERE project_id = ? AND status = 'included'").all(source.id);
  const insEv = db.prepare(`INSERT OR IGNORE INTO evidence (project_id, source, external_id, title, abstract, journal, year, url, tags, summary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'included')`);
  for (const e of evidence) insEv.run(newId, e.source, e.external_id, e.title, e.abstract, e.journal, e.year, e.url, e.tags, e.summary);

  const latest = db.prepare('SELECT content_json, training_json FROM tool_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(source.id);
  if (latest) {
    db.prepare('INSERT INTO tool_versions (project_id, version, content_json, training_json, note, created_by) VALUES (?, 1, ?, ?, ?, ?)')
      .run(newId, latest.content_json, latest.training_json, `Adapted from "${source.title}"`, req.user.id);
  }
  db.prepare('INSERT INTO revisions (project_id, stage, action, note, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(newId, 'prototype', 'forked', `Adapted from published tool "${source.title}"`, req.user.id);

  res.json({ id: newId, slug: newSlug });
});

module.exports = { router, MOD_REASONS };
