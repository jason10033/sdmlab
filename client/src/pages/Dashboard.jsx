import React, { useCallback, useEffect, useState } from 'react';
import { api, runSurveillanceAndWait } from '../api.js';
import { SurveillanceItem } from './Project.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => setData(await api.getDashboard()), []);
  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true); setError('');
    try { await runSurveillanceAndWait(); await load(); }
    catch (err) { setError(err.message); }
    finally { setRunning(false); }
  }

  if (!data) return <div className="page"><p className="muted">Loading...</p></div>;

  const newItems = data.items.filter((i) => i.status === 'new');
  const handled = data.items.filter((i) => i.status !== 'new');
  const newFeedback = data.feedback.filter((f) => f.status === 'new');

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Monitoring dashboard</h1>
        <div className="spacer" />
        <button className="btn btn-secondary" disabled={running} onClick={runNow}>
          {running ? 'Scanning literature and Reddit...' : 'Run weekly scan now'}
        </button>
      </div>
      <p className="muted">
        Live tools are scanned weekly: new PubMed publications and posts in approved patient communities are triaged by AI,
        and anything the team should see lands here. Nothing changes a live tool without your approval.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Needs review ({newItems.length})</h2>
        {newItems.length === 0 ? <p className="muted">Queue is clear.</p> :
          newItems.map((it) => (
            <div key={it.id}>
              <p style={{ margin: '0 0 .2rem' }}><strong>{it.project_title}</strong></p>
              <SurveillanceItem item={it} onChange={load} />
            </div>
          ))}
      </div>

      <div className="card">
        <h2>New in-tool feedback ({newFeedback.length})</h2>
        {newFeedback.length === 0 ? <p className="muted">None.</p> : (
          <table>
            <thead><tr><th>Tool</th><th>From</th><th>Rating</th><th>Helped</th><th>Comment</th><th></th></tr></thead>
            <tbody>
              {newFeedback.map((f) => (
                <tr key={f.id}>
                  <td>{f.project_title}</td>
                  <td>{f.audience}</td>
                  <td>{f.rating ? `${f.rating}/5` : '-'}</td>
                  <td>{f.helped || '-'}</td>
                  <td>{f.comment || '-'}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => api.setFeedbackStatus(f.id, 'reviewed').then(load)}>Mark reviewed</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ cursor: 'pointer' }} onClick={() => setShowHandled(!showHandled)}>
          Handled items ({handled.length}) {showHandled ? '▾' : '▸'}
        </h3>
        {showHandled && handled.map((it) => (
          <div key={it.id}>
            <p style={{ margin: '0 0 .2rem' }}><strong>{it.project_title}</strong></p>
            <SurveillanceItem item={it} onChange={load} />
          </div>
        ))}
      </div>
    </div>
  );
}
