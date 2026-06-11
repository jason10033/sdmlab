import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ToolView, { GuideSection } from '../components/ToolView.jsx';
import DecisionSummary from '../components/DecisionSummary.jsx';
import EvalForm from '../components/EvalForm.jsx';
import { TrainingCompanion } from './Project.jsx';

// Anonymous field-testing evaluation shown during beta.
function BetaEval({ slug, evaluation }) {
  const [audience, setAudience] = useState('patient');
  const [responses, setResponses] = useState({});
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const bundle = evaluation[audience];

  if (sent) return <div className="success">Thank you. Your evaluation helps the clinical team improve this tool before it is finalized.</div>;

  return (
    <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
      <h2>Help us improve this tool</h2>
      <p className="muted">This tool is in field testing. Your anonymous evaluation is very helpful. No personal information is collected.</p>
      <div className="pill-list">
        <button type="button" className={`answer-btn ${audience === 'patient' ? 'selected' : ''}`} onClick={() => { setAudience('patient'); setResponses({}); }}>I am a patient / community member</button>
        <button type="button" className={`answer-btn ${audience === 'provider' ? 'selected' : ''}`} onClick={() => { setAudience('provider'); setResponses({}); }}>I am a provider</button>
      </div>
      <EvalForm instruments={bundle.instruments} openQuestions={bundle.openQuestions} value={responses} onChange={setResponses} />
      <label>Anything else?</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      <div style={{ marginTop: '.8rem' }}>
        <button className="btn" onClick={async () => { await api.publicEvaluation(slug, { audience, instruments: responses, comment }); setSent(true); }}>Submit evaluation</button>
      </div>
    </div>
  );
}

// Quick anonymous rating (production).
function FeedbackFooter({ slug }) {
  const [audience, setAudience] = useState('patient');
  const [rating, setRating] = useState(0);
  const [helped, setHelped] = useState('');
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) return <div className="success no-print">Thank you. Your feedback goes to the clinical team that maintains this tool.</div>;

  return (
    <div className="card no-print" style={{ borderColor: 'var(--primary)' }}>
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

export default function PublicTool({ slugOverride }) {
  const params = useParams();
  const slug = slugOverride || params.slug;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('tool');
  const [answers, setAnswers] = useState({});
  const [extraQuestions, setExtraQuestions] = useState(['']);

  useEffect(() => {
    api.getPublicTool(slug).then(setData).catch((err) => setError(err.message));
  }, [slug]);

  if (error) return <div className="tool-shell"><div className="error">{error}</div></div>;
  if (!data) return <div className="tool-shell"><p className="muted">Loading...</p></div>;

  const views = [
    ['tool', 'Decision tool'],
    ['summary', 'Share with provider'],
    ['guide', 'Provider conversation guide'],
    ['training', 'Provider training'],
  ];

  return (
    <div className="tool-shell">
      {data.isBeta && <div className="beta-banner no-print">This tool is in field testing (beta). We welcome your feedback to help finalize it.</div>}

      <div className="toolbar no-print">
        {views.map(([v, label]) => (
          <button key={v} className={`btn btn-sm ${view === v ? '' : 'btn-ghost'}`}
            onClick={() => { setView(v); if (v === 'guide') api.publicEvent(slug, 'guide_view').catch(() => {}); }}>{label}</button>
        ))}
        <div className="spacer" />
        <button className="btn btn-sm btn-secondary" onClick={() => { api.publicEvent(slug, 'print').catch(() => {}); window.print(); }}>Print / save PDF</button>
      </div>

      {view === 'tool' && (
        <ToolView
          content={data.content}
          answers={answers}
          setAnswers={setAnswers}
          onAllAnswered={() => api.publicEvent(slug, 'complete').catch(() => {})}
          footer={
            <div className="no-print" style={{ marginTop: '1.5rem' }}>
              <div className="card" style={{ background: 'var(--primary-soft)', textAlign: 'center' }}>
                <h3>Ready to talk to your provider?</h3>
                <p>Build a one-page summary of where you are leaning and what you want to discuss.</p>
                <button className="btn" onClick={() => { setView('summary'); window.scrollTo(0, 0); }}>Build my summary</button>
              </div>
              {data.isBeta && data.evaluation && <BetaEval slug={slug} evaluation={data.evaluation} />}
              {!data.isBeta && <FeedbackFooter slug={slug} />}
            </div>
          }
        />
      )}

      {view === 'summary' && (
        <DecisionSummary
          content={data.content}
          answers={answers}
          extraQuestions={extraQuestions}
          setExtraQuestions={setExtraQuestions}
          onShare={() => api.publicEvent(slug, 'share').catch(() => {})}
        />
      )}

      {view === 'guide' && (
        <>
          <h1>Conversation guide</h1>
          <p className="muted">A provider-facing script for using this tool in a visit, following the three-talk model.</p>
          <GuideSection content={data.content} />
        </>
      )}

      {view === 'training' && <div className="card"><TrainingCompanion training={data.training} /></div>}

      <p className="muted" style={{ textAlign: 'center', marginTop: '2rem' }}>
        Built with SDMLab. Version {data.version}.
        {data.lastReviewedAt ? ` Evidence last reviewed ${new Date(data.lastReviewedAt).toLocaleDateString()}.` : ''}
        {' '}This tool supports, and does not replace, a conversation with your healthcare provider.
      </p>
    </div>
  );
}
