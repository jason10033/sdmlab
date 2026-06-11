import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ToolView from '../components/ToolView.jsx';

export default function ReviewPortal() {
  const { token } = useParams();
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [responses, setResponses] = useState({});
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.getReview(token).then(setReview).catch((err) => setError(err.message));
  }, [token]);

  async function submit() {
    try {
      await api.submitReview(token, { responses, comment });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) { setError(err.message); }
  }

  if (error) return <div className="tool-shell"><div className="error">{error}</div></div>;
  if (!review) return <div className="tool-shell"><p className="muted">Loading...</p></div>;
  if (review.completed && !submitted) return <div className="tool-shell"><div className="notice">This review link has already been used. Thank you.</div></div>;
  if (submitted) {
    return (
      <div className="tool-shell">
        <div className="success" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2>Thank you</h2>
          <p>Your feedback was recorded and will shape the next version of this tool.</p>
        </div>
      </div>
    );
  }

  const scaleLabels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

  return (
    <div className="tool-shell">
      <div className="notice no-print">
        You are reviewing a draft (version {review.version}) of this decision tool as a {review.audience}.
        Look through the whole tool below, then answer the questions at the bottom.
      </div>

      <ToolView content={review.content} />

      <div className="card" style={{ borderColor: 'var(--accent)', marginTop: '2rem' }}>
        <h2>Your review</h2>
        {review.questions.map((q) => (
          <div key={q.id} style={{ marginBottom: '1rem' }}>
            <label>{q.label}</label>
            {q.type === 'scale' ? (
              <div className="pill-list">
                {scaleLabels.map((lab, i) => (
                  <button key={i} type="button"
                    className={`answer-btn ${responses[q.id] === i + 1 ? 'selected' : ''}`}
                    style={{ padding: '.35rem .7rem' }}
                    onClick={() => setResponses({ ...responses, [q.id]: i + 1 })}>
                    {lab}
                  </button>
                ))}
              </div>
            ) : (
              <textarea value={responses[q.id] || ''} onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })} />
            )}
          </div>
        ))}
        <label>Anything else?</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        <div style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={submit}>Submit review</button>
        </div>
      </div>
    </div>
  );
}
