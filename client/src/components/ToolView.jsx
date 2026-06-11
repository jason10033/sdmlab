import React, { useEffect, useMemo, useRef, useState } from 'react';

function Cites({ ids, citations }) {
  if (!ids || ids.length === 0) return null;
  return ids.map((id) => {
    const c = (citations || []).find((x) => x.id === id);
    if (!c) return null;
    return (
      <a key={id} className="cite" href={c.url || '#'} target="_blank" rel="noreferrer" title={c.label}>
        [{id}]
      </a>
    );
  });
}

export function OptionsSection({ content }) {
  return (
    <>
      {content.options.map((o) => (
        <div className="option-card" key={o.id}>
          <h3>{o.name}</h3>
          <p className="tagline">{o.tagline}</p>
          <p>{o.summary}</p>
          <p><strong>How it works:</strong> {o.howItWorks}</p>
          <p><strong>How well it works:</strong> {o.effectiveness.text}<Cites ids={o.effectiveness.citationIds} citations={content.citations} /></p>
          <p><strong>Day to day:</strong> {o.logistics}</p>
          <div className="row">
            <div>
              <p className="benefit"><strong>Possible benefits</strong></p>
              <ul>{o.benefits.map((b, i) => <li key={i}>{b.text}<Cites ids={b.citationIds} citations={content.citations} /></li>)}</ul>
            </div>
            <div>
              <p className="risk"><strong>Possible downsides</strong></p>
              <ul>{o.risks.map((r, i) => <li key={i}>{r.text}<Cites ids={r.citationIds} citations={content.citations} /></li>)}</ul>
            </div>
          </div>
          {o.goodFitIf.length > 0 && (
            <>
              <p><strong>Might be a good fit if:</strong></p>
              <div className="pill-list">{o.goodFitIf.map((g, i) => <span key={i}>{g}</span>)}</div>
            </>
          )}
          {o.thinkTwiceIf.length > 0 && (
            <>
              <p><strong>Think twice if:</strong></p>
              <div className="pill-list">{o.thinkTwiceIf.map((g, i) => <span key={i}>{g}</span>)}</div>
            </>
          )}
        </div>
      ))}
    </>
  );
}

export function ComparisonSection({ content }) {
  const optionNames = Object.fromEntries(content.options.map((o) => [o.id, o.name]));
  const optionIds = content.options.map((o) => o.id);
  return (
    <div className="comparison-scroll">
      <table>
        <thead>
          <tr><th></th>{optionIds.map((id) => <th key={id}>{optionNames[id]}</th>)}</tr>
        </thead>
        <tbody>
          {content.comparison.map((row, i) => (
            <tr key={i}>
              <td><strong>{row.feature}</strong></td>
              {optionIds.map((id) => {
                const v = row.values.find((x) => x.optionId === id);
                return <td key={id}>{v ? v.value : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ValuesSection({ content, answers, setAnswers }) {
  return (
    <>
      {content.valuesQuestions.map((q) => (
        <div className="values-q" key={q.id}>
          <p><strong>{q.question}</strong></p>
          {q.helpText && <p className="muted">{q.helpText}</p>}
          <div className="answers">
            {q.answers.map((a, i) => (
              <button
                key={i}
                type="button"
                className={`answer-btn ${answers[q.id] === i ? 'selected' : ''}`}
                onClick={() => setAnswers({ ...answers, [q.id]: i })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function SummarySection({ content, answers }) {
  const tally = useMemo(() => {
    const counts = Object.fromEntries(content.options.map((o) => [o.id, 0]));
    let answered = 0;
    for (const q of content.valuesQuestions) {
      const idx = answers[q.id];
      if (idx === undefined) continue;
      answered++;
      for (const fav of q.answers[idx]?.favors || []) {
        if (fav in counts) counts[fav] += 1;
      }
    }
    return { counts, answered };
  }, [content, answers]);

  const max = Math.max(1, ...Object.values(tally.counts));
  const notes = content.valuesQuestions
    .map((q) => (answers[q.id] !== undefined ? q.answers[answers[q.id]]?.note : null))
    .filter((n) => n && n.trim());

  return (
    <>
      <p>{content.summaryGuidance}</p>
      {tally.answered === 0 ? (
        <p className="muted">Answer the questions above to see which options line up with what matters to you.</p>
      ) : (
        <>
          {content.options.map((o) => (
            <div key={o.id} style={{ marginBottom: '.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{o.name}</strong>
                <span className="muted">{tally.counts[o.id]} of your answers point here</span>
              </div>
              <div className="align-bar"><div style={{ width: `${(tally.counts[o.id] / max) * 100}%` }} /></div>
            </div>
          ))}
          {notes.length > 0 && (
            <>
              <p><strong>Things to bring up with your provider:</strong></p>
              <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

export function GuideSection({ content }) {
  return (
    <>
      {content.conversationGuide.steps.map((s, i) => (
        <div className="card" key={i}>
          <h3>{i + 1}. {s.title}</h3>
          <p style={{ fontStyle: 'italic' }}>"{s.script}"</p>
          {s.tips.length > 0 && <ul>{s.tips.map((t, j) => <li key={j}>{t}</li>)}</ul>}
        </div>
      ))}
    </>
  );
}

export function CitationsSection({ content }) {
  if (!content.citations?.length) return null;
  return (
    <ol style={{ fontSize: '.85rem', color: 'var(--ink-soft)' }}>
      {content.citations.map((c) => (
        <li key={c.id} id={`cite-${c.id}`}>
          [{c.id}] {c.label} {c.url && <a href={c.url} target="_blank" rel="noreferrer">{c.url}</a>}
        </li>
      ))}
    </ol>
  );
}

// Full patient-facing render: one scrolling page with interactive values clarification.
export default function ToolView({ content, footer, onAllAnswered }) {
  const [answers, setAnswers] = useState({});
  const firedComplete = useRef(false);

  useEffect(() => {
    if (firedComplete.current || !onAllAnswered) return;
    if (content.valuesQuestions.length > 0 && Object.keys(answers).length >= content.valuesQuestions.length) {
      firedComplete.current = true;
      onAllAnswered();
    }
  }, [answers, content, onAllAnswered]);

  return (
    <div>
      <div className="tool-header">
        <div className="eyebrow">A shared decision-making tool</div>
        <h1>{content.title}</h1>
        <p>{content.decisionStatement}</p>
      </div>

      <div className="card"><p>{content.intro}</p></div>

      <h2>Your options</h2>
      <OptionsSection content={content} />

      <h2>Side by side</h2>
      <div className="card"><ComparisonSection content={content} /></div>

      <h2 className="no-print">What matters to you?</h2>
      <div className="card no-print">
        <ValuesSection content={content} answers={answers} setAnswers={setAnswers} />
      </div>

      <h2 className="no-print">Your summary</h2>
      <div className="card no-print">
        <SummarySection content={content} answers={answers} />
      </div>

      {content.faqs.length > 0 && (
        <>
          <h2>Common questions</h2>
          <div className="card">
            {content.faqs.map((f, i) => (
              <details className="evidence-item" key={i}>
                <summary>{f.q}</summary>
                <p>{f.a}<Cites ids={f.citationIds} citations={content.citations} /></p>
              </details>
            ))}
          </div>
        </>
      )}

      {content.glossary.length > 0 && (
        <>
          <h2>Words to know</h2>
          <div className="card">
            {content.glossary.map((g, i) => <p key={i}><strong>{g.term}:</strong> {g.definition}</p>)}
          </div>
        </>
      )}

      <h2>Sources</h2>
      <div className="card"><CitationsSection content={content} /></div>

      {footer}
    </div>
  );
}
