import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ToolView from '../components/ToolView.jsx';
import EvalForm from '../components/EvalForm.jsx';

export default function ReviewPortal() {
  const { token } = useParams();
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [instruments, setInstruments] = useState({});
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.getReview(token).then(setReview).catch((err) => setError(err.message));
  }, [token]);

  async function submit() {
    try {
      await api.submitReview(token, { instruments, comment });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) { setError(err.message); }
  }

  if (error) return <div className="tool-shell"><div className="error">{error}</div></div>;
  if (!review) return <div className="tool-shell"><p className="muted">Loading...</p></div>;
  if (review.completed && !submitted) return <div className="tool-shell"><div className="notice">This evaluation link has already been used. Thank you.</div></div>;
  if (submitted) {
    return (
      <div className="tool-shell">
        <div className="success" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2>Thank you</h2>
          <p>Your evaluation was recorded and will shape the next version of this tool.</p>
        </div>
      </div>
    );
  }

  const stageLabel = review.stage === 'alpha' ? 'alpha testing' : review.stage === 'beta' ? 'beta field testing' : review.stage;

  return (
    <div className="tool-shell">
      <div className="notice no-print">
        You are evaluating a draft (version {review.version}) of this decision tool as a {review.audience}, during {stageLabel}.
        Look through the whole tool below, then complete the short evaluation at the bottom.
      </div>

      <ToolView content={review.content} />

      <div className="card" style={{ borderColor: 'var(--primary)', borderWidth: 2, marginTop: '2rem' }}>
        <h2>Your evaluation</h2>
        <EvalForm
          instruments={review.instruments}
          openQuestions={review.openQuestions}
          value={instruments}
          onChange={setInstruments}
        />
        <label>Anything else you want to add?</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-lg" onClick={submit}>Submit evaluation</button>
        </div>
      </div>
    </div>
  );
}
