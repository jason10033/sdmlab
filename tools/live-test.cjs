// SDMLab live end-to-end test harness.
//
//   node tools/live-test.cjs <baseUrl> <count> [--ai] [--keep] [--concurrency=N]
//
// Registers a throwaway test account, runs <count> projects through the FULL
// lifecycle (scope -> evidence -> design -> prototype -> alpha evals -> beta
// field evals -> production -> sign-off -> publish/fork subset), runs negative
// tests, then deletes everything it created. --ai additionally runs ONE project
// through the real AI pipeline (PubMed scan + screening + generation +
// surveillance), which costs real API credits; the volume projects use manual
// content and cost nothing.
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'https://sdmlab.onrender.com';
const COUNT = Number(process.argv[3] || 100);
const FLAGS = process.argv.slice(4);
const DO_AI = FLAGS.includes('--ai');
const KEEP = FLAGS.includes('--keep');
const CONCURRENCY = Number((FLAGS.find((f) => f.startsWith('--concurrency=')) || '').split('=')[1] || 4);

const RUN_ID = `lt${Date.now().toString(36)}`;
const stats = {}; // step -> [ms]
const failures = [];
let passes = 0;
const createdProjects = [];
let TOKEN = null;

function record(step, ms) { (stats[step] = stats[step] || []).push(ms); }
function fail(step, detail) {
  failures.push({ step, detail: String(detail).slice(0, 300) });
  console.log(`  FAIL [${step}] ${String(detail).slice(0, 200)}`);
}
function ok() { passes++; }

async function api(method, p, { token = TOKEN, body, expect = 200, raw = false, step = null } = {}) {
  const t0 = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/api${p}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      // Retry transient gateway errors
      if ([502, 503, 504].includes(res.status) && res.status !== expect) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      const text = await res.text();
      if (step) record(step, Date.now() - t0);
      if (res.status !== expect) {
        throw new Error(`${method} ${p} -> ${res.status} (expected ${expect}): ${text.slice(0, 180)}`);
      }
      if (raw) return text;
      try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
      lastErr = err;
      if (String(err.message || '').includes('expected')) throw err; // real assertion failure
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastErr;
}

function makeContent(i) {
  const opt = (id, name) => ({
    id, name, tagline: `${name} tagline`, summary: `${name} summary`, howItWorks: 'How it works text.',
    effectiveness: { text: 'Works well in testing.', citationIds: [] },
    benefits: [{ text: 'A benefit.', citationIds: [] }],
    risks: [{ text: 'A risk.', citationIds: [] }],
    logistics: 'Logistics text.', goodFitIf: ['Fits routine'], thinkTwiceIf: ['Hard to reach clinic'],
  });
  return {
    title: `Load Test ${i}`, decisionStatement: `Test decision ${i}`, intro: 'Intro text for load testing.',
    options: [opt('a', 'Option A'), opt('b', 'Option B')],
    comparison: [{ feature: 'How taken', values: [{ optionId: 'a', value: 'Daily' }, { optionId: 'b', value: 'Monthly' }] }],
    valuesQuestions: [{
      id: 'v1', question: 'What matters most?', helpText: '',
      answers: [{ label: 'Routine', favors: ['a'], note: 'Discuss routines' }, { label: 'Fewer visits', favors: ['b'], note: '' }],
    }],
    summaryGuidance: 'A conversation starter, not a verdict.',
    faqs: [{ q: 'Test question?', a: 'Test answer.', citationIds: [] }],
    glossary: [], conversationGuide: { steps: [{ title: 'Team talk', script: 'Script.', tips: [] }] },
    citations: [],
  };
}

