// The SDMLab lifecycle, mapped to the IPDAS development process model.
// Each stage carries guidance and a checklist of the IPDAS criteria it addresses,
// so builders are walked through a defensible development process.

const STAGES = ['scope', 'evidence', 'design', 'prototype', 'alpha', 'beta', 'production'];

const STAGE_INFO = {
  scope: {
    label: 'Scope & materials',
    short: 'Scope',
    summary: 'Define the decision and gather the materials your tool will draw on.',
    ipdas: 'IPDAS: the decision aid states the decision explicitly and describes the health condition.',
    checklist: [
      'The decision and all reasonable options are stated precisely (including not acting now).',
      'Existing materials, guidelines, and prior aids are gathered as source content.',
      'The intended users and clinical context are clear.',
    ],
  },
  evidence: {
    label: 'Evidence synthesis',
    short: 'Evidence',
    summary: 'Assemble the evidence on values, preferences, benefits, and harms.',
    ipdas: 'IPDAS: probabilities of outcomes are based on up-to-date evidence with a known production date; sources and any conflicts of interest are disclosed.',
    checklist: [
      'Literature searched for values/preferences, benefits, harms, effectiveness, and guidelines.',
      'Each included source is reviewed and citable.',
      'Patient community sources identified for ongoing monitoring.',
    ],
  },
  design: {
    label: 'Design & population',
    short: 'Design',
    summary: 'Profile your patients and setting, drawing on your clinical experience and the literature you reviewed in the Evidence step, so the tool is tailored and balanced.',
    ipdas: 'IPDAS: options are shown in comparable detail; the aid is tailored to users and uses plain language; values clarification is planned.',
    checklist: [
      'Patient population, values, concerns, barriers, and literacy described.',
      'Plan for balanced presentation of every option.',
      'Reading level and format decided (6th-8th grade).',
    ],
  },
  prototype: {
    label: 'Prototype (draft)',
    short: 'Prototype',
    summary: 'Generate and refine the draft decision aid.',
    ipdas: 'IPDAS: the aid presents balanced options with benefits/harms in comparable detail, supports values clarification, and avoids implicit bias.',
    checklist: [
      'A full IPDAS-structured draft has been generated.',
      'Every claim carries a citation.',
      'Builder has reviewed and edited the draft.',
    ],
  },
  alpha: {
    label: 'Alpha testing',
    short: 'Alpha',
    summary: 'Test usability and comprehension with providers and patients.',
    ipdas: 'IPDAS development: alpha testing with patients and clinicians for comprehension, usability, and acceptability; iterate before field testing.',
    checklist: [
      'Reviewed by the target number of providers.',
      'Reviewed by the target number of patients.',
      'Feedback incorporated; revisions logged.',
    ],
  },
  beta: {
    label: 'Beta (field testing)',
    short: 'Beta',
    summary: 'Field-test the tool with real users on the live website.',
    ipdas: 'IPDAS development: beta/field testing in the real clinical context with end users; collect evaluation data before production release.',
    checklist: [
      'Tool published for field testing (open link / subdomain).',
      'Evaluation data collected from real users.',
      'No critical issues outstanding.',
    ],
  },
  production: {
    label: 'Production (live)',
    short: 'Production',
    summary: 'Release the tool and begin ongoing monitoring.',
    ipdas: 'IPDAS: a plan exists to update the aid as new evidence emerges; the aid is dated and its update policy stated.',
    checklist: [
      'Tool released for routine use.',
      'Weekly literature and community monitoring active.',
      'Update and review schedule in place.',
    ],
  },
};

module.exports = { STAGES, STAGE_INFO };
