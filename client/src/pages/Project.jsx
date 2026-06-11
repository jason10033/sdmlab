import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, downloadExport, runSurveillanceAndWait } from '../api.js';
import ToolView, { GuideSection } from '../components/ToolView.jsx';
import ToolEditor from '../components/ToolEditor.jsx';

export default function Project() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [viewStage, setViewStage] = useState(null);
  const [error, setError] = useState('');
  const [gateInfo, setGateInfo] = useState(null);

  const load = useCallback(async () => {
    const p = await api.getProject(id);
    setProject(p);
    setViewStage((v) => v || p.stage);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function advance(stage, override = false, note = '') {
    setError(''); setGateInfo(null);
    try {
      await api.setStage(id, { stage, override, note });
      setViewStage(stage);
      await load();
    } catch (err) {
      if (err.data?.gates) setGateInfo({ stage, gates: err.data.gates });
      else setError(err.message);
    }
  }

  if (!project) return <div className="page"><p className="muted">Loading...</p></div>;

  const STAGES = project.stages;
  const stageIdx = STAGES.indexOf(project.stage);
  const nextStage = STAGES[stageIdx + 1];
  const info = project.stageInfo;

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 style={{ marginBottom: 0 }}>{project.title}</h1>
          <p className="muted" style={{ margin: 0 }}>{project.decision}</p>
        </div>
        <div className="spacer" />
        {(project.stage === 'beta' || project.stage === 'production') &&
          <a className="btn btn-secondary" href={`#/t/${project.slug}`} target="_blank" rel="noreferrer">Open tool</a>}
        {nextStage && <button className="btn" onClick={() => advance(nextStage)}>Advance to {info[nextStage].short}</button>}
      </div>

      <div className="stepper">
        {STAGES.map((s, i) => (
          <div
            key={s}
            className={`step ${i < stageIdx ? 'done' : ''} ${s === viewStage ? 'current' : ''}`}
            onClick={() => setViewStage(s)}
          >
            <span className="dot" /> {i + 1}. {info[s].short}
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {gateInfo && <GatePrompt gateInfo={gateInfo} onOverride={(note) => advance(gateInfo.stage, true, note)} onCancel={() => setGateInfo(null)} />}

      {info[viewStage] && (
        <div className="ipdas-panel no-print">
          <h3>{info[viewStage].label}</h3>
          <p style={{ margin: '.2rem 0' }}>{info[viewStage].summary}</p>
          <p className="ipdas-note">{info[viewStage].ipdas}</p>
          <ul className="checklist-ipdas">{info[viewStage].checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}

      {viewStage === 'scope' && <IntakePanel project={project} />}
      {viewStage === 'evidence' && <EvidencePanel project={project} />}
      {viewStage === 'design' && <InterviewPanel project={project} onSaved={load} />}
      {viewStage === 'prototype' && <DraftPanel project={project} onChange={load} />}
      {viewStage === 'alpha' && <AlphaPanel project={project} />}
      {viewStage === 'beta' && <BetaPanel project={project} />}
      {viewStage === 'production' && <ProductionPanel project={project} />}

      <RevisionLog projectId={project.id} stage={viewStage} />
    </div>
  );
}

function GatePrompt({ gateInfo, onOverride, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <div className="card" style={{ borderColor: 'var(--warn)' }}>
      <h3>Stage gate not met</h3>
      <ul>{gateInfo.gates.map((g, i) => <li key={i}>{g}</li>)}</ul>
      <p className="hint">You can override with a documented reason; this is recorded in the audit trail.</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for overriding the gate" />
      <div className="toolbar" style={{ marginTop: '.6rem' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={!note.trim()} onClick={() => onOverride(note)}>Override and advance</button>
      </div>
    </div>
  );
}

// ---------------- Stage 1: Intake ----------------
function IntakePanel({ project }) {
  const [materials, setMaterials] = useState([]);
  const [url, setUrl] = useState('');
  const [textLabel, setTextLabel] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef();

  const load = useCallback(async () => setMaterials(await api.getMaterials(project.id)), [project.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!materials.some((m) => m.status === 'pending')) return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [materials, load]);

  async function run(fn) {
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <div className="card">
        <h3>Existing materials</h3>
        <p className="muted">Upload what you already have: prior decision aids, handouts, guidelines (PDF, TXT, MD, JSON), links, or pasted text. SDMLab extracts the content and uses it as trusted source material.</p>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div>
            <label>Upload a file</label>
            <input type="file" ref={fileRef} accept=".pdf,.txt,.md,.json" />
            <button className="btn btn-sm" style={{ marginTop: '.4rem' }}
              onClick={() => { const f = fileRef.current.files[0]; if (f) run(() => api.addMaterialFile(project.id, f)); }}>
              Upload
            </button>
          </div>
          <div>
            <label>Add a web page</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            <button className="btn btn-sm" style={{ marginTop: '.4rem' }}
              onClick={() => url && run(() => api.addMaterialUrl(project.id, url).then(() => setUrl('')))}>
              Add URL
            </button>
          </div>
        </div>
        <label>Paste text</label>
        <input type="text" value={textLabel} onChange={(e) => setTextLabel(e.target.value)} placeholder="Label (e.g. Clinic PrEP handout)" style={{ marginBottom: '.4rem' }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste content here" />
        <button className="btn btn-sm" style={{ marginTop: '.4rem' }}
          onClick={() => text && run(() => api.addMaterialText(project.id, textLabel, text).then(() => { setText(''); setTextLabel(''); }))}>
          Add text
        </button>
      </div>

      <div className="card">
        <h3>Added materials</h3>
        {materials.length === 0 ? <p className="muted">Nothing added yet.</p> : (
          <table>
            <thead><tr><th>Material</th><th>Type</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td>{m.kind}</td>
                  <td>
                    {m.status === 'ready' && <span className="badge badge-live">ready ({Math.round((m.chars || 0) / 1000)}k chars)</span>}
                    {m.status === 'pending' && <span className="badge badge-warn">extracting...</span>}
                    {m.status === 'error' && <span className="badge badge-high" title={m.error}>error: {m.error}</span>}
                  </td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => api.deleteMaterial(project.id, m.id).then(load)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// Editable PubMed search queries: builder reviews, tightens/loosens, and can
// preview how many results each returns before running the (costly) screening.
const PURPOSES = ['values_preferences', 'risks_benefits', 'effectiveness', 'guidelines', 'custom'];

function SearchQueryEditor({ project }) {
  const [queries, setQueries] = useState([]);
  const [surveil, setSurveil] = useState('');
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const d = await api.getQueries(project.id);
    setQueries(d.queries.length ? d.queries : []);
    setSurveil(d.surveillanceQuery || '');
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  function update(i, text) { setQueries((qs) => qs.map((q, j) => (j === i ? { ...q, query: text } : q))); setSaved(false); }
  function setPurpose(i, p) { setQueries((qs) => qs.map((q, j) => (j === i ? { ...q, purpose: p } : q))); setSaved(false); }
  function remove(i) { setQueries((qs) => qs.filter((_, j) => j !== i)); setSaved(false); }
  function add() { setQueries((qs) => [...qs, { purpose: 'custom', query: '' }]); setSaved(false); }

  async function run(name, fn) {
    setBusy(name); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  const suggest = () => run('suggest', async () => { const d = await api.suggestQueries(project.id); setQueries(d.queries); setSurveil(d.surveillanceQuery); setSaved(false); });
  const save = () => run('save', async () => { await api.saveQueries(project.id, { queries, surveillanceQuery: surveil }); setSaved(true); });
  const checkCounts = () => run('counts', async () => {
    const all = [...queries, { purpose: 'surveillance', query: surveil }].filter((q) => q.query.trim());
    const d = await api.queryCounts(project.id, all);
    const map = {}; d.counts.forEach((c) => { map[c.query] = c.count; });
    setCounts(map);
  });

  return (
    <div className="card">
      <h3>Search queries</h3>
      <p className="muted">
        These PubMed queries drive the literature scan. Review and edit them: add MeSH terms or AND clauses to make a query
        stricter, remove terms to make it broader. Check result counts to see how strict each one is, then run the scan.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={suggest}>
          {busy === 'suggest' ? 'Building...' : queries.length ? 'Re-suggest with AI' : 'Suggest queries with AI'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={!!busy || !queries.length} onClick={checkCounts}>
          {busy === 'counts' ? 'Checking PubMed...' : 'Check result counts'}
        </button>
        <div className="spacer" />
        <button className="btn btn-sm" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving...' : saved ? 'Saved' : 'Save queries'}</button>
      </div>

      {queries.length === 0 ? <p className="muted">No queries yet. Suggest them with AI, or add your own.</p> : queries.map((q, i) => (
        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '.6rem .8rem', marginBottom: '.5rem' }}>
          <div className="toolbar" style={{ marginBottom: '.3rem' }}>
            <select value={q.purpose} onChange={(e) => setPurpose(i, e.target.value)} style={{ maxWidth: 200 }}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p.replace('_', ' & ')}</option>)}
            </select>
            {counts[q.query.trim()] !== undefined && (
              <span className={`badge ${counts[q.query.trim()] > 500 ? 'badge-warn' : counts[q.query.trim()] < 5 ? 'badge-high' : 'badge-live'}`}>
                {counts[q.query.trim()].toLocaleString()} results
              </span>
            )}
            <div className="spacer" />
            <button className="btn btn-sm btn-danger" onClick={() => remove(i)}>Remove</button>
          </div>
          <textarea value={q.query} onChange={(e) => update(i, e.target.value)} style={{ minHeight: 54, fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' }} placeholder="PubMed query (supports MeSH, field tags, boolean)" />
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={add}>+ Add a query</button>

      <label style={{ marginTop: '1rem' }}>Weekly monitoring query (used after the tool is live)</label>
      <textarea value={surveil} onChange={(e) => { setSurveil(e.target.value); setSaved(false); }} style={{ minHeight: 48, fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' }} />
      {counts[surveil.trim()] !== undefined && <p className="hint">Monitoring query currently matches {counts[surveil.trim()].toLocaleString()} PubMed results.</p>}
    </div>
  );
}

// ---------------- Stage 2: Evidence ----------------
function EvidencePanel({ project }) {
  const [evidence, setEvidence] = useState([]);
  const [subreddits, setSubreddits] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanStep, setScanStep] = useState('');
  const [pmid, setPmid] = useState('');
  const [newSub, setNewSub] = useState('');

  const load = useCallback(async () => {
    setEvidence(await api.getEvidence(project.id));
    setSubreddits(await api.getSubreddits(project.id));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  // Poll the scan job until it completes (real AI screening takes minutes).
  useEffect(() => {
    if (busy !== 'scan') return;
    const t = setInterval(async () => {
      try {
        const s = await api.scanStatus(project.id);
        if (s.step) setScanStep(s.step);
        if (s.status === 'done') { setScanResult(s.result); setBusy(''); setScanStep(''); clearInterval(t); await load(); }
        if (s.status === 'error') { setError(s.error); setBusy(''); setScanStep(''); clearInterval(t); }
      } catch { /* transient */ }
    }, 4000);
    return () => clearInterval(t);
  }, [busy, project.id, load]);

  async function startScan() {
    setError(''); setScanResult(null);
    try { await api.scanEvidence(project.id); setBusy('scan'); setScanStep('Starting'); }
    catch (err) { setError(err.message); }
  }

  async function run(name, fn) {
    setBusy(name); setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const groups = { flagged: [], included: [], dismissed: [] };
  for (const e of evidence) groups[e.status]?.push(e);

  return (
    <>
      <SearchQueryEditor project={project} />

      <div className="card">
        <h3>Literature scan</h3>
        <p className="muted">SDMLab searches PubMed using the queries above, screens the abstracts, and flags relevant ones. You review every flagged abstract: include it as a citable source or dismiss it.</p>
        {error && <div className="error">{error}</div>}
        <div className="toolbar">
          <button className="btn" disabled={!!busy} onClick={startScan}>
            {busy === 'scan' ? `${scanStep || 'Scanning'}...` : 'Run literature scan'}
          </button>
          {scanResult && <span className="muted">{scanResult.found} abstracts screened, {scanResult.flagged} flagged for your review.</span>}
        </div>
        <label>Add a specific paper by PMID</label>
        <p className="hint">For papers you already know, including paywalled ones reviewed manually. Added directly as an included source; no AI involved.</p>
        <div className="toolbar">
          <input type="text" value={pmid} onChange={(e) => setPmid(e.target.value)} placeholder="e.g. 38324754" style={{ maxWidth: 200 }} />
          <button className="btn btn-sm btn-secondary" disabled={!pmid.trim() || !!busy}
            onClick={() => run('pmid', () => api.addPmid(project.id, pmid).then(() => setPmid('')))}>
            {busy === 'pmid' ? 'Fetching...' : 'Add from PubMed'}
          </button>
        </div>
      </div>

      {['flagged', 'included', 'dismissed'].map((status) => groups[status].length > 0 && (
        <div className="card" key={status}>
          <h3>{status === 'flagged' ? `Awaiting your review (${groups.flagged.length})` : status === 'included' ? `Included sources (${groups.included.length})` : `Dismissed (${groups.dismissed.length})`}</h3>
          {groups[status].map((e) => (
            <details className="evidence-item" key={e.id}>
              <summary>{e.title} <span className="muted">({e.journal}, {e.year})</span></summary>
              <p className="pill-list">{(e.tags || '').split(',').filter(Boolean).map((t) => <span key={t}>{t}</span>)}</p>
              <p><strong>Why flagged:</strong> {e.summary}</p>
              <p className="muted">{e.abstract?.slice(0, 600)}{e.abstract?.length > 600 ? '...' : ''}</p>
              <div className="toolbar">
                <a href={e.url} target="_blank" rel="noreferrer">View on PubMed</a>
                <div className="spacer" />
                {status !== 'included' && <button className="btn btn-sm" onClick={() => api.setEvidenceStatus(project.id, e.id, 'included').then(load)}>Include</button>}
                {status !== 'dismissed' && <button className="btn btn-sm btn-ghost" onClick={() => api.setEvidenceStatus(project.id, e.id, 'dismissed').then(load)}>Dismiss</button>}
              </div>
            </details>
          ))}
        </div>
      ))}

      <div className="card">
        <h3>Patient community discovery (Reddit)</h3>
        <p className="muted">SDMLab searches Reddit for communities where patients discuss this decision and recommends which to monitor. Approved communities are scanned weekly once the tool is live.</p>
        <div className="toolbar">
          <button className="btn btn-secondary" disabled={!!busy} onClick={() => run('reddit', () => api.discoverReddit(project.id))}>
            {busy === 'reddit' ? 'Searching Reddit...' : 'Discover communities'}
          </button>
          <div className="spacer" />
          <input type="text" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="r/PrEP" style={{ maxWidth: 180 }} />
          <button className="btn btn-sm btn-ghost" disabled={!newSub.trim()}
            onClick={() => run('addsub', () => api.addSubreddit(project.id, newSub).then(() => setNewSub('')))}>
            Add manually
          </button>
        </div>
        {subreddits.length > 0 && (
          <table style={{ marginTop: '.8rem' }}>
            <thead><tr><th>Community</th><th>Members</th><th>Why</th><th>Monitor</th></tr></thead>
            <tbody>
              {subreddits.map((s) => (
                <tr key={s.id}>
                  <td><a href={`https://www.reddit.com/r/${s.name}`} target="_blank" rel="noreferrer">r/{s.name}</a></td>
                  <td>{s.subscribers ? s.subscribers.toLocaleString() : '-'}</td>
                  <td className="muted">{s.rationale}</td>
                  <td>
                    <input type="checkbox" checked={!!s.approved}
                      onChange={(e) => api.setSubreddit(project.id, s.id, e.target.checked).then(load)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------------- Stage 3: Interview ----------------
function InterviewPanel({ project, onSaved }) {
  const [answers, setAnswers] = useState(project.interview || {});
  const [saved, setSaved] = useState(false);
  return (
    <div className="card">
      <h3>Population interview</h3>
      <p className="muted">Tell SDMLab about the people this tool is for. Your answers shape the language, the values questions, the FAQ, and the training companion.</p>
      {project.interviewQuestions.map((q) => (
        <div key={q.id}>
          <label>{q.label}</label>
          <textarea value={answers[q.id] || ''} onChange={(e) => { setAnswers({ ...answers, [q.id]: e.target.value }); setSaved(false); }} />
        </div>
      ))}
      <div className="toolbar" style={{ marginTop: '.8rem' }}>
        <button className="btn" onClick={async () => { await api.saveInterview(project.id, answers); setSaved(true); onSaved(); }}>Save interview</button>
        {saved && <span className="success" style={{ margin: 0 }}>Saved.</span>}
      </div>
    </div>
  );
}

// ---------------- Stage 4: Draft ----------------
function DraftPanel({ project, onChange }) {
  const [latest, setLatest] = useState(null);
  const [genStatus, setGenStatus] = useState('idle');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('patient');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setLatest(await api.getLatestVersion(project.id)); } catch { setLatest(null); }
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const [genStep, setGenStep] = useState('');

  useEffect(() => {
    if (genStatus !== 'running') return;
    const t = setInterval(async () => {
      const s = await api.generateStatus(project.id);
      if (s.step) setGenStep(s.step);
      if (s.status === 'done') { setGenStatus('idle'); setGenStep(''); clearInterval(t); await load(); onChange(); }
      if (s.status === 'error') { setGenStatus('idle'); setGenStep(''); setError(s.error); clearInterval(t); }
    }, 4000);
    return () => clearInterval(t);
  }, [genStatus, project.id, load, onChange]);

  async function generate() {
    setError('');
    try { await api.generate(project.id); setGenStatus('running'); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <div className="card">
        <h3>Generate the SDM tool</h3>
        <p className="muted">Uses your materials, included evidence, and interview to draft the full IPDAS-structured tool: interactive patient tool, printable one-pager, conversation guide, and a decision-specific training companion. Every claim is cited. Generation takes a few minutes.</p>
        {error && <div className="error">{error}</div>}
        <div className="toolbar">
          <button className="btn" disabled={genStatus === 'running'} onClick={generate}>
            {genStatus === 'running' ? `${genStep || 'Generating'}...` : latest ? 'Regenerate (new version)' : 'Generate draft'}
          </button>
          {latest && <span className="muted">Current: version {latest.version} ({latest.note}), {new Date(latest.created_at).toLocaleString()}</span>}
        </div>
      </div>

      {latest && (
        <div className="card">
          <div className="toolbar">
            {[['patient', 'Patient tool preview'], ['guide', 'Conversation guide'], ['training', 'Training companion'], ['edit', 'Edit content'], ['versions', `Versions`]].map(([t, label]) => (
              <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>{label}</button>
            ))}
            <div className="spacer" />
            <button className="btn btn-sm btn-secondary no-print" onClick={() => window.print()}>Print / PDF one-pager</button>
          </div>
          {tab === 'patient' && <ToolView content={latest.content} />}
          {tab === 'guide' && <GuideSection content={latest.content} />}
          {tab === 'training' && <TrainingCompanion training={latest.training} />}
          {tab === 'edit' && (
            <ToolEditor
              key={latest.version}
              content={latest.content}
              saving={saving}
              onSave={async (newContent, note) => {
                setSaving(true);
                try {
                  await api.saveVersion(project.id, { content: newContent, training: latest.training, note });
                  await load(); onChange(); setTab('patient');
                } catch (err) { setError(err.message); }
                finally { setSaving(false); }
              }}
            />
          )}
          {tab === 'versions' && <VersionHistory project={project} latest={latest} onChange={async () => { await load(); onChange(); }} />}
        </div>
      )}
    </>
  );
}

function VersionHistory({ project, latest, onChange }) {
  const [versions, setVersions] = useState([]);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => setVersions(await api.getVersions(project.id)), [project.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <table>
        <thead><tr><th>Version</th><th>Note</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id}>
              <td>v{v.version} {v.version === latest.version && <span className="badge badge-live">current</span>}</td>
              <td>{v.note}</td>
              <td className="muted">{new Date(v.created_at).toLocaleString()}</td>
              <td>
                <button className="btn btn-sm btn-ghost" onClick={async () => setViewing(await api.getVersion(project.id, v.version))}>View</button>
                {v.version !== latest.version && (
                  <button className="btn btn-sm btn-secondary" style={{ marginLeft: '.3rem' }}
                    onClick={async () => { await api.restoreVersion(project.id, v.version); await load(); onChange(); }}>
                    Restore
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewing && (
        <div style={{ marginTop: '1rem' }}>
          <div className="notice">Viewing version {viewing.version} ({viewing.note}). <button className="btn btn-sm btn-ghost" onClick={() => setViewing(null)}>Close</button></div>
          <ToolView content={viewing.content} />
        </div>
      )}
    </div>
  );
}

export function TrainingCompanion({ training }) {
  if (!training) return <p className="muted">No training companion generated yet.</p>;
  return (
    <div>
      <h3>Using this tool with patients</h3>
      <p>{training.overview}</p>
      <p><strong>When to use it:</strong> {training.whenToUse}</p>
      <p><strong>Introducing it:</strong> {training.introducingTheTool}</p>
      <p><strong>Time needed:</strong> {training.timeNeeded}</p>
      <h3>Talking points</h3>
      <ul>{training.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <h3>Questions patients are likely to ask</h3>
      {training.commonQuestions.map((q, i) => (
        <details className="evidence-item" key={i}><summary>{q.q}</summary><p>{q.a}</p></details>
      ))}
      <h3>Pitfalls to avoid</h3>
      <ul>{training.pitfalls.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <h3>Equity notes</h3>
      <p>{training.equityNotes}</p>
    </div>
  );
}

// ---------------- Shared: eval links + evaluation list ----------------
function EvalLinks({ project, audience, stage }) {
  const [invites, setInvites] = useState([]);
  const [count, setCount] = useState(5);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setInvites((await api.getInvites(project.id)).filter((i) => i.audience === audience && (i.stage || 'alpha') === stage));
  }, [project.id, audience, stage]);
  useEffect(() => { load(); }, [load]);

  const base = `${window.location.origin}${window.location.pathname}#/review/`;
  return (
    <div>
      <div className="toolbar">
        <input type="number" min="1" max="25" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
        <button className="btn btn-sm" onClick={() => api.createInvites(project.id, { audience, count: Number(count), stage }).then(load)}>
          Create {audience} evaluation links
        </button>
      </div>
      {invites.length > 0 && (
        <table>
          <thead><tr><th>Single-use link</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id}>
                <td className="mono">{base}{inv.token}</td>
                <td>{inv.completed_at ? <span className="badge badge-live">done</span> : <span className="badge badge-muted">open</span>}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => { navigator.clipboard.writeText(base + inv.token); setCopied(inv.id); }}>{copied === inv.id ? 'Copied' : 'Copy'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EvalList({ evals }) {
  if (evals.length === 0) return <p className="muted">No evaluations yet.</p>;
  return evals.map((f) => (
    <details className="evidence-item" key={f.id}>
      <summary>
        <span className={`badge ${f.audience === 'provider' ? 'badge-stage' : 'badge-muted'}`}>{f.audience}</span>{' '}
        <span className="badge badge-muted">{f.source}</span>{' '}
        {new Date(f.created_at).toLocaleString()} {f.comment ? `- "${f.comment.slice(0, 70)}"` : ''}
      </summary>
      {f.instruments && Object.entries(f.instruments).map(([inst, answers]) => (
        inst === 'open'
          ? <p key={inst}><strong>Open questions:</strong> {Object.entries(answers).map(([k, v]) => `${k}=${v}`).join('; ')}</p>
          : <p key={inst}><strong>{inst}:</strong> {Object.entries(answers).map(([k, v]) => `${k}=${v}`).join(', ')}</p>
      ))}
      {f.comment && <p><strong>Comment:</strong> {f.comment}</p>}
    </details>
  ));
}

// ---------------- Stage 5: Alpha testing (providers + patients) ----------------
function AlphaPanel({ project }) {
  const [evals, setEvals] = useState([]);
  const load = useCallback(async () => setEvals((await api.getFeedback(project.id)).filter((f) => f.stage === 'alpha')), [project.id]);
  useEffect(() => { load(); }, [load]);

  const providerN = evals.filter((e) => e.audience === 'provider').length;
  const patientN = evals.filter((e) => e.audience === 'patient').length;

  return (
    <>
      <div className="card">
        <h3>Alpha testing</h3>
        <p className="muted">
          Controlled usability and comprehension testing. Send single-use evaluation links to providers and patients.
          Each reviewer sees the current draft and completes validated measures (providers: IPDAS quality criteria; patients: SURE and Preparation for Decision Making).
        </p>
        <div className="row">
          <div>
            <h4>Providers ({providerN}/{project.provider_target})</h4>
            <EvalLinks project={project} audience="provider" stage="alpha" />
          </div>
          <div>
            <h4>Patients ({patientN}/{project.patient_target})</h4>
            <EvalLinks project={project} audience="patient" stage="alpha" />
          </div>
        </div>
        <p className="hint" style={{ marginTop: '.8rem' }}>Revise the tool in the Prototype stage between rounds; every version is kept. Advance to Beta once both targets are met.</p>
      </div>

      <div className="card">
        <h3>Alpha evaluations received ({evals.length})</h3>
        <EvalList evals={evals} />
      </div>
    </>
  );
}

// ---------------- Stage 6: Beta (field testing) ----------------
function BetaPanel({ project }) {
  const [evals, setEvals] = useState([]);
  const load = useCallback(async () => setEvals((await api.getFeedback(project.id)).filter((f) => f.stage === 'beta')), [project.id]);
  useEffect(() => { load(); }, [load]);

  const pathUrl = `${window.location.origin}${window.location.pathname}#/t/${project.slug}`;
  const subUrl = `https://${project.slug}.sdmlab.com`;
  const isLive = project.stage === 'beta' || project.stage === 'production';

  return (
    <>
      <div className="card">
        <h3>Beta field testing ({evals.length}/{project.beta_target} evaluations)</h3>
        <p className="muted">
          Field-test the tool with real users on the live website. The tool shows a "field testing" banner and collects
          validated evaluations (SURE, Preparation for Decision Making) anonymously from anyone who uses it.
        </p>
        {isLive ? (
          <>
            <p>Open link to share for field testing:</p>
            <p className="mono">{pathUrl}</p>
            <p className="muted">Once you point DNS for sdmlab.com, this tool will also be reachable at its own subdomain:</p>
            <p className="mono">{subUrl}</p>
            <div className="toolbar">
              <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(pathUrl)}>Copy link</button>
              <a className="btn btn-sm" href={`#/t/${project.slug}`} target="_blank" rel="noreferrer">Open tool</a>
            </div>
          </>
        ) : <p className="notice">Advance to Beta to publish the tool for field testing.</p>}
      </div>

      <div className="card">
        <h3>Beta evaluations received ({evals.length})</h3>
        <EvalList evals={evals} />
      </div>
    </>
  );
}

// ---------------- Stage 7: Production (live + monitoring) ----------------
function ProductionPanel({ project }) {
  const [dash, setDash] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [running, setRunning] = useState(false);
  const [proj, setProj] = useState(project);
  const liveUrl = `${window.location.origin}${window.location.pathname}#/t/${project.slug}`;

  const load = useCallback(async () => {
    const d = await api.getDashboard();
    setDash({
      items: d.items.filter((i) => i.project_title === project.title),
      feedback: d.feedback.filter((f) => f.project_title === project.title),
    });
    setAnalytics(await api.getAnalytics(project.id));
    setProj(await api.getProject(project.id));
  }, [project.title, project.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="card">
        <h3>Production tool</h3>
        {project.stage === 'production' ? (
          <>
            <p>Share this link with providers and patients:</p>
            <p className="mono">{liveUrl}</p>
            <div className="toolbar">
              <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(liveUrl)}>Copy link</button>
              <a className="btn btn-sm" href={`#/t/${project.slug}`} target="_blank" rel="noreferrer">Open</a>
            </div>
          </>
        ) : <p className="muted">Not in production yet. Complete beta field testing and advance to Production.</p>}
      </div>

      <MaintenancePanel project={proj} onChange={load} />
      <PublishPanel project={proj} onChange={load} />

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Monitoring queue for this tool</h3>
          <div className="spacer" />
          <button className="btn btn-sm btn-secondary" disabled={running} onClick={async () => { setRunning(true); try { await runSurveillanceAndWait(); await load(); } finally { setRunning(false); } }}>
            {running ? 'Scanning...' : 'Run scan now'}
          </button>
        </div>
        <p className="muted">Weekly scans of PubMed and approved Reddit communities flag items here. Nothing changes the live tool without your action.</p>
        {!dash ? <p className="muted">Loading...</p> : dash.items.length === 0 ? <p className="muted">No flags.</p> : (
          dash.items.map((it) => <SurveillanceItem key={it.id} item={it} onChange={load} />)
        )}
      </div>

      <div className="card">
        <h3>Usage and evaluation data</h3>
        <p className="muted">Aggregate counts only; no identifiers are ever collected.</p>
        {analytics && (
          <table style={{ maxWidth: 480 }}>
            <thead><tr><th>Event</th><th>Total</th><th>Last 30 days</th></tr></thead>
            <tbody>
              {['view', 'complete', 'print', 'guide_view', 'share'].map((ev) => {
                const row = analytics.totals.find((t) => t.event === ev);
                return <tr key={ev}><td>{ev.replace('_', ' ')}</td><td>{row?.total || 0}</td><td>{row?.last30 || 0}</td></tr>;
              })}
            </tbody>
          </table>
        )}
        <div className="toolbar" style={{ marginTop: '.8rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => downloadExport(`/projects/${project.id}/export/feedback.csv`, `${project.slug}-feedback.csv`)}>Export evaluations CSV</button>
          <button className="btn btn-sm btn-secondary" onClick={() => downloadExport(`/projects/${project.id}/export/analytics.csv`, `${project.slug}-analytics.csv`)}>Export analytics CSV</button>
          <button className="btn btn-sm btn-secondary" onClick={() => downloadExport(`/projects/${project.id}/export/project.json`, `${project.slug}-export.json`)}>Export full project JSON</button>
        </div>
      </div>

      <div className="card">
        <h3>In-tool feedback</h3>
        {!dash ? null : dash.feedback.length === 0 ? <p className="muted">None yet.</p> : dash.feedback.map((f) => (
          <p key={f.id}><span className={`badge ${f.audience === 'provider' ? 'badge-stage' : 'badge-muted'}`}>{f.audience}</span>{' '}
            {f.rating ? `${f.rating}/5` : ''} {f.helped ? `(${f.helped})` : ''} {f.comment || ''}</p>
        ))}
      </div>
    </>
  );
}

// Maintenance: literature-review sign-off, sets the public "last reviewed" date.
function MaintenancePanel({ project, onChange }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <h3>Ongoing maintenance</h3>
      <p className="muted">
        Weekly literature and community monitoring continues automatically. When you have reviewed the latest flags,
        sign off to stamp the tool with today's date so patients and other clinicians can see how current it is.
      </p>
      <p>Evidence last reviewed: <strong>{project.last_reviewed_at ? new Date(project.last_reviewed_at).toLocaleDateString() : 'not yet signed off'}</strong></p>
      <button className="btn btn-secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await api.signoff(project.id, 'Reviewed surveillance flags and confirmed content is current'); await onChange(); }
        finally { setBusy(false); }
      }}>
        {busy ? 'Signing off...' : 'Sign off: evidence reviewed today'}
      </button>
    </div>
  );
}

// Publish to the public repository (forks must record adaptation reasons).
function PublishPanel({ project, onChange }) {
  const [reasonsList, setReasonsList] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const isFork = !!project.parent_project_id;

  useEffect(() => { api.getRepoMeta().then((m) => setReasonsList(m.reasons)); }, []);

  function toggle(r) { setChosen((c) => c.includes(r) ? c.filter((x) => x !== r) : [...c, r]); }

  async function publish() {
    setError('');
    try { await api.publish(project.id, isFork ? { reasons: chosen, note } : {}); await onChange(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--secondary)', borderWidth: 2 }}>
      <h3>Public repository</h3>
      {project.repo_published ? (
        <>
          <p className="success" style={{ margin: '0 0 .6rem' }}>This tool is published in the public repository.</p>
          <button className="btn btn-ghost btn-sm" onClick={() => api.unpublish(project.id).then(onChange)}>Remove from repository</button>
        </>
      ) : (
        <>
          <p className="muted">Publishing makes this finalized tool free for any clinic to use or adapt. {isFork && 'Because this tool was adapted from another, please record what you changed; this is shown publicly for transparency.'}</p>
          {isFork && (
            <>
              <label>Why was this tool adapted? (choose all that apply)</label>
              <div className="pill-list">
                {reasonsList.map((r) => (
                  <button key={r} type="button" className={`answer-btn ${chosen.includes(r) ? 'selected' : ''}`} style={{ padding: '.3rem .8rem', fontSize: '.85rem' }} onClick={() => toggle(r)}>{r}</button>
                ))}
              </div>
              <label>Notes on the adaptation (population, setting, what changed)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Adapted for adolescent patients in a school-based health center; simplified language and added local referral options." />
            </>
          )}
          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ marginTop: '.6rem' }} disabled={isFork && chosen.length === 0} onClick={publish}>Publish to repository</button>
        </>
      )}
    </div>
  );
}

export function SurveillanceItem({ item, onChange }) {
  return (
    <details className="evidence-item">
      <summary>
        <span className={`badge ${item.relevance === 'high' ? 'badge-high' : item.relevance === 'medium' ? 'badge-warn' : 'badge-muted'}`}>{item.relevance}</span>{' '}
        <span className={`badge ${item.source === 'pubmed' ? 'badge-stage' : 'badge-muted'}`}>{item.source}</span>{' '}
        {item.title} {item.status !== 'new' && <span className="badge badge-muted">{item.status}</span>}
      </summary>
      <p><strong>Why flagged:</strong> {item.why_flagged}</p>
      <p className="muted">{item.snippet?.slice(0, 500)}</p>
      <div className="toolbar">
        <a href={item.url} target="_blank" rel="noreferrer">Open source</a>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => api.setSurveillanceStatus(item.id, 'incorporated').then(onChange)}>Mark incorporated</button>
        <button className="btn btn-sm btn-secondary" onClick={() => api.setSurveillanceStatus(item.id, 'reviewed').then(onChange)}>Reviewed</button>
        <button className="btn btn-sm btn-ghost" onClick={() => api.setSurveillanceStatus(item.id, 'dismissed').then(onChange)}>Dismiss</button>
      </div>
    </details>
  );
}

// ---------------- Audit trail ----------------
function RevisionLog({ projectId }) {
  const [revisions, setRevisions] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.getRevisions(projectId).then(setRevisions); }, [projectId]);
  return (
    <div className="card">
      <h3 style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>Audit trail ({revisions.length}) {open ? '▾' : '▸'}</h3>
      {open && (
        <table>
          <tbody>
            {revisions.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                <td><span className="badge badge-muted">{r.stage}</span></td>
                <td>{r.action}</td>
                <td className="muted">{r.note} {r.user_name ? `(${r.user_name})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
