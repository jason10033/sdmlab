import React, { useState } from 'react';
import { computeLeaning } from './ToolView.jsx';

// The share-with-provider end product, following the DECIDE "Summary" pattern:
// a patient view and a provider view, printable and emailable. Derived from the
// patient's values-clarification answers. No data is stored.
export default function DecisionSummary({ content, answers, extraQuestions, setExtraQuestions, onShare }) {
  const [view, setView] = useState('patient'); // 'patient' | 'provider'
  const [email, setEmail] = useState('');
  const isProvider = view === 'provider';
  const { answered, ranked, notes } = computeLeaning(content, answers);

  const top = ranked[0];
  const leaning = answered > 0 && top && top.count > 0 ? top.option : null;
  const alternatives = ranked.filter((r) => r.option !== leaning && r.count > 0).map((r) => r.option);

  const questions = [
    ...(content.faqs || []).slice(0, 3).map((f) => f.q),
    ...extraQuestions.filter((q) => q.trim()),
  ];

  function buildText() {
    const lines = [];
    lines.push(isProvider ? 'Patient decision summary' : 'My decision summary to share with my provider');
    lines.push('Decision: ' + content.decisionStatement);
    lines.push('');
    if (leaning) {
      lines.push(isProvider ? 'PATIENT IS LEANING TOWARD' : "I'M LEANING TOWARD");
      lines.push('  ' + leaning.name + (leaning.tagline ? ' - ' + leaning.tagline : ''));
      lines.push('');
    }
    if (alternatives.length) {
      lines.push(isProvider ? 'ALSO OPEN TO' : "I'M ALSO OPEN TO");
      alternatives.forEach((a) => lines.push('  - ' + a.name));
      lines.push('');
    }
    if (notes.length) {
      lines.push('WHAT MATTERS MOST');
      notes.forEach((n) => lines.push('  - ' + n));
      lines.push('');
    }
    if (questions.length) {
      lines.push(isProvider ? 'QUESTIONS THE PATIENT WANTS TO DISCUSS' : 'QUESTIONS I WANT TO ASK');
      questions.forEach((q) => lines.push('  - ' + q));
      lines.push('');
    }
    lines.push('Created with SDMLab. This summary supports a conversation; it is not a medical recommendation.');
    return lines.join('\n');
  }

  function emailIt() {
    if (!email) return;
    const subject = encodeURIComponent(isProvider ? `Decision summary from your patient` : `My decision summary`);
    window.open(`mailto:${email}?subject=${subject}&body=${encodeURIComponent(buildText())}`, '_self');
    if (onShare) onShare();
  }

  if (answered === 0) {
    return <div className="card"><p className="muted">Answer the "what matters to you" questions above first, then come back here to build a summary you can take to your provider.</p></div>;
  }

  return (
    <div>
      <div className="summary-toggle no-print">
        <button className={`toggle-btn ${!isProvider ? 'active' : ''}`} onClick={() => setView('patient')}>My summary</button>
        <button className={`toggle-btn ${isProvider ? 'active' : ''}`} onClick={() => setView('provider')}>For my provider</button>
      </div>

      <div className="tool-header">
        <h1>{isProvider ? 'Patient decision summary' : 'Your summary to share'}</h1>
        <p className="muted">{isProvider
          ? 'Your patient completed this decision tool and wants to share where they are leaning and what matters to them.'
          : 'Take this to your visit. It captures where you are leaning and what you want to talk about.'}</p>
      </div>

      {leaning && (
        <div className="summary-card">
          <h2>{isProvider ? 'Leaning toward' : "I'm leaning toward"}</h2>
          <div className="lean-card">
            <h3 style={{ margin: 0 }}>{leaning.name}</h3>
            {leaning.tagline && <p style={{ margin: '.2rem 0 0' }}>{leaning.tagline}</p>}
          </div>
          {alternatives.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginTop: '.6rem' }}>{isProvider ? 'Also open to:' : "I'm also open to:"}</p>
              <div className="pill-list">{alternatives.map((a) => <span key={a.id}>{a.name}</span>)}</div>
            </>
          )}
        </div>
      )}

      {notes.length > 0 && (
        <div className="summary-card">
          <h2>What matters most {isProvider ? 'to this patient' : 'to me'}</h2>
          <ul className="checklist">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      <div className="summary-card">
        <h2>{isProvider ? 'Questions to discuss' : 'Questions I want to ask'}</h2>
        <ul className="checklist">{questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        {!isProvider && (
          <div className="no-print">
            <label>Add your own question</label>
            {extraQuestions.map((q, i) => (
              <input key={i} type="text" value={q} placeholder="Type a question for your provider"
                style={{ marginBottom: '.4rem' }}
                onChange={(e) => { const next = [...extraQuestions]; next[i] = e.target.value; setExtraQuestions(next); }} />
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setExtraQuestions([...extraQuestions, ''])}>+ Add another question</button>
          </div>
        )}
      </div>

      <div className="print-cta no-print">
        <button className="btn btn-lg" onClick={() => { if (onShare) onShare(); window.print(); }}>Print this summary</button>
      </div>
      <div className="card no-print" style={{ maxWidth: 460, margin: '0 auto' }}>
        <label>{isProvider ? "Email to your provider" : 'Email this to yourself or your provider'}</label>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email address" />
          <button className="btn" disabled={!email} onClick={emailIt}>Send</button>
        </div>
        <p className="hint">Opens your email app with the summary filled in. Nothing is stored by SDMLab.</p>
      </div>
    </div>
  );
}
