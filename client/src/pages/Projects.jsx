import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STAGE_LABELS = {
  scope: 'Scope', evidence: 'Evidence', design: 'Design', prototype: 'Prototype',
  alpha: 'Alpha testing', beta: 'Beta testing', production: 'Production',
};

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [decision, setDecision] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState({ aiConfigured: true, mockMode: false });

  async function load() {
    setProjects(await api.getProjects());
    try { setHealth(await api.health()); } catch { /* ignore */ }
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

      {!health.aiConfigured && health.mockMode && (
        <div className="notice">
          Fallback mode: no AI key is set, so the pipeline runs with real PubMed and Reddit data but
          clearly-labeled placeholder content where the AI would write. Add ANTHROPIC_API_KEY to server/.env to go live.
        </div>
      )}
      {!health.aiConfigured && !health.mockMode && (
        <div className="notice">
          The Anthropic API key is not configured on the server, so AI steps (extraction, evidence scan, generation, surveillance)
          will not run. Set ANTHROPIC_API_KEY in server/.env.
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
              <span className={`badge ${p.stage === 'production' ? 'badge-live' : p.stage === 'beta' ? 'badge-beta' : 'badge-stage'}`}>{STAGE_LABELS[p.stage]}</span>
              {p.stats.surveillanceNew > 0 && <span className="badge badge-warn">{p.stats.surveillanceNew} new surveillance flags</span>}
              <div className="spacer" />
              <span className="muted">v{p.stats.versions || 0}</span>
            </div>
            <p className="muted">{p.decision}</p>
            <p className="muted">
              Alpha: providers {p.stats.provider}/{p.provider_target}, patients {p.stats.patient}/{p.patient_target} | Beta evals {p.stats.betaEvals}/{p.beta_target}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
