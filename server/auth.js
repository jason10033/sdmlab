const crypto = require('crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

// Auth middleware: expects Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const row = db.prepare(`
    SELECT u.id, u.org_id, u.email, u.name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return res.status(401).json({ error: 'Session expired' });
  req.user = row;
  req.token = token;
  next();
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@sdmlab.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme';
  db.prepare('INSERT INTO users (org_id, email, name, password_hash, role) VALUES (1, ?, ?, ?, ?)')
    .run(email, 'SDMLab Admin', hashPassword(password), 'admin');
  console.log(`Seeded admin account: ${email}`);
}

module.exports = { hashPassword, verifyPassword, createSession, requireAuth, seedAdmin };