const IPDASI_ANSWERS = { ip_decision: 4, ip_options: 4, ip_balanced: 3, ip_benefits: 4, ip_harms: 4, ip_probabilities: 3, ip_values: 4, ip_evidence: 4, ip_plain: 4 };
const SURE_ANSWERS = { sure_s: 'Yes', sure_u: 'Yes', sure_r: 'No', sure_e: 'Yes' };
const PREPDM_ANSWERS = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`pdm_${k + 1}`, 4]));
const IMPL = (prefix) => Object.fromEntries([1, 2, 3, 4].map((k) => [`${prefix}_${k}`, 4]));

async function lifecycle(i) {
  const honest = i % 25 === 0; // these meet gates for real instead of overriding
  const label = `LT${String(i).padStart(3, '0')}`;
  try {
    const p = await api('POST', '/projects', { body: { title: `${RUN_ID} Load Test ${String(i).padStart(3, '0')}`, decision: `Test decision for load project ${i}: option A, option B, or waiting.` }, step: 'create' });
    createdProjects.push(p.id);
    await api('POST', `/projects/${p.id}/materials/text`, { body: { label: 'Test material', text: `Load test material content ${i}. `.repeat(20) }, step: 'material' });
    await api('POST', `/projects/${p.id}/versions`, { body: { content: makeContent(i), note: 'Load test manual version' }, step: 'version' });
    if (honest) await api('PUT', `/projects/${p.id}`, { body: { provider_target: 1, patient_target: 1, beta_target: 1 }, step: 'targets' });

    for (const st of ['evidence', 'design', 'prototype', 'alpha']) {
      await api('POST', `/projects/${p.id}/stage`, { body: { stage: st }, step: 'stage' });
    }

    // Alpha evals via single-use links (provider + patient)
    const provInv = await api('POST', `/projects/${p.id}/invites`, { body: { audience: 'provider', count: 1, stage: 'alpha' }, step: 'invite' });
    const provReview = await api('GET', `/review/${provInv.tokens[0]}`, { token: null, step: 'review_get' });
    if (!provReview.instruments.some((x) => x.id === 'ipdasi')) fail(`${label} alpha-provider-instruments`, JSON.stringify(provReview.instruments.map((x) => x.id)));
    await api('POST', `/review/${provInv.tokens[0]}`, { token: null, body: { instruments: { ipdasi: IPDASI_ANSWERS, open: { accuracy: 4 } }, comment: 'load test' }, step: 'review_submit' });
    // Single-use enforcement
    await api('POST', `/review/${provInv.tokens[0]}`, { token: null, body: {}, expect: 409, step: 'review_reuse' });

    const patInv = await api('POST', `/projects/${p.id}/invites`, { body: { audience: 'patient', count: 1, stage: 'alpha' }, step: 'invite' });
    await api('POST', `/review/${patInv.tokens[0]}`, { token: null, body: { instruments: { sure: SURE_ANSWERS, prepdm: PREPDM_ANSWERS }, comment: 'load test' }, step: 'review_submit' });

    // Advance to beta: honest projects pass the gate for real, others override
    await api('POST', `/projects/${p.id}/stage`, { body: honest ? { stage: 'beta' } : { stage: 'beta', override: true, note: 'load test override' }, step: 'stage' });

    // Public tool during beta + field evaluations
    const tool = await api('GET', `/public/tool/${p.slug}`, { token: null, step: 'public_tool' });
    if (!tool.isBeta) fail(`${label} beta-flag`, 'isBeta false');
    const provIds = (tool.evaluation?.provider?.instruments || []).map((x) => x.id).join(',');
    if (provIds !== 'aim,iam,fim') fail(`${label} beta-provider-instruments`, provIds);
    await api('POST', `/public/tool/${p.slug}/evaluation`, { token: null, body: { audience: 'patient', instruments: { sure: SURE_ANSWERS, prepdm: PREPDM_ANSWERS }, comment: 'beta tester' }, step: 'beta_eval' });
    await api('POST', `/public/tool/${p.slug}/evaluation`, { token: null, body: { audience: 'provider', instruments: { aim: IMPL('aim'), iam: IMPL('iam'), fim: IMPL('fim') } }, step: 'beta_eval' });
    for (const ev of ['complete', 'print', 'share']) {
      await api('POST', `/public/tool/${p.slug}/event`, { token: null, body: { event: ev }, step: 'event' });
    }

    await api('POST', `/projects/${p.id}/stage`, { body: honest ? { stage: 'production' } : { stage: 'production', override: true, note: 'load test override' }, step: 'stage' });
    await api('POST', `/public/tool/${p.slug}/feedback`, { token: null, body: { audience: 'patient', rating: 5, helped: 'Yes', comment: 'load test' }, step: 'feedback' });
    const so = await api('POST', `/projects/${p.id}/signoff`, { body: { note: 'load test signoff' }, step: 'signoff' });
    if (!so.last_reviewed_at) fail(`${label} signoff`, 'no last_reviewed_at');

    if (i % 10 === 0) await api('POST', `/projects/${p.id}/publish`, { body: {}, step: 'publish' });
    if (i % 25 === 0) {
      const an = await api('GET', `/projects/${p.id}/analytics`, { step: 'analytics' });
      if (!an.totals.some((t) => t.event === 'view')) fail(`${label} analytics`, 'no view events');
      const csv = await api('GET', `/projects/${p.id}/export/feedback.csv`, { raw: true, step: 'export' });
      if (!csv.includes('instruments_json')) fail(`${label} export`, 'csv header missing');
    }
    ok();
    return { slug: p.slug, id: p.id };
  } catch (err) {
    fail(`${label} lifecycle`, err.message);
    return null;
  }
}

