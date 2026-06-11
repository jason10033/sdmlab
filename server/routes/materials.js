const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProject, logRevision } = require('./projects');
const { askText, pdfDocument } = require('../services/anthropic');
const { isMock } = require('../services/generator');

const uploadsDir = path.join(process.env.DATA_DIR || __dirname + '/..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = express.Router();
router.use(requireAuth);

const EXTRACT_PROMPT = 'Extract all substantive content from this material for reuse in a shared decision-making tool. Preserve facts, numbers, option descriptions, and patient-facing explanations. Output clean markdown. Omit navigation, headers/footers, and boilerplate.';

async function extractText(material) {
  if (material.kind === 'text') return material.content_text;

  if (material.kind === 'url') {
    const res = await fetch(material.url, { headers: { 'User-Agent': 'SDMLab/0.1' } });
    if (!res.ok) throw new Error(`Could not fetch URL (${res.status})`);
    const html = (await res.text()).slice(0, 400000);
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150000);
    // Fallback mode: keep the raw page text without AI cleanup.
    if (isMock()) return stripped;
    return askText({ prompt: `${EXTRACT_PROMPT}\n\nPage text:\n${stripped}`, maxTokens: 16000 });
  }

  if (material.kind === 'file') {
    const buf = fs.readFileSync(material.file_path);
    const ext = (material.label || '').toLowerCase();
    if (material.mime === 'application/pdf' || ext.endsWith('.pdf')) {
      if (isMock()) throw new Error('PDF extraction requires the AI key. Convert to TXT/MD, or add the key.');
      return askText({
        prompt: EXTRACT_PROMPT,
        documents: [pdfDocument(buf.toString('base64'), material.label)],
        maxTokens: 32000,
      });
    }
    if (ext.endsWith('.json') || ext.endsWith('.txt') || ext.endsWith('.md') || (material.mime || '').startsWith('text/') || material.mime === 'application/json') {
      return buf.toString('utf8').slice(0, 300000);
    }
    throw new Error('Unsupported file type. Use PDF, TXT, MD, or JSON (convert Word docs to PDF first).');
  }
  throw new Error('Unknown material kind');
}

router.get('/:id/materials', getProject, (req, res) => {
  const rows = db.prepare('SELECT id, kind, label, url, mime, status, error, created_at, length(content_text) AS chars FROM materials WHERE project_id = ? ORDER BY created_at').all(req.project.id);
  res.json(rows);
});

router.post('/:id/materials/file', getProject, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const info = db.prepare('INSERT INTO materials (project_id, kind, label, file_path, mime) VALUES (?, ?, ?, ?, ?)')
    .run(req.project.id, 'file', req.file.originalname, req.file.path, req.file.mimetype);
  processMaterial(info.lastInsertRowid);
  logRevision(req.project.id, 'scope', 'material_added', req.file.originalname, req.user.id);
  res.json({ id: info.lastInsertRowid });
});

router.post('/:id/materials/url', getProject, (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Valid http(s) URL required' });
  const info = db.prepare('INSERT INTO materials (project_id, kind, label, url) VALUES (?, ?, ?, ?)')
    .run(req.project.id, 'url', url, url);
  processMaterial(info.lastInsertRowid);
  logRevision(req.project.id, 'scope', 'material_added', url, req.user.id);
  res.json({ id: info.lastInsertRowid });
});

router.post('/:id/materials/text', getProject, (req, res) => {
  const { label, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const info = db.prepare("INSERT INTO materials (project_id, kind, label, content_text, status) VALUES (?, 'text', ?, ?, 'ready')")
    .run(req.project.id, label || 'Pasted text', text);
  logRevision(req.project.id, 'scope', 'material_added', label || 'Pasted text', req.user.id);
  res.json({ id: info.lastInsertRowid });
});

router.delete('/:id/materials/:materialId', getProject, (req, res) => {
  db.prepare('DELETE FROM materials WHERE id = ? AND project_id = ?').run(req.params.materialId, req.project.id);
  res.json({ ok: true });
});

router.get('/:id/materials/:materialId', getProject, (req, res) => {
  const m = db.prepare('SELECT * FROM materials WHERE id = ? AND project_id = ?').get(req.params.materialId, req.project.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

// Async extraction so uploads return immediately; client polls status.
function processMaterial(materialId) {
  setImmediate(async () => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);
    if (!material) return;
    try {
      const text = await extractText(material);
      db.prepare("UPDATE materials SET content_text = ?, status = 'ready', error = NULL WHERE id = ?").run(text, materialId);
    } catch (err) {
      db.prepare("UPDATE materials SET status = 'error', error = ? WHERE id = ?").run(err.message, materialId);
    }
  });
}

module.exports = router;
