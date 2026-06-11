const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createSession, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = createSession(user.id);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Open self-registration: creates the user's own workspace (org = their institution).
router.post('/register', (req, res) => {
  const { name, email, password, institution, title } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const cleanEmail = String(email).toLowerCase().trim();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(400).json({ error: 'An account with that email already exists' });
  }
  const orgInfo = db.prepare('INSERT INTO orgs (name) VALUES (?)').run(institution || `${name}'s workspace`);
  const userInfo = db.prepare('INSERT INTO users (org_id, email, name, password_hash, role, institution, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orgInfo.lastInsertRowid, cleanEmail, name, hashPassword(password), 'admin', institution || null, title || null);
  const token = createSession(userInfo.lastInsertRowid);
  res.json({ token, user: { id: userInfo.lastInsertRowid, email: cleanEmail, name, role: 'admin' } });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT id, email, name, role, institution, title, org_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: profile });
});

// Update own profile.
router.put('/profile', requireAuth, (req, res) => {
  const { name, institution, title } = req.body || {};
  db.prepare('UPDATE users SET name = COALESCE(?, name), institution = COALESCE(?, institution), title = COALESCE(?, title) WHERE id = ?')
    .run(name ?? null, institution ?? null, title ?? null, req.user.id);
  if (institution) db.prepare('UPDATE orgs SET name = ? WHERE id = ?').run(institution, req.user.org_id);
  res.json({ ok: true });
});

// Admin: add PTC staff accounts
router.post('/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name, password required' });
  try {
    const info = db.prepare('INSERT INTO users (org_id, email, name, password_hash) VALUES (?, ?, ?, ?)')
      .run(req.user.org_id, String(email).toLowerCase().trim(), name, hashPassword(password));
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Email already in use' });
  }
});

router.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE org_id = ?').all(req.user.org_id);
  res.json(users);
});

router.post('/change-password', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