async function pollJob(getStatus, { label, timeoutMs = 15 * 60 * 1000, intervalMs = 6000 }) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label}: timed out after ${Math.round(timeoutMs / 60000)} min`);
    const s = await getStatus();
    if (s.status === 'done') return s;
    if (s.status === 'error') throw new Error(`${label}: ${s.error}`);
    if (s.step) process.stdout.write(`    ${label}: ${s.step} (${Math.round((Date.now() - t0) / 1000)}s)\r\n`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const PREP_MATERIAL = `PrEP (pre-exposure prophylaxis) is medicine that prevents HIV. Options include: a daily oral pill (tenofovir/emtricitabine), over 99 percent effective when taken daily; on-demand 2-1-1 dosing for cisgender men (2 pills 2-24 hours before sex, 1 at 24h, 1 at 48h); cabotegravir injections every 2 months, shown in HPTN 083/084 to be more effective than daily oral in part due to adherence; and lenacapavir injections every 6 months (PURPOSE-1/2 trials showed near-complete protection). Daily oral requires quarterly labs and is available as inexpensive generics. Injectables require clinic visits but remove daily adherence burden. Common side effects: mild GI symptoms for oral (first weeks), injection-site reactions for injectables. All options require HIV testing before starting and periodically. Choice depends on routine, privacy, comfort with injections, visit burden, insurance, and personal preference. Switching between options is possible.`;

async function aiPipeline() {
  console.log('\n=== REAL AI PIPELINE TEST (costs API credits) ===');
  const p = await api('POST', '/projects', { body: { title: `${RUN_ID} AI Verification: PrEP Options`, decision: 'Choosing an HIV PrEP option: daily oral pill, on-demand (2-1-1) dosing, 2-month injectable (cabotegravir), 6-month injectable (lenacapavir), or not starting PrEP now.' } });
  createdProjects.push(p.id);
  await api('POST', `/projects/${p.id}/materials/text`, { body: { label: 'PrEP clinical summary', text: PREP_MATERIAL } });

  console.log('  Starting literature scan (real PubMed + AI screening)...');
  const tScan = Date.now();
  await api('POST', `/projects/${p.id}/evidence/scan`);
  const scan = await pollJob(() => api('GET', `/projects/${p.id}/evidence/scan/status`), { label: 'scan' });
  console.log(`  Scan done in ${Math.round((Date.now() - tScan) / 1000)}s: