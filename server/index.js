const fs = require('fs');
const path = require('path');

// Load server/.env if present (KEY=VALUE lines; never overrides real env vars).
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const express = require('express');
const cors = require('cors');

require('./db');
const { seedAdmin } = require('./auth');
const surveillance = require('./services/surveillance');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const projects = require('./routes/projects');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', projects.router);
app.use('/api/projects', require('./routes/materials'));
app.use('/api/projects', require('./routes/evidence'));
app.use('/api/projects', require('./routes/generate'));
app.use('/api/projects', require('./routes/reviews'));
app.use('/api', require('./routes/reviews')); // exposes /api/review/:token (public)
app.use('/api/public', require('./routes/public'));
app.use('/api/surveillance', require('./routes/surveillance'));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  aiConfigured: !!process.env.ANTHROPIC_API_KEY,
  mockMode: !process.env.ANTHROPIC_API_KEY && process.env.MOCK_AI === '1',
  redditConfigured: require('./services/reddit').redditConfigured(),
}));

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

seedAdmin();
surveillance.startScheduler();

app.listen(PORT, () => console.log(`SDMLab server running on port ${PORT}`));
