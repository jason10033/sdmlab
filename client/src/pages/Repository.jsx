import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function authed() { return !!localStorage.getItem('sdmlab_token'); }

export default function Repository() {
  const [tools, setTools] = useState(null);
  const [error, setError] = useState('');
  const [forking, setForking] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api.getRepository().then(setTools).catch((e) => setError(e.message)); }, []);

  async function fork(slug) {
    if (!authed()) { navigate('/login'); return; }
    setForking(slug); setError('');
    try {
      const { id } = await api.forkTool(slug);
      navigate(`/project/${id}`);
    } catch (e) { setError(e.message); setForking(''); }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h1 style={{ marginBottom: 0 }}>Public tool repository</h1>
          <p className="muted" style={{ margin: 0 }}>Finalized shared decision-making tools, free to use or adapt for your own setting.</p>
        </div>
        <div className="spacer" />
        {!authed() && <Link className="btn btn-secondary" to="/login">Sign in to adapt</Link>}
      </div>
      {error && <div className="error">{error}</div>}

      {tools === null ? <p className="muted">Loading...</p> : tools.length === 0 ? (
        <div className="card"><p>No tools have been published to the repository yet.</p></div>
      ) : tools.map((t) => (
        <div className="card" key={t.id}>
          <div className="toolbar" style={{ marginBottom: '.3rem' }}>
            <h3 style={{ margin: 0 }}>{t.title}</h3>
            {t.parent_project_id && <span className="badge badge-beta">Adapted</span>}
            <div className="spacer" />
            <a className="btn btn-sm btn-secondary" href={`#/t/${t.slug}`} target="_blank" rel="noreferrer">Open &amp; use</a>
            <button className="btn btn-sm" disabled={forking === t.slug} onClick={() => fork(t.slug)}>
              {forking === t.slug ? 'Creating copy...' : 'Adapt this tool'}
            </button>
          </div>
          <p className="muted">{t.decision}</p>
          <p className="muted" style={{ fontSize: '.82rem' }}>
            {t.institution} {t.author_name ? `· ${t.author_name}` : ''}
            {t.last_reviewed_at ? ` · evidence last reviewed ${new Date(t.last_reviewed_at).toLocaleDateString()}` : ''}
          </p>
          {t.parent_project_id && (
            <div className="lean-card" style={{ background: 'var(--accent-warm)', borderLeftColor: 'var(--accent)' }}>
              <p style={{ margin: 0, fontSize: '.85rem' }}>
                <strong>Adapted from {t.parent_title ? `"${t.parent_title}"` : 'another tool'}</strong>
                {t.author_email ? ` by ${t.author_email}` : ''}{t.institution ? ` (${t.institution})` : ''}.
              </p>
              {t.mod_reasons && <div className="pill-list" style={{ marginTop: '.4rem' }}>{t.mod_reasons.map((r) => <span key={r}>{r}</span>)}</div>}
              {t.mod_note && <p style={{ margin: '.4rem 0 0', fontSize: '.85rem' }}>{t.mod_note}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
