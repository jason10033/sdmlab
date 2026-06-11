import React from 'react';

// Renders validated instruments (SURE, PrepDM, IPDASi) plus open questions.
// `instruments` and `openQuestions` come straight from the server so the two
// stay in sync. Collects answers into the `value` object via onChange.
export default function EvalForm({ instruments = [], openQuestions = [], value, onChange }) {
  function setInstrument(instId, itemId, answer) {
    onChange({ ...value, [instId]: { ...(value[instId] || {}), [itemId]: answer } });
  }
  function setOpen(qid, answer) {
    onChange({ ...value, open: { ...(value.open || {}), [qid]: answer } });
  }

  return (
    <div>
      {instruments.map((inst) => (
        <div className="card" key={inst.id} style={{ background: 'var(--bg-warm)' }}>
          <h3>{inst.name}</h3>
          {inst.scoring && <p className="hint">{inst.scoring}</p>}
          {inst.items.map((item) => {
            const current = value[inst.id]?.[item.id];
            return (
              <div key={item.id} style={{ marginBottom: '.7rem' }}>
                <p style={{ fontWeight: 600, margin: '0 0 .35rem' }}>{item.text}</p>
                {inst.type === 'yesno' ? (
                  <div className="pill-list">
                    {['Yes', 'No'].map((opt) => (
                      <button key={opt} type="button"
                        className={`answer-btn ${current === opt ? 'selected' : ''}`}
                        style={{ padding: '.35rem 1.2rem' }}
                        onClick={() => setInstrument(inst.id, item.id, opt)}>{opt}</button>
                    ))}
                  </div>
                ) : (
                  <div className="pill-list">
                    {inst.scale.map((lab, i) => (
                      <button key={i} type="button"
                        className={`answer-btn ${current === i + 1 ? 'selected' : ''}`}
                        style={{ padding: '.35rem .7rem', fontSize: '.85rem' }}
                        onClick={() => setInstrument(inst.id, item.id, i + 1)}>{lab}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {openQuestions.length > 0 && (
        <div className="card" style={{ background: 'var(--bg-warm)' }}>
          <h3>A few more questions</h3>
          {openQuestions.map((q) => (
            <div key={q.id} style={{ marginBottom: '.8rem' }}>
              <label>{q.label}</label>
              {q.type === 'scale' ? (
                <div className="pill-list">
                  {['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((lab, i) => (
                    <button key={i} type="button"
                      className={`answer-btn ${value.open?.[q.id] === i + 1 ? 'selected' : ''}`}
                      style={{ padding: '.35rem .7rem', fontSize: '.85rem' }}
                      onClick={() => setOpen(q.id, i + 1)}>{lab}</button>
                  ))}
                </div>
              ) : (
                <textarea value={value.open?.[q.id] || ''} onChange={(e) => setOpen(q.id, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
