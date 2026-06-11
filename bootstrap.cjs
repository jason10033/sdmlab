const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const serverRoot = path.join(root, 'server');
const clientRoot = path.join(root, 'client');

// Install deps if needed
if (!fs.existsSync(path.join(serverRoot, 'node_modules'))) {
  console.log('Installing server dependencies...');
  execSync('npm install', { cwd: serverRoot, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(clientRoot, 'node_modules', 'vite'))) {
  console.log('Installing client dependencies...');
  execSync('npm install', { cwd: clientRoot, stdio: 'inherit' });
}

// Start Express backend — force PORT=3002 so the preview system's PORT env var doesn't redirect it
console.log('Starting SDMLab API server on port 3002...');
const server = spawn('node', ['index.js'], {
  cwd: serverRoot,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, PORT: '3002' },
});

// Give the backend a moment to initialize, then start Vite
setTimeout(() => {
  console.log('Starting Vite dev server...');
  const vite = spawn('npm', ['run', 'dev'], {
    cwd: clientRoot,
    stdio: 'inherit',
    shell: true,
  });

  vite.on('error', err => { console.error('Vite error:', err); process.exit(1); });
  vite.on('exit', code => process.exit(code ?? 0));
}, 1500);

server.on('error', err => console.error('Server error:', err));
