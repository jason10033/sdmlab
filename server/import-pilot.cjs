// Imports prior PrEP SDM content (DECIDE and sdm-sexual-health projects) into a
// project as ready intake materials. No AI needed; the JSON content is used
// directly as trusted source material at generation time.
// Usage: node import-pilot.cjs [projectId]   (default: first project)
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SOURCES = [
  {
    label: 'DECIDE (PrEP options counseling tool)',
    dir: path.join(__dirname, '..', '..', 'DECIDE', 'src', 'content'),
  },
  {
    label: 'sdm-sexual-health (TRUST STI toolkit)',
    dir: path.join(__dirname, '..', '..', 'TRUST_STI_Claude', 'sdm-sexual-health', 'src', 'content'),
  },
];

const projectId = process.argv[2]
  ? Number(process.argv[2])
  : db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get()?.id;

if (!projectId) {
  console.error('No project found. Create a project first, then re-run.');
  process.exit(1);
}

const insert = db.prepare(
  "INSERT INTO materials (project_id, kind, label, content_text, status) VALUES (?, 'text', ?, ?, 'ready')"
);
const exists = db.prepare(
  "SELECT 1 FROM materials WHERE project_id = ? AND label = ?"
);

let added = 0;
for (const source of SOURCES) {
  if (!fs.existsSync(source.dir)) {
    console.warn(`Skipping (not found): ${source.dir}`);
    continue;
  }
  for (const file of fs.readdirSync(source.dir).filter((f) => f.endsWith('.json'))) {
    const label = `${source.label}: ${file}`;
    if (exists.get(projectId, label)) continue;
    const content = fs.readFileSync(path.join(source.dir, file), 'utf8');
    insert.run(projectId, label, `Source: prior clinical SDM tool content (JSON).\n\n${content}`);
    added++;
  }
}

db.prepare('INSERT INTO revisions (project_id, stage, action, note) VALUES (?, ?, ?, ?)')
  .run(projectId, 'intake', 'material_added', `Imported ${added} prior-content files from DECIDE and sdm-sexual-health`);

console.log(`Imported ${added} content files into project ${projectId}.`);
