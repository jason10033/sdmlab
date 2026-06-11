import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ToolView, { GuideSection } from '../components/ToolView.jsx';
import { TrainingCompanion } from './Project.jsx';

function FeedbackFooter({ slug }) {
  const [audience, setAudience] = useState('patient');
  const [rating, setRating] = useState(0);
  const [helped, setHelped] = useState('');
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) return <div className="success no-print">Thank you. Your feedback goes to the clinical team that maintains this tool.</div>;

  return (
    <div className="card no-print" style={{ borderColor: 'var(--accent)' }}>
      <h2>How was this tool?</h2>
      <p className="muted">Anonymous. No personal information is collected or stored.</p>
      <div className="pill-list">
        <button type="button" className={`answer-btn ${audience === 'patient' ? 'selected' : ''}`} onClick={() => setAudience('patient')}>I am a patient</button>
        <button type="button" className={`answer-btn ${audience === 'provider' ? 'selected' : ''}`} onClick={() => setAudience('provider')}>I am a provider</button>
      </div>
      <label>Overall rating</label>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={rating >= n ? 'on' : ''} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <label>Did it help you talk through the decision?</label>
      <div className="pill-list">
        {['Yes', 'Somewhat', 'No'].map((h) => (
          <button key={h} type="button" className={`answer-btn ${helped === h ? 'selected' : ''}`} style={{ padding: '.35rem .8rem' }} onClick={() => setHelped(h)}>{h}</button>
        ))}
      </div>
      <label>Comments (optional)</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      <div style={{ marginTop: '.8rem' }}>
        <button className="btn" disabled={!rating} onClick={async () => {
          await api.publicFeedback(slug, { audience, rating, helped, comment });
          setSent(true);
        }}>Send feedback</button>
      </div>
    </div>
  );
}

export default function PublicTool() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('tool');

  useEffect(() => {
    api.getPublicTool(slug).then(setData).catch((err) => setError(err.message));
  }, [slug]);

  if (error) return <div className="tool-shell"><div className="error">{error}</div></div>;
  if (!data) return <div className="tool-shell"><p className="muted">Loading...</p></div>;

  return (
    <div className="tool-shell">
      <div className="toolbar no-print">
        <button className={`btn btn-sm ${view === 'tool' ? '' : 'btn-ghost'}`} onClick={() => setView('tool')}>Decision tool</button>
        <button className={`btn btn-sm ${view === 'guide' ? '' : 'btn-ghost'}`} onClick={() => { setView('guide'); api.publicEvent(slug, 'guide_view').catch(() => {}); }}>Provider conversation guide</button>
        <button className={`btn btn-sm ${view === 'training' ? '' : 'btn-ghost'}`} onClick={() => setView('training')}>Provider training</button>
        <div className="spacer" />
        <button className="btn btn-sm btn-secondary" onClick={() => { api.publicEvent(slug, 'print').catch(() => {}); window.print(); }}>Print / save PDF</button>
      </div>

      {view === 'tool' && (
        <ToolView
          content={data.content}
          footer={<FeedbackFooter slug={slug} />}
          onAllAnswered={() => api.publicEvent(slug, 'complete').catch(() => {})}
        />
      )}
      {view === 'guide' && (
        <>
          <h1>Conversation guide</h1>
          <p className="muted">A provider-facing script for using this tool in a visit, following the three-talk model.</p>
          <GuideSection content={data.content} />
        </>
      )}
      {view === 'training' && (
        <div className="card"><TrainingCompanion training={data.training} /></div>
      )}
      <p className="muted" style={{ textAlign: 'center', marginTop: '2rem' }}>
        Built with SDMLab. Version {data.version}. This tool supports, and does not replace, a conversation with your healthcare provider.
      </p>
    </div>
  );
}
