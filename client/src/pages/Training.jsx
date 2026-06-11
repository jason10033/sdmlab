import React, { useState } from 'react';

// General SDM skills module (three-talk model). Decision-specific training is
// generated per tool; this module covers the skills that apply to every tool.
const MODULE = [
  {
    id: 'what',
    title: 'What shared decision-making is (and is not)',
    body: [
      'Shared decision-making (SDM) is a conversation in which the clinician contributes evidence about options, benefits, and harms, and the patient contributes expertise about their own life, values, and circumstances. The output is a decision both can stand behind.',
      'SDM applies when there is more than one reasonable path, including the option of not acting now. It is not appropriate for decisions with a single clearly superior choice or in emergencies.',
      'SDM is not handing the patient a brochure, and it is not asking "any questions?" at the end of a recommendation you have already made. The tool you build with SDMLab supports the conversation; it does not replace it.',
    ],
    check: {
      q: 'A patient asks "what would you do, doc?" The best SDM-consistent response is:',
      answers: [
        { label: 'Tell them what you would choose, since they asked.', correct: false, why: 'Your circumstances are not theirs. Sharing your choice this early often ends deliberation prematurely.' },
        { label: 'Acknowledge the question, then explore what matters to them before sharing a tailored recommendation.', correct: true, why: 'You can and should offer guidance, but anchored to their stated values, not your own.' },
        { label: 'Decline to give any opinion to stay neutral.', correct: false, why: 'Refusing to guide abandons the patient. SDM is shared, not unassisted.' },
      ],
    },
  },
  {
    id: 'team',
    title: 'Talk 1: Team talk',
    body: [
      'Open by making the decision explicit and establishing partnership: "There is a decision to make here, there is more than one good option, and the right choice depends on what matters to you. I would like us to work through it together."',
      'Patients often do not realize a decision exists; they expect to be told. Naming the choice, and naming their role in it, is the step most often skipped.',
      'Offer support without pressure: "I will share what we know about each option, and I want to hear how each would fit your life."',
    ],
    check: {
      q: 'Which opening best launches team talk?',
      answers: [
        { label: '"Guidelines say you should start this medication."', correct: false, why: 'This frames the decision as already made.' },
        { label: '"There are a few good ways to go here, and the best one depends on you. Can we look at them together?"', correct: true, why: 'It names the choice, legitimizes preference, and invites partnership.' },
        { label: '"Here is a handout; let me know what you decide."', correct: false, why: 'Information transfer without deliberation is not SDM.' },
      ],
    },
  },
  {
    id: 'option',
    title: 'Talk 2: Option talk',
    body: [
      'Present the options in a balanced way, using the decision tool: what each involves day to day, how well it works, and its downsides. Use absolute numbers ("99 out of 100") rather than relative risk, and pair numbers with plain-language framing.',
      'Check understanding with teach-back: "Just so I know I explained it well, how would you describe the difference between these two options?"',
      'Watch your own steering: order of presentation, tone, and how long you dwell on each option all signal preference. The tool helps by giving every option the same structure.',
    ],
    check: {
      q: 'Why use absolute numbers instead of relative risk?',
      answers: [
        { label: 'They sound more impressive.', correct: false, why: 'The opposite; relative risk usually sounds more dramatic, which is why it misleads.' },
        { label: 'They give patients an honest sense of how likely an outcome really is.', correct: true, why: '"Cuts risk in half" can mean 2 in 100 to 1 in 100. "1 fewer out of 100" is what actually happened.' },
        { label: 'Guidelines require them.', correct: false, why: 'Many standards recommend them (including IPDAS) but the reason is comprehension, not compliance.' },
      ],
    },
  },
  {
    id: 'decision',
    title: 'Talk 3: Decision talk',
    body: [
      'Move from options to preferences: "Of the things we talked about, what matters most to you?" The values-clarification section of the tool does this work explicitly; review the patient\'s summary together.',
      'Then integrate: offer a recommendation anchored to their stated values ("Given that staying private from your household matters most, the injectable option fits that best"), and check: "Does that feel right to you?"',
      'Close the loop: confirm the decision, the plan, and that it can be revisited. Deferring is a legitimate outcome; so is changing course later.',
    ],
    check: {
      q: 'A patient completes the values exercise and their answers point to option A, but they choose option B. You should:',
      answers: [
        { label: 'Explore the discrepancy with curiosity, then support their informed choice.', correct: true, why: 'The summary is a conversation starter. People weigh things the tool cannot capture; an informed choice that differs from the tally is still a good SDM outcome.' },
        { label: 'Tell them the tool indicates option A is correct for them.', correct: false, why: 'The tool does not make decisions, and treating it as a verdict undermines the whole approach.' },
        { label: 'Restart the values exercise until the answers match.', correct: false, why: 'That is steering with extra steps.' },
      ],
    },
  },
  {
    id: 'equity',
    title: 'Equity, literacy, and trust',
    body: [
      'SDM fails quietly when patients do not feel entitled to a preference. Patients who have experienced discrimination in healthcare may defer ("whatever you think") as self-protection. Explicit invitation, repeated, matters more for these patients, not less.',
      'Keep language at a 6th-8th grade level, define necessary terms, and use teach-back rather than asking "do you understand?". Offer the printed version for patients who want to involve partners or family.',
      'Document the conversation, not just the choice: options discussed, values expressed, decision made, and the plan to revisit.',
    ],
    check: {
      q: 'A patient says "whatever you think is best" early in the conversation. The best response is:',
      answers: [
        { label: 'Accept it and choose for them; preference includes the preference to delegate.', correct: false, why: 'Early deferral is often a trust or entitlement signal, not a settled preference. Delegation is acceptable only after a genuine invitation.' },
        { label: 'Gently persist: "I will absolutely give you my advice. First, can I ask a couple of questions about what your day to day looks like, so my advice actually fits your life?"', correct: true, why: 'It honors the request for guidance while keeping the door open for their values to enter the decision.' },
        { label: 'Explain that you are not allowed to decide for them.', correct: false, why: 'Untrue and unkind; it abandons a patient who asked for help.' },
      ],
    },
  },
];

