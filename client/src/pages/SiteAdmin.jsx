import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SiteAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.adminOverview().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Loading...</p></div>;

  const { counts, projects, medianDurations, stageInfo } = data;
  const stages = Object.keys(counts.byStage);

  return (
    <div className="page">
      <h1>Site administration</h1>
      <p className="muted">Platform-wide usage across all workspaces. Visible to site admins only.</p>

      <div className="row">
        {[['Projects', counts.projects], ['Registered users', counts.users], ['Institutions', counts.institutions],
          ['Published tools', counts.published], ['Evaluations', counts.evaluations], ['Tool views', counts.toolViews]].map(([label, n]) => (
          <div className="card" key={label} style={{ textAlign: 'center', minWidth: 130 }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-dark)' }}>{n}</div>
            <div className="muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Projects by stage</h3>
        <div className="pill-list">
          {stages.map((s) => <span key={s}>{stageInfo[s]?.short || s}: <strong>{counts.byStage[s]}</strong></span>)}
        </div>
      </div>

      <div className="card">
        <h3>Median time between stages (days)</h3>
        {Object.keys(medianDurations).length === 0 ? <p className="muted">Not enough data yet.</p> : (
          <table style={{ maxWidth: 520 }}>
            <thead><tr><th>Transition</th><th>Median days</th></tr></thead>
            <tbody>
              {Object.entries(medianDurations).map(([k, v]) => {
                const [from, to] = k.split('->');
                return <tr key={k}><td>{stageInfo[from]?.short || from} → {stageInfo[to]?.short || to}</td><td>{v}</td></tr>;
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>All projects</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Title</th><th>Institution</th><th>Owner</th><th>Stage</th><th>Last worked</th><th>Published</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{p.institution}</td>
                  <td className="muted">{p.owner_email || p.owner_name || '-'}</td>
                  <td><span className="badge badge-stage">{stageInfo[p.stage]?.short || p.stage}</span></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td>{p.repo_published ? <span className="badge badge-live">yes</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
