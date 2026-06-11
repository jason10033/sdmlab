const express = require('express');
const cors = require('cors');
const path = require('path');

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

app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: !!process.env.ANTHROPIC_API_KEY }));

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

seedAdmin();
surveillance.startScheduler();

app.listen(PORT, () => console.log(`SDMLab server running on port ${PORT}`));
