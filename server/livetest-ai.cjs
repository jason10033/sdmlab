// Drives ONE project through the full REAL-AI pipeline on a live SDMLab instance.
// Usage: node livetest-ai.cjs <baseUrl> <email> <password>
// Costs real Anthropic credits (one evidence scan + one generation, ~$1-2).
const BASE = process.argv[2] || 'https://sdmlab.onrender.com';
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
if (!EMAIL || !PASSWORD) { console.error('Usage: node livetest-ai.cjs <baseUrl> <email> <password>'); process.exit(1); }

let token = '';
async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error || ''}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollScan(id) {
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const s = await api('GET', `/projects/${id}/evidence/scan/status`);
    process.stdout.write(`\r  scan: ${s.status} ${s.step || ''}            `);
    if (s.status === 'done') { console.log(); return s.result; }
    if (s.status === 'error') throw new Error('Scan failed: ' + s.error);
  }
  throw new Error('Scan timed out');
}
async function pollGen(id) {
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const s = await api('GET', `/projects/${id}/generate/status`);
    process.stdout.write(`\r  generate: ${s.status} ${s.step || ''}            `);
    if (s.status === 'done') { console.log(); return; }
    if (s.status === 'error') throw new Error('Generation failed: ' + s.error);
  }
  throw new Error('Generation timed out');
}

(async () => {
  console.log(`Real-AI pipeline test against ${BASE}\n`);
  ({ token } = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD }));
  console.log('1. Logged in.');

  const decision = 'Choosing an HIV PrEP option: daily oral pill, on-demand (2-1-1) dosing, 2-month injectable cabotegravir, 6-month injectable lenacapavir, or not starting PrEP now.';
  const p = await api('POST', '/projects', { title: 'AI Live Test - PrEP', decision });
  console.log(`2. Created project ${p.id} (${p.slug}).`);

  await api('POST', `/projects/${p.id}/materials/text`, { label: 'Seed', text: 'Oral PrEP is a daily pill, >99% effective when taken daily. Injectable cabotegravir is given every 2 months. Lenacapavir is given every 6 months.' });
  console.log('3. Added seed material.');

  console.log('4. Running REAL literature scan (PubMed + AI screening)...');
  const scan = await api('POST', `/projects/${p.id}/evidence/scan`);
  const scanResult = await pollScan(p.id);
  console.log(`   -> ${scanResult.found} found, ${scanResult.flagged} flagged. Surveillance query: "${scanResult.surveillanceQuery}"`);

  const evidence = await api('GET', `/projects/${p.id}/evidence`);
  for (const e of evidence.slice(0, 5)) await api('PATCH', `/projects/${p.id}/evidence/${e.id}`, { status: 'included' });
  console.log(`5. Included ${Math.min(5, evidence.length)} evidence items.`);

  await api('PUT', `/projects/${p.id}/interview`, { population: 'Sexual health clinic patients, NYC', values: 'privacy, convenience', concerns: 'side effects', barriers: 'insurance', literacy: 'plain language', workflow: 'during visit', emphasis: 'switching is fine' });
  console.log('6. Saved interview.');

  console.log('7. Running REAL tool generation...');
  await api('POST', `/projects/${p.id}/generate`);
  await pollGen(p.id);
  const v = await api('GET', `/projects/${p.id}/versions/latest`);
  const opt = v.content.options[0];
  const placeholder = JSON.stringify(v.content).includes('FALLBACK');
  console.log(`   -> v${v.version}: "${v.content.title}", ${v.content.options.length} options, ${v.content.citations.length} citations`);
  console.log(`   -> first option: "${opt.name}" - effectiveness: ${opt.effectiveness.text.slice(0, 90)}...`);
  console.log(`   -> contains placeholder text: ${placeholder ? 'YES (PROBLEM)' : 'no (real content)'}`);
  console.log(`   -> training companion: ${v.training ? 'generated' : 'MISSING'}`);

  console.log(`\nDONE. Review the generated tool, then delete with:`);
  console.log(`  DELETE /projects/${p.id}  (or via the volume-test cleanup)`);
  console.log(`Project id: ${p.id}`);
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