function Check({ check }) {
  const [picked, setPicked] = useState(null);
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '.8rem 1rem', marginTop: '.8rem' }}>
      <p><strong>Quick check:</strong> {check.q}</p>
      <div className="answers" style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
        {check.answers.map((a, i) => (
          <button key={i} type="button" className={`answer-btn ${picked === i ? 'selected' : ''}`} onClick={() => setPicked(i)}>
            {a.label}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={check.answers[picked].correct ? 'success' : 'notice'}>
          {check.answers[picked].correct ? 'Right. ' : 'Not quite. '}{check.answers[picked].why}
        </div>
      )}
    </div>
  );
}

export default function Training() {
  const [done, setDone] = useState({});
  const total = MODULE.length;
  const completed = Object.values(done).filter(Boolean).length;

  return (
    <div className="page page-narrow">
      <h1>Shared decision-making skills</h1>
      <p className="muted">
        The general skills module, built on the three-talk model (team talk, option talk, decision talk).
        Each SDM tool you build also generates its own decision-specific training companion; this module covers what applies to every tool.
      </p>
      <div className="progressbar"><div style={{ width: `${(completed / total) * 100}%` }} /></div>
      {MODULE.map((section, idx) => (
        <div className="card" key={section.id}>
          <div className="toolbar" style={{ marginBottom: '.2rem' }}>
            <h2 style={{ margin: 0 }}>{section.title}</h2>
            <div className="spacer" />
            <label style={{ margin: 0, fontWeight: 400 }} className="muted">
              <input type="checkbox" checked={!!done[section.id]} onChange={(e) => setDone({ ...done, [section.id]: e.target.checked })} /> Mark complete
            </label>
          </div>
          {section.body.map((p, i) => <p key={i}>{p}</p>)}
          <Check check={section.check} />
        </div>
      ))}
      {completed === total && <div className="success">Module complete. The decision-specific companion for each tool lives in that tool's Draft panel and on the live tool's Provider training tab.</div>}
    </div>
  );
}
