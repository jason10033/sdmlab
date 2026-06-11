// Dev helper: seeds a minimal sample tool version, a review invite, and sets the
// first project live so the renderer, review portal, and public tool can be
// exercised without an API key. Run: node sample-data.cjs
const db = require('./db');

const content = {
  title: 'Choosing a PrEP Option (Sample)',
  decisionStatement: 'Which HIV prevention option fits your life best?',
  intro: 'PrEP is medicine that prevents HIV. There is more than one good way to take it. This tool helps you and your provider pick the one that fits your life.',
  options: [
    {
      id: 'oral', name: 'Daily pill', tagline: 'One pill, once a day, at home',
      summary: 'A pill you take every day.',
      howItWorks: 'The medicine builds up in your body and blocks HIV.',
      effectiveness: { text: 'About 99 out of 100 people who take it daily stay HIV negative.', citationIds: ['M1'] },
      benefits: [{ text: 'You are in control and can stop anytime.', citationIds: ['M1'] }],
      risks: [{ text: 'Mild stomach upset in the first weeks for some people.', citationIds: ['M1'] }],
      logistics: 'Pick up at a pharmacy. Lab visits every 3 months.',
      goodFitIf: ['You are good at daily routines'], thinkTwiceIf: ['Pills at home would be a privacy problem'],
    },
    {
      id: 'inj2', name: '2-month injection', tagline: 'A shot at the clinic every 2 months',
      summary: 'An injection given by your clinic six times a year.',
      howItWorks: 'Long-acting medicine stays in your body between visits.',
      effectiveness: { text: 'Slightly more protective than daily pills in studies.', citationIds: ['M1'] },
      benefits: [{ text: 'Nothing to remember between visits.', citationIds: ['M1'] }],
      risks: [{ text: 'Soreness at the injection site for a few days.', citationIds: ['M1'] }],
      logistics: 'Clinic visit every 2 months.',
      goodFitIf: ['Daily pills are hard to remember'], thinkTwiceIf: ['Getting to the clinic is hard'],
    },
  ],
  comparison: [
    { feature: 'How you take it', values: [{ optionId: 'oral', value: 'Pill every day' }, { optionId: 'inj2', value: 'Shot every 2 months' }] },
    { feature: 'Clinic visits', values: [{ optionId: 'oral', value: 'Every 3 months' }, { optionId: 'inj2', value: 'Every 2 months' }] },
  ],
  valuesQuestions: [
    {
      id: 'v1', question: 'How do you feel about taking a pill every day?', helpText: '',
      answers: [
        { label: 'Easy, I already have a routine', favors: ['oral'], note: '' },
        { label: 'I would worry about forgetting', favors: ['inj2'], note: 'Ask about reminders and injectable options.' },
      ],
    },
    {
      id: 'v2', question: 'How easy is it for you to get to the clinic?', helpText: '',
      answers: [
        { label: 'Easy', favors: ['inj2'], note: '' },
        { label: 'Hard - work, travel, or distance', favors: ['oral'], note: 'Mention scheduling challenges to your provider.' },
      ],
    },
  ],
  summaryGuidance: 'This summary shows which options line up with your answers. It is a conversation starter, not a verdict. You and your provider decide together.',
  faqs: [{ q: 'Does PrEP protect against other STIs?', a: 'No. PrEP only prevents HIV. Condoms and regular testing protect against other STIs.', citationIds: ['M1'] }],
  glossary: [{ term: 'PrEP', definition: 'Pre-exposure prophylaxis: medicine taken before possible HIV exposure to prevent infection.' }],
  conversationGuide: {
    steps: [
      { title: 'Team talk', script: 'There is a real choice here, and the best option depends on your life. Can we look at the options together?', tips: ['Name the decision explicitly'] },
      { title: 'Option talk', script: 'Here are the options side by side. Each works very well; they differ in how they fit your routine.', tips: ['Use absolute numbers'] },
      { title: 'Decision talk', script: 'Of everything we discussed, what matters most to you?', tips: ['Review their values summary together'] },
    ],
  },
  citations: [{ id: 'M1', label: 'Team materials: DECIDE PrEP content', source: 'material', url: '' }],
};

const training = {
  overview: 'This sample companion shows how decision-specific training appears alongside the tool.',
  whenToUse: 'After HIV testing and risk discussion, when the patient is PrEP-eligible.',
  introducingTheTool: 'Say: "We have a short tool that lays out the PrEP options side by side. Want to walk through it together?"',
  talkingPoints: ['All options are highly effective; fit matters most.', 'Switching later is always possible.'],
  commonQuestions: [{ q: 'Which one is best?', a: 'They all work extremely well. The best one is the one that fits your routine and life.' }],
  pitfalls: ['Presenting the injectable first to patients you assume are non-adherent is steering.'],
  equityNotes: 'Patients with prior negative healthcare experiences may defer; invite their preferences explicitly.',
  timeNeeded: 'About 10 minutes within a visit.',
};

const project = db.prepare('SELECT * FROM projects ORDER BY id LIMIT 1').get();
if (!project) { console.log('No project found; create one first.'); process.exit(1); }

db.prepare('INSERT OR REPLACE INTO tool_versions (project_id, version, content_json, training_json, note) VALUES (?, ?, ?, ?, ?)')
  .run(project.id, 1, JSON.stringify(content), JSON.stringify(training), 'Sample seed for testing');
db.prepare("UPDATE projects SET stage = 'production', live_at = CURRENT_TIMESTAMP WHERE id = ?").run(project.id);
db.prepare("INSERT OR IGNORE INTO review_invites (project_id, token, audience) VALUES (?, 'sampletoken123', 'provider')").run(project.id);

console.log(`Seeded sample version for "${project.title}" (slug: ${project.slug}); review token: sampletoken123`);
