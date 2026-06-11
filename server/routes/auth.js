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

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

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
