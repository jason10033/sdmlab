const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const git = '"C:\\Program Files\\Git\\cmd\\git.exe"';
const cwd = __dirname;
const log = [];

function run(cmd) {
  log.push(`> git ${cmd}`);
  try {
    const out = execSync(`${git} ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    if (out.trim()) log.push(out.trim());
  } catch (e) {
    const msg = ((e.stdout || '') + (e.stderr || '')).trim() || e.message;
    log.push('! ' + msg);
  }
}

const msg = process.argv[2] || 'Update SDMLab';
const token = fs.readFileSync(path.join(__dirname, '.github-token'), 'utf8').trim();

run('config user.email "jason10033@github.com"');
run('config user.name "Jason"');
run('add -A');
run(`commit -m "${msg}"`);
run(`remote set-url origin https://${token}@github.com/jason10033/sdmlab.git`);
run('push origin main');
log.push('\n--- Done ---');
log.forEach(l => console.log(l));

http.createServer((req, res) => res.end(log.join('\n'))).listen(9997);
