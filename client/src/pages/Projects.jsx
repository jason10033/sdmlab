import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STAGE_LABELS = {
  intake: 'Intake', evidence: 'Evidence scan', interview: 'Population interview',
  draft: 'Draft', provider_review: 'Provider iteration', patient_review: 'Patient iteration', live: 'Live',
};

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [decision, setDecision] = useState('');
  const [error, setError] = useState('');
  const [aiConfigured, setAiConfigured] = useState(true);

  async function load() {
    setProjects(await api.getProjects());
    try { setAiConfigured((await api.health()).aiConfigured); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    try {
      const p = await api.createProject({ title, decision });
      window.location.hash = `#/project/${p.id}`;
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1>SDM Tool Projects</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setShowNew(!showNew)}>New project</button>
      </div>

      {!aiConfigured && (
        <div className="notice">
          The Anthropic API key is not configured on the server, so AI steps (extraction, evidence scan, generation, surveillance)
          will not run. Set ANTHROPIC_API_KEY in the server environment.
        </div>
      )}

      {showNew && (
        <div className="card">
          <h3>New SDM tool project</h3>
          <form onSubmit={create}>
            <label>Project title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PrEP Options" required />
            <label>The decision, stated precisely</label>
            <textarea value={decision} onChange={(e) => setDecision(e.target.value)}
              placeholder="Choosing an HIV PrEP option: daily oral pill, on-demand (2-1-1) dosing, 2-month injectable (cabotegravir), or 6-month injectable (lenacapavir), or not starting PrEP now." required />
            <p className="hint">State the options explicitly. The literature scan, Reddit discovery, and generation all key off this statement.</p>
            {error && <div className="error">{error}</div>}
            <div style={{ marginTop: '.8rem' }}>
              <button className="btn">Create project</button>
            </div>
          </form>
        </div>
      )}

      {projects === null ? <p className="muted">Loading...</p> : projects.length === 0 ? (
        <div className="card"><p>No projects yet. Create your first SDM tool project to get started.</p></div>
      ) : projects.map((p) => (
        <Link to={`/project/${p.id}`} key={p.id} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card">
            <div className="toolbar" style={{ marginBottom: '.3rem' }}>
              <h3 style={{ margin: 0 }}>{p.title}</h3>
              <span className={`badge ${p.stage === 'live' ? 'badge-live' : 'badge-stage'}`}>{STAGE_LABELS[p.stage]}</span>
              {p.stats.surveillanceNew > 0 && <span className="badge badge-warn">{p.stats.surveillanceNew} new surveillance flags</span>}
              <div className="spacer" />
              <span className="muted">v{p.stats.versions || 0}</span>
            </div>
            <p className="muted">{p.decision}</p>
            <p className="muted">
              Provider reviews {p.stats.provider}/{p.provider_target} | Patient reviews {p.stats.patient}/{p.patient_target}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
