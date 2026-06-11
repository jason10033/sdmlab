const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'sdmlab.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS orgs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id        INTEGER NOT NULL DEFAULT 1,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'builder',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES orgs(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL DEFAULT 1,
    title            TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    decision         TEXT NOT NULL,
    stage            TEXT NOT NULL DEFAULT 'scope',
    pubmed_query     TEXT,
    interview_json   TEXT,
    provider_target  INTEGER NOT NULL DEFAULT 5,
    patient_target   INTEGER NOT NULL DEFAULT 10,
    live_at          DATETIME,
    last_surveil_at  DATETIME,
    created_by       INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES orgs(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS materials (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL,
    kind         TEXT NOT NULL,
    label        TEXT,
    url          TEXT,
    file_path    TEXT,
    mime         TEXT,
    content_text TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    error        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    source      TEXT NOT NULL,
    external_id TEXT,
    title       TEXT NOT NULL,
    abstract    TEXT,
    journal     TEXT,
    year        TEXT,
    url         TEXT,
    tags        TEXT,
    summary     TEXT,
    status      TEXT NOT NULL DEFAULT 'flagged',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, source, external_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subreddits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name       TEXT NOT NULL,
    rationale  TEXT,
    subscribers INTEGER,
    approved   INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tool_versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL,
    version       INTEGER NOT NULL,
    content_json  TEXT NOT NULL,
    training_json TEXT,
    note          TEXT,
    created_by    INTEGER,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, version),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS review_invites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL,
    token        TEXT NOT NULL UNIQUE,
    audience     TEXT NOT NULL,
    label        TEXT,
    completed_at DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS review_feedback (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL,
    invite_id    INTEGER,
    audience     TEXT NOT NULL,
    responses    TEXT,
    comment      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (invite_id) REFERENCES review_invites(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS public_feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    audience   TEXT NOT NULL DEFAULT 'patient',
    rating     INTEGER,
    helped     TEXT,
    comment    TEXT,
    status     TEXT NOT NULL DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS surveillance_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    source      TEXT NOT NULL,
    external_id TEXT,
    title       TEXT NOT NULL,
    url         TEXT,
    snippet     TEXT,
    relevance   TEXT,
    why_flagged TEXT,
    status      TEXT NOT NULL DEFAULT 'new',
    found_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, source, external_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS revisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    stage      TEXT,
    action     TEXT NOT NULL,
    note       TEXT,
    user_id    INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    event      TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  INSERT OR IGNORE INTO orgs (id, name) VALUES (1, 'NYC STI/HIV Prevention Training Center');
`);

// ---------------------------------------------------------------------------
// Migrations (idempotent; safe to run on every startup)
// ---------------------------------------------------------------------------

// 1. Map legacy stage names onto the IPDAS development model.
db.exec(`
  UPDATE projects SET stage = 'scope'      WHERE stage = 'intake';
  UPDATE projects SET stage = 'design'     WHERE stage = 'interview';
  UPDATE projects SET stage = 'prototype'  WHERE stage = 'draft';
  UPDATE projects SET stage = 'alpha'      WHERE stage IN ('provider_review', 'patient_review');
  UPDATE projects SET stage = 'production' WHERE stage = 'live';
`);

// 2. Add columns that may not exist on older databases.
function addColumn(table, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch (e) { /* already exists */ }
}
addColumn('review_invites', "stage TEXT");
addColumn('projects', "beta_at DATETIME");
addColumn('projects', "beta_target INTEGER NOT NULL DEFAULT 10");
addColumn('projects', "last_reviewed_at DATETIME");
addColumn('projects', "parent_project_id INTEGER");
addColumn('projects', "repo_published INTEGER NOT NULL DEFAULT 0");
addColumn('projects', "repo_published_at DATETIME");
addColumn('projects', "mod_reasons TEXT");
addColumn('projects', "mod_note TEXT");
addColumn('projects', "search_queries TEXT");
addColumn('users', "institution TEXT");
addColumn('users', "title TEXT");

// Ensure a site superadmin exists: promote the original seeded account if none.
if (!db.prepare("SELECT 1 FROM users WHERE role = 'superadmin'").get()) {
  db.exec("UPDATE users SET role = 'superadmin' WHERE id = (SELECT MIN(id) FROM users)");
}

// 3. Unified evaluations table: instrument-based evals from invite links
//    (alpha) and in-tool field testing (beta), with validated-scale data.
db.exec(`
  CREATE TABLE IF NOT EXISTS evaluations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    stage       TEXT NOT NULL,
    audience    TEXT NOT NULL,
    source      TEXT NOT NULL,
    invite_id   INTEGER,
    instruments TEXT,
    comment     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (invite_id) REFERENCES review_invites(id) ON DELETE SET NULL
  );
`);

module.exports = db;
