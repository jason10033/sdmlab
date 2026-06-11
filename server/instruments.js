// Evaluation instruments. Validated measures plus an IPDASi-style criteria
// checklist, shared between the eval portal (rendering) and exports (labels).
// These definitions are served to the client so both stay in sync.

// SURE test: 4-item screening for decisional conflict (O'Connor & Legare).
// Each item yes(1)/no(0); a score < 4 suggests clinically significant conflict.
const SURE = {
  id: 'sure',
  name: 'SURE (decisional conflict screening)',
  audience: 'patient',
  type: 'yesno',
  scoring: 'Sum of yes responses (0-4). A score below 4 flags possible decisional conflict.',
  items: [
    { id: 'sure_s', text: 'Do you feel SURE about the best choice for you?' },
    { id: 'sure_u', text: 'Do you know the benefits and risks of each option?' },
    { id: 'sure_r', text: 'Are you clear about which benefits and risks matter most to you?' },
    { id: 'sure_e', text: 'Do you have enough support and advice to make a choice?' },
  ],
};

// Preparation for Decision Making (PrepDM), 10 items, 5-point (1-5).
const PREPDM = {
  id: 'prepdm',
  name: 'Preparation for Decision Making',
  audience: 'patient',
  type: 'scale5',
  scale: ['Not at all', 'A little', 'Somewhat', 'Quite a bit', 'A great deal'],
  scoring: 'Mean of the 10 items, rescaled 0-100. Higher = better preparation.',
  items: [
    { id: 'pdm_1', text: 'This tool helped me recognize that a decision needs to be made.' },
    { id: 'pdm_2', text: 'It helped me think about which benefits and risks matter most to me.' },
    { id: 'pdm_3', text: 'It helped me know that the decision depends on what matters most to me.' },
    { id: 'pdm_4', text: 'It helped me organize my own thoughts about the decision.' },
    { id: 'pdm_5', text: 'It helped me think about how involved I want to be in the decision.' },
    { id: 'pdm_6', text: 'It helped me identify questions I want to ask my provider.' },
    { id: 'pdm_7', text: 'It prepared me to talk with my provider about what matters most to me.' },
    { id: 'pdm_8', text: 'It prepared me to make a better decision with my provider.' },
    { id: 'pdm_9', text: 'It helped me think about how much I want to be involved.' },
    { id: 'pdm_10', text: 'It helped me prepare for a follow-up conversation with my provider.' },
  ],
};

// IPDASi-style qualifying criteria, scored by clinician reviewers (4-point agreement).
const IPDASI = {
  id: 'ipdasi',
  name: 'IPDAS quality criteria (reviewer)',
  audience: 'provider',
  type: 'scale4',
  scale: ['Strongly disagree', 'Disagree', 'Agree', 'Strongly agree'],
  scoring: 'Mean agreement across criteria. Use as a quality check, not a pass/fail.',
  items: [
    { id: 'ip_decision', text: 'The decision aid states the decision that needs to be made.' },
    { id: 'ip_options', text: 'It describes the options available.' },
    { id: 'ip_balanced', text: 'It shows the options in comparable detail, without bias toward any option.' },
    { id: 'ip_benefits', text: 'It describes the positive features (benefits) of each option.' },
    { id: 'ip_harms', text: 'It describes the negative features (harms, side effects) of each option.' },
    { id: 'ip_probabilities', text: 'It presents outcome probabilities in an understandable, balanced way.' },
    { id: 'ip_values', text: 'It helps patients clarify which benefits and harms matter most to them.' },
    { id: 'ip_evidence', text: 'It is based on up-to-date evidence with citations.' },
    { id: 'ip_plain', text: 'It uses plain language appropriate for patients.' },
  ],
};

const INSTRUMENTS = { SURE, PREPDM, IPDASI };

// Which instruments apply at each stage, by audience.
const STAGE_INSTRUMENTS = {
  alpha: { patient: ['sure', 'prepdm'], provider: ['ipdasi'] },
  beta: { patient: ['sure', 'prepdm'], provider: ['ipdasi'] },
};

function instrumentsFor(stage, audience) {
  const ids = (STAGE_INSTRUMENTS[stage] || {})[audience] || [];
  return ids.map((id) => Object.values(INSTRUMENTS).find((i) => i.id === id)).filter(Boolean);
}

module.exports = { INSTRUMENTS, STAGE_INSTRUMENTS, instrumentsFor };
