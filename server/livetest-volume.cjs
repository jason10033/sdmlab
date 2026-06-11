// Volume/load test: drives N projects through the ENTIRE lifecycle on a live
// SDMLab instance using manual content (no AI cost), then cleans everything up.
// Usage: node livetest-volume.cjs <baseUrl> <email> <password> [count]
const BASE = process.argv[2] || 'https://sdmlab.onrender.com';
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const COUNT = Number(process.argv[5] || 100);
const CONCURRENCY = 6;
if (!EMAIL || !PASSWORD) { console.error('Usage: node livetest-volume.cjs <baseUrl> <email> <password> [count]'); process.exit(1); }

let token = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body, { raw = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      // Retry transient gateway errors (Render cold start / proxy).
      if ([502, 503, 504].includes(res.status)) { lastErr = new Error(`HTTP ${res.status}`); await sleep(2500); continue; }
      if (raw) return res;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status}: ${data.error || ''}`); e.status = res.status; throw e; }
      return data;
    } catch (err) {
      if (err.status) throw err; // real HTTP assertion failure, not transient
      lastErr = err; await sleep(2500); // network error
    }
  }
  throw lastErr;
}

// A compact but schema-valid tool content object for manual versions.
function toolContent(i) {
  const opts = [
    { id: 'a', name: 'Option A', tagline: 'First option', summary: 'Summary A.', howItWorks: 'Works by A.', effectiveness: { text: '99 of 100.', citationIds: ['M1'] }, benefits: [{ text: 'Benefit A.', citationIds: ['M1'] }], risks: [{ text: 'Risk A.', citationIds: ['M1'] }], logistics: 'Daily.', goodFitIf: ['Likes routine'], thinkTwiceIf: ['Privacy concern'] },
    { id: 'b', name: 'Option B', tagline: 'Second option', summary: 'Summary B.', howItWorks: 'Works by B.', effectiveness: { text: '98 of 100.', citationIds: ['M1'] }, benefits: [{ text: 'Benefit B.', citationIds: ['M1'] }], risks: [{ text: 'Risk B.', citationIds: ['M1'] }], logistics: 'Every 2 months.', goodFitIf: ['Forgets pills'], thinkTwiceIf: ['Hard to travel'] },
  ];
  return {
    title: `Test Tool ${i}`,
    decisionStatement: `Decision ${i}: choose A or B.`,
    intro: 'This tool helps you choose.',
    options: opts,
    comparison: [{ feature: 'How taken', values: [{ optionId: 'a', value: 'Pill' }, { optionId: 'b', value: 'Shot' }] }],
    valuesQuestions: [
      { id: 'v1', question: 'Pills daily?', helpText: '', answers: [{ label: 'Fine', favors: ['a'], note: '' }, { label: 'Hard', favors: ['b'], note: 'Ask about injectable.' }] },
      { id: 'v2', question: 'Clinic easy?', helpText: '', answers: [{ label: 'Yes', favors: ['b'], note: '' }, { label: 'No', favors: ['a'], note: '' }] },
    ],
    summaryGuidance: 'A conversation starter, not a verdict.',
    faqs: [{ q: 'Is it safe?', a: 'Yes.', citationIds: ['M1'] }],
    glossary: [{ term: 'PrEP', definition: 'Prevention medicine.' }],
    conversationGuide: { steps: [{ title: 'Team talk', script: 'Lets decide together.', tips: [] }] },
    citations: [{ id: 'M1', label: 'Team materials', source: 'material', url: '' }],
  };
}

function instrumentData(audience) {
  if (audience === 'provider') return { ipdasi: { ip_decision: 4, ip_options: 4, ip_balanced: 3, ip_benefits: 4, ip_harms: 4, ip_probabilities: 3, ip_values: 4, ip_evidence: 4, ip_plain: 4 }, open: { accuracy: 4, usability: 5, missing: 'ok' } };
  return { sure: { sure_s: 'Yes', sure_u: 'Yes', sure_r: 'Yes', sure_e: 'Yes' }, prepdm: { pdm_1: 5, pdm_2: 4, pdm_3: 4, pdm_4: 5, pdm_5: 4, pdm_6: 5, pdm_7: 4, pdm_8: 5, pdm_9: 4, pdm_10: 5 }, open: { respect: 5, confusing: 'no' } };
}

async function submitEvals(projectId, audience, n, stage) {
  const { tokens } = await api('POST', `/projects/${projectId}/invites`, { audience, count: n, stage });
  for (const tok of tokens) {
    await api('POST', `/review/${tok}`, { instruments: instrumentData(audience), comment: 'auto' });
  }
}

// One full lifecycle. `gold` projects meet gates legitimately; others override.
async function runProject(i, gold) {
  const p = await api('POST', '/projects', { title: `Vol Test ${i}`, decision: `Test decision ${i}` });
  const id = p.id;
  await api('POST', `/projects/${id}/materials/text`, { label: 'M', text: 'Manual content for option A and B.' });
  await api('POST', `/projects/${id}/versions`, { content: toolContent(i), note: 'manual' });
  await api('POST', `/projects/${id}/stage`, { stage: 'evidence' });
  await api('POST', `/projects/${id}/stage`, { stage: 'design' });
  await api('PUT', `/projects/${id}/interview`, { population: 'test' });
  await api('POST', `/projects/${id}/stage`, { stage: 'prototype' });

  if (gold) {
    // Meet alpha gate legitimately (5 provider + 10 patient validated evals).
    await submitEvals(id, 'provider', 5, 'alpha');
    await submitEvals(id, 'patient', 10, 'alpha');
    await api('POST', `/projects/${id}/stage`, { stage: 'beta' });
    // Meet beta gate (10 field evals via the public endpoint).
    const proj = await api('GET', `/projects/${id}`);
    for (let k = 0; k < proj.beta_target; k++) {
      await api('POST', `/public/tool/${proj.slug}/evaluation`, { audience: 'patient', instruments: instrumentData('patient') });
    }
    await api('POST', `/projects/${id}/stage`, { stage: 'production' });
  } else {
    await api('POST', `/projects/${id}/stage`, { stage: 'alpha', override: true, note: 'volume test' });
    await api('POST', `/projects/${id}/stage`, { stage: 'beta', override: true, note: 'volume test' });
    await api('POST', `/projects/${id}/stage`, { stage: 'production', override: true, note: 'volume test' });
  }
  await api('POST', `/projects/${id}/signoff`, { note: 'reviewed' });
  await api('POST', `/projects/${id}/publish`, {});
  return id;
}

async function pool(items, worker, concurrency) {
  const results = []; let idx = 0;
  async function next() {
    while (idx < items.length) {
      const myIdx = idx++;
      try { results[myIdx] = { ok: true, value: await worker(items[myIdx], myIdx) }; }
      catch (e) { results[myIdx] = { ok: false, error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

(async () => {
  const t0 = Date.now();
  console.log(`Volume test: ${COUNT} projects against ${BASE}\n`);
  ({ token } = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD }));

  // Clean any leftovers from a prior run.
  const existing = await api('GET', '/projects');
  if (existing.length) {
    console.log(`Cleaning ${existing.length} pre-existing projects...`);
    await pool(existing, (p) => api('DELETE', `/projects/${p.id}`), CONCURRENCY);
  }

  const GOLD = Math.min(5, COUNT);
  console.log(`Creating ${COUNT} projects (${GOLD} meeting all gates legitimately, rest via documented override)...`);
  const lcStart = Date.now();
  const results = await pool(Array.from({ length: COUNT }, (_, i) => i), (i) => runProject(i + 1, i < GOLD), CONCURRENCY);
  const lcSecs = (Date.now() - lcStart) / 1000;

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`\nLifecycle: ${ok.length}/${COUNT} reached production+published in ${lcSecs.toFixed(0)}s (${(lcSecs / COUNT).toFixed(2)}s/project avg).`);
  if (failed.length) { console.log('Failures:'); failed.slice(0, 8).forEach((f) => console.log('  - ' + f.error)); }

  // Fork + publish-with-provenance on a subset.
  console.log('\nTesting fork + publish-with-reasons on 10 published tools...');
  const repo = await api('GET', '/repository');
  let forked = 0, forkFails = 0;
  for (const t of repo.slice(0, 10)) {
    try {
      const f = await api('POST', `/repository/${t.slug}/fork`);
      await api('POST', `/projects/${f.id}/stage`, { stage: 'alpha', override: true, note: 'fork test' });
      await api('POST', `/projects/${f.id}/stage`, { stage: 'beta', override: true, note: 'fork test' });
      await api('POST', `/projects/${f.id}/stage`, { stage: 'production', override: true, note: 'fork test' });
      await api('POST', `/projects/${f.id}/publish`, { reasons: ['Different patient population', 'Different clinical setting'], note: 'Adapted for volume test.' });
      forked++;
    } catch (e) { forkFails++; }
  }
  console.log(`  forked + published: ${forked}, failures: ${forkFails}`);

  // Negative tests.
  console.log('\nNegative tests:');
  const neg = [];
  // 1. Fork publish without reasons -> 400
  try { const t = (await api('GET', '/repository')).find((x) => x.parent_project_id); const f = await api('POST', `/repository/${t.slug}/fork`); await api('POST', `/projects/${f.id}/stage`, { stage: 'production', override: true, note: 'n' }); await api('POST', `/projects/${f.id}/publish`, {}); neg.push('fork-no-reasons: NO ERROR (BAD)'); } catch (e) { neg.push(`fork-no-reasons: blocked ${e.status} (good)`); }
  // 2. Single-use eval link reuse -> 409
  try { const { tokens } = await api('POST', `/projects/${ok[0]?.value}/invites`, { audience: 'provider', count: 1, stage: 'alpha' }); await api('POST', `/review/${tokens[0]}`, { instruments: {}, comment: '' }); await api('POST', `/review/${tokens[0]}`, { instruments: {}, comment: '' }); neg.push('reuse-link: NO ERROR (BAD)'); } catch (e) { neg.push(`reuse-link: blocked ${e.status} (good)`); }
  // 3. Non-superadmin admin overview -> 403
  try { await api('GET', '/admin/overview'); neg.push('admin-as-nonsuper: NO ERROR (BAD)'); } catch (e) { neg.push(`admin-as-nonsuper: blocked ${e.status} (good)`); }
  neg.forEach((n) => console.log('  ' + n));

  // Repository + public tool spot check.
  const repoFinal = await api('GET', '/repository');
  const adapted = repoFinal.filter((t) => t.parent_project_id);
  console.log(`\nRepository now lists ${repoFinal.length} tools (${adapted.length} adapted with provenance).`);
  if (adapted[0]) {
    const r = await api('GET', `/public/tool/${adapted[0].slug}`, null, { raw: true });
    console.log(`  public tool fetch (adapted): HTTP ${r.status}`);
  }

  // Cleanup everything.
  console.log('\nCleaning up all test projects...');
  const all = await api('GET', '/projects');
  await pool(all, (p) => api('DELETE', `/projects/${p.id}`), CONCURRENCY);
  const after = await api('GET', '/projects');
  console.log(`  deleted ${all.length}; remaining: ${after.length}`);

  console.log(`\nTOTAL TIME: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(ok.length === COUNT && after.length === 0 ? '\nRESULT: PASS' : `\nRESULT: ${failed.length} failures / ${after.length} not cleaned`);
})().catch((e) => { console.error('\nHARNESS FAILED:', e.message); process.exit(1); });
