import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ToolView, { GuideSection } from '../components/ToolView.jsx';
import ToolEditor from '../components/ToolEditor.jsx';
import { downloadExport } from '../api.js';

const STAGES = [
  { id: 'intake', label: '1. Intake materials' },
  { id: 'evidence', label: '2. Evidence scan' },
  { id: 'interview', label: '3. Population interview' },
  { id: 'draft', label: '4. Draft tool' },
  { id: 'provider_review', label: '5. Provider iteration' },
  { id: 'patient_review', label: '6. Patient iteration' },
  { id: 'live', label: '7. Live + monitoring' },
];

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

  const stageIdx = STAGES.findIndex((s) => s.id === project.stage);
  const nextStage = STAGES[stageIdx + 1]?.id;

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 style={{ marginBottom: 0 }}>{project.title}</h1>
          <p className="muted" style={{ margin: 0 }}>{project.decision}</p>
        </div>
        <div className="spacer" />
        {project.stage === 'live'
          ? <a className="btn btn-secondary" href={`#/t/${project.slug}`} target="_blank" rel="noreferrer">Open live tool</a>
          : nextStage && <button className="btn" onClick={() => advance(nextStage)}>Advance to {STAGES[stageIdx + 1].label.slice(3)}</button>}
      </div>

      <div className="stepper">
        {STAGES.map((s, i) => (
          <div
            key={s.id}
            className={`step ${i < stageIdx ? 'done' : ''} ${s.id === viewStage ? 'current' : ''}`}
            onClick={() => setViewStage(s.id)}
          >
            <span className="dot" /> {s.label}
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {gateInfo && <GatePrompt gateInfo={gateInfo} onOverride={(note) => advance(gateInfo.stage, true, note)} onCancel={() => setGateInfo(null)} />}

      {viewStage === 'intake' && <IntakePanel project={project} />}
      {viewStage === 'evidence' && <EvidencePanel project={project} />}
      {viewStage === 'interview' && <InterviewPanel project={project} onSaved={load} />}
      {viewStage === 'draft' && <DraftPanel project={project} onChange={load} />}
      {viewStage === 'provider_review' && <ReviewPanel project={project} audience="provider" target={project.provider_target} />}
      {viewStage === 'patient_review' && <ReviewPanel project={project} audience="patient" target={project.patient_target} />}
      {viewStage === 'live' && <LivePanel project={project} />}

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

// ---------------- Stage 2: Evidence ----------------
function EvidencePanel({ project }) {
  const [evidence, setEvidence] = useState([]);
  const [subreddits, setSubreddits] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [pmid, setPmid] = useState('');
  const [newSub, setNewSub] = useState('');

  const load = useCallback(async () => {
    setEvidence(await api.getEvidence(project.id));
    setSubreddits(await api.getSubreddits(project.id));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  async function run(name, fn) {
    setBusy(name); setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const groups = { flagged: [], included: [], dismissed: [] };
  for (const e of evidence) groups[e.status]?.push(e);

  return (
    <>
      <div className="card">
        <h3>Literature scan</h3>
        <p className="muted">SDMLab builds PubMed queries for values, preferences, risks, benefits, effectiveness, and guidelines, screens the abstracts, and flags relevant ones. You review every flagged abstract: include it as a citable source or dismiss it.</p>
        {error && <div className="error">{error}</div>}
        <div className="toolbar">
          <button className="btn" disabled={!!busy} onClick={() => run('scan', async () => setScanResult(await api.scanEvidence(project.id)))}>
            {busy === 'scan' ? 'Scanning PubMed...' : 'Run literature scan'}
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

  useEffect(() => {
    if (genStatus !== 'running') return;
    const t = setInterval(async () => {
      const s = await api.generateStatus(project.id);
      if (s.status === 'done') { setGenStatus('idle'); clearInterval(t); await load(); onChange(); }
      if (s.status === 'error') { setGenStatus('idle'); setError(s.error); clearInterval(t); }
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
            {genStatus === 'running' ? 'Generating (this takes a few minutes)...' : latest ? 'Regenerate (new version)' : 'Generate draft'}
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

// ---------------- Stages 5-6: Review iterations ----------------
function ReviewPanel({ project, audience, target }) {
  const [invites, setInvites] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [count, setCount] = useState(5);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setInvites((await api.getInvites(project.id)).filter((i) => i.audience === audience));
    setFeedback((await api.getFeedback(project.id)).filter((f) => f.audience === audience));
  }, [project.id, audience]);
  useEffect(() => { load(); }, [load]);

  const base = `${window.location.origin}${window.location.pathname}#/review/`;

  return (
    <>
      <div className="card">
        <h3>{audience === 'provider' ? 'Provider iteration' : 'Patient iteration'} ({feedback.length}/{target} structured reviews)</h3>
        <p className="muted">
          {audience === 'provider'
            ? 'Send one-time review links to clinicians. Each reviewer sees the current draft and answers a short structured questionnaire. Revise and regenerate between rounds; every version is kept.'
            : 'Send one-time review links to patients or community members. Responses are anonymous; links are single-use.'}
        </p>
        <div className="toolbar">
          <input type="number" min="1" max="25" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
          <button className="btn" onClick={() => api.createInvites(project.id, { audience, count: Number(count) }).then(load)}>
            Create review links
          </button>
        </div>
        {invites.length > 0 && (
          <table>
            <thead><tr><th>Link</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{base}{inv.token}</td>
                  <td>{inv.completed_at ? <span className="badge badge-live">completed</span> : <span className="badge badge-muted">open</span>}</td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => { navigator.clipboard.writeText(base + inv.token); setCopied(inv.id); }}>
                      {copied === inv.id ? 'Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Feedback received</h3>
        {feedback.length === 0 ? <p className="muted">No reviews yet.</p> : feedback.map((f) => (
          <details className="evidence-item" key={f.id}>
            <summary>{new Date(f.created_at).toLocaleString()} {f.comment ? `- "${f.comment.slice(0, 80)}"` : ''}</summary>
            {f.responses && Object.entries(f.responses).map(([k, v]) => <p key={k}><strong>{k}:</strong> {String(v)}</p>)}
            {f.comment && <p><strong>Comment:</strong> {f.comment}</p>}
          </details>
        ))}
      </div>
    </>
  );
}

// ---------------- Stage 7: Live ----------------
function LivePanel({ project }) {
  const [dash, setDash] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [running, setRunning] = useState(false);
  const liveUrl = `${window.location.origin}${window.location.pathname}#/t/${project.slug}`;

  const load = useCallback(async () => {
    const d = await api.getDashboard();
    setDash({
      items: d.items.filter((i) => i.project_title === project.title),
      feedback: d.feedback.filter((f) => f.project_title === project.title),
    });
    setAnalytics(await api.getAnalytics(project.id));
  }, [project.title, project.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="card">
        <h3>Live tool</h3>
        {project.stage === 'live' ? (
          <>
            <p>Share this link with providers and patients:</p>
            <p className="mono">{liveUrl}</p>
            <div className="toolbar">
              <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(liveUrl)}>Copy link</button>
              <a className="btn btn-sm" href={`#/t/${project.slug}`} target="_blank" rel="noreferrer">Open</a>
            </div>
          </>
        ) : <p className="muted">The tool is not live yet. Complete the patient iteration and advance to Live.</p>}
      </div>

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Monitoring queue for this tool</h3>
          <div className="spacer" />
          <button className="btn btn-sm btn-secondary" disabled={running} onClick={async () => { setRunning(true); try { await api.runSurveillance(); await load(); } finally { setRunning(false); } }}>
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
              {['view', 'complete', 'print', 'guide_view'].map((ev) => {
                const row = analytics.totals.find((t) => t.event === ev);
                return <tr key={ev}><td>{ev.replace('_', ' ')}</td><td>{row?.total || 0}</td><td>{row?.last30 || 0}</td></tr>;
              })}
            </tbody>
          </table>
        )}
        <div className="toolbar" style={{ marginTop: '.8rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => downloadExport(`/projects/${project.id}/export/feedback.csv`, `${project.slug}-feedback.csv`)}>Export feedback CSV</button>
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
