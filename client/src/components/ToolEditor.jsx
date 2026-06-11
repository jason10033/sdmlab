import React, { useState } from 'react';

// Structured editor over the generated tool content. Edits common fields
// directly; citations attached to edited claims are preserved. Comparison
// table and conversation guide are editable in the Advanced (JSON) section.
export default function ToolEditor({ content, onSave, saving }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(content)));
  const [note, setNote] = useState('');
  const [section, setSection] = useState('basics');
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');

  function set(updater) {
    setDraft((d) => {
      const copy = JSON.parse(JSON.stringify(d));
      updater(copy);
      return copy;
    });
  }

  const sections = [
    ['basics', 'Basics'], ['options', 'Options'], ['values', 'Values questions'], ['faqs', 'FAQs'], ['advanced', 'Advanced (JSON)'],
  ];

  return (
    <div>
      <div className="toolbar">
        {sections.map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${section === id ? '' : 'btn-ghost'}`}
            onClick={() => { setSection(id); if (id === 'advanced') { setRawJson(JSON.stringify(draft, null, 2)); setJsonError(''); } }}>
            {label}
          </button>
        ))}
      </div>

      {section === 'basics' && (
        <>
          <label>Title</label>
          <input type="text" value={draft.title} onChange={(e) => set((d) => { d.title = e.target.value; })} />
          <label>Decision statement</label>
          <textarea value={draft.decisionStatement} onChange={(e) => set((d) => { d.decisionStatement = e.target.value; })} />
          <label>Introduction</label>
          <textarea value={draft.intro} onChange={(e) => set((d) => { d.intro = e.target.value; })} />
          <label>Values summary guidance</label>
          <textarea value={draft.summaryGuidance} onChange={(e) => set((d) => { d.summaryGuidance = e.target.value; })} />
        </>
      )}

      {section === 'options' && draft.options.map((o, oi) => (
        <details className="evidence-item" key={o.id} open={oi === 0}>
          <summary>{o.name}</summary>
          <label>Name</label>
          <input type="text" value={o.name} onChange={(e) => set((d) => { d.options[oi].name = e.target.value; })} />
          <label>Tagline</label>
          <input type="text" value={o.tagline} onChange={(e) => set((d) => { d.options[oi].tagline = e.target.value; })} />
          <label>Summary</label>
          <textarea value={o.summary} onChange={(e) => set((d) => { d.options[oi].summary = e.target.value; })} />
          <label>How it works</label>
          <textarea value={o.howItWorks} onChange={(e) => set((d) => { d.options[oi].howItWorks = e.target.value; })} />
          <label>Effectiveness (citations preserved: {o.effectiveness.citationIds.join(', ') || 'none'})</label>
          <textarea value={o.effectiveness.text} onChange={(e) => set((d) => { d.options[oi].effectiveness.text = e.target.value; })} />
          <label>Day-to-day logistics</label>
          <textarea value={o.logistics} onChange={(e) => set((d) => { d.options[oi].logistics = e.target.value; })} />

          {['benefits', 'risks'].map((kind) => (
            <div key={kind}>
              <label>{kind === 'benefits' ? 'Benefits' : 'Risks'}</label>
              {o[kind].map((item, ii) => (
                <div key={ii} style={{ display: 'flex', gap: '.4rem', marginBottom: '.35rem' }}>
                  <input type="text" value={item.text} title={`Citations: ${item.citationIds.join(', ') || 'none'}`}
                    onChange={(e) => set((d) => { d.options[oi][kind][ii].text = e.target.value; })} />
                  <button className="btn btn-sm btn-danger" onClick={() => set((d) => { d.options[oi][kind].splice(ii, 1); })}>x</button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => set((d) => { d.options[oi][kind].push({ text: '', citationIds: [] }); })}>Add {kind.slice(0, -1)}</button>
            </div>
          ))}

          <label>Might be a good fit if (one per line)</label>
          <textarea value={o.goodFitIf.join('\n')} onChange={(e) => set((d) => { d.options[oi].goodFitIf = e.target.value.split('\n').filter((x) => x.trim()); })} />
          <label>Think twice if (one per line)</label>
          <textarea value={o.thinkTwiceIf.join('\n')} onChange={(e) => set((d) => { d.options[oi].thinkTwiceIf = e.target.value.split('\n').filter((x) => x.trim()); })} />
        </details>
      ))}

      {section === 'values' && draft.valuesQuestions.map((q, qi) => (
        <details className="evidence-item" key={q.id} open={qi === 0}>
          <summary>{q.question}</summary>
          <label>Question</label>
          <input type="text" value={q.question} onChange={(e) => set((d) => { d.valuesQuestions[qi].question = e.target.value; })} />
          <label>Help text</label>
          <input type="text" value={q.helpText} onChange={(e) => set((d) => { d.valuesQuestions[qi].helpText = e.target.value; })} />
          <label>Answers (favors option ids: {draft.options.map((o) => o.id).join(', ')})</label>
          {q.answers.map((a, ai) => (
            <div key={ai} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '.5rem', marginBottom: '.4rem' }}>
              <input type="text" value={a.label} placeholder="Answer label"
                onChange={(e) => set((d) => { d.valuesQuestions[qi].answers[ai].label = e.target.value; })} />
              <input type="text" value={a.favors.join(', ')} placeholder="favors (comma-separated option ids)" style={{ marginTop: '.3rem' }}
                onChange={(e) => set((d) => { d.valuesQuestions[qi].answers[ai].favors = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); })} />
              <input type="text" value={a.note} placeholder="Note for the patient summary (optional)" style={{ marginTop: '.3rem' }}
                onChange={(e) => set((d) => { d.valuesQuestions[qi].answers[ai].note = e.target.value; })} />
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => set((d) => { d.valuesQuestions[qi].answers.push({ label: '', favors: [], note: '' }); })}>Add answer</button>
          <button className="btn btn-sm btn-danger" style={{ marginLeft: '.4rem' }} onClick={() => set((d) => { d.valuesQuestions.splice(qi, 1); })}>Delete question</button>
        </details>
      ))}

      {section === 'faqs' && (
        <>
          {draft.faqs.map((f, fi) => (
            <div key={fi} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '.6rem', marginBottom: '.5rem' }}>
              <input type="text" value={f.q} placeholder="Question" onChange={(e) => set((d) => { d.faqs[fi].q = e.target.value; })} />
              <textarea value={f.a} placeholder="Answer" style={{ marginTop: '.3rem' }} onChange={(e) => set((d) => { d.faqs[fi].a = e.target.value; })} />
              <button className="btn btn-sm btn-danger" onClick={() => set((d) => { d.faqs.splice(fi, 1); })}>Delete</button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => set((d) => { d.faqs.push({ q: '', a: '', citationIds: [] }); })}>Add FAQ</button>
        </>
      )}

      {section === 'advanced' && (
        <>
          <p className="hint">Full tool content as JSON, including the comparison table, conversation guide, glossary, and citations. Apply replaces the working draft.</p>
          <textarea style={{ minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}
            value={rawJson} onChange={(e) => setRawJson(e.target.value)} />
          {jsonError && <div className="error">{jsonError}</div>}
          <button className="btn btn-sm btn-secondary" onClick={() => {
            try { setDraft(JSON.parse(rawJson)); setJsonError(''); setSection('basics'); }
            catch (err) { setJsonError(`Invalid JSON: ${err.message}`); }
          }}>Apply JSON</button>
        </>
      )}

      <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--accent)' }}>
        <label>What changed (saved to the audit trail)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Softened injectable side-effect wording per provider feedback" />
        <div className="toolbar" style={{ marginTop: '.6rem' }}>
          <button className="btn" disabled={saving} onClick={() => onSave(draft, note || 'Manual edit')}>
            {saving ? 'Saving...' : 'Save as new version'}
          </button>
        </div>
      </div>
    </div>
  );
}
