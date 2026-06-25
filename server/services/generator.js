const { askJson } = require('./anthropic');

// ---------------------------------------------------------------------------
// Population interview: questions the builder answers about their patients.
// ---------------------------------------------------------------------------
const INTERVIEW_QUESTIONS = [
  { id: 'population', label: 'Describe the patient population this tool is for (age range, communities served, clinical setting).', type: 'text' },
  { id: 'values', label: 'What values and preferences do you expect to matter most to your patients in this decision (e.g. privacy, convenience, cost, avoiding needles, control)?', type: 'text' },
  { id: 'concerns', label: 'What worries, misconceptions, or questions do patients in your setting commonly raise about these options?', type: 'text' },
  { id: 'barriers', label: 'What practical barriers exist for your population (insurance, transportation, visit frequency, stigma, language)?', type: 'text' },
  { id: 'literacy', label: 'Anything to know about health literacy, numeracy, or how your patients prefer information presented?', type: 'text' },
  { id: 'workflow', label: 'How will the tool be used in your clinic workflow (before the visit, during, by whom)?', type: 'text' },
  { id: 'emphasis', label: 'Is there anything you want the tool to emphasize, de-emphasize, or avoid?', type: 'text' },
];

// ---------------------------------------------------------------------------
// JSON Schemas for structured outputs (additionalProperties:false throughout).
// ---------------------------------------------------------------------------
const PUBMED_QUERY_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          purpose: { type: 'string', enum: ['values_preferences', 'risks_benefits', 'effectiveness', 'guidelines'] },
          query: { type: 'string' },
        },
        required: ['purpose', 'query'],
        additionalProperties: false,
      },
    },
    surveillanceQuery: { type: 'string' },
  },
  required: ['queries', 'surveillanceQuery'],
  additionalProperties: false,
};

const EVIDENCE_TAG_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pmid: { type: 'string' },
          relevant: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string', enum: ['values', 'preferences', 'risks', 'benefits', 'effectiveness', 'guidelines', 'other'] } },
          summary: { type: 'string' },
        },
        required: ['pmid', 'relevant', 'tags', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const SUBREDDIT_PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string' },
          recommended: { type: 'boolean' },
        },
        required: ['name', 'rationale', 'recommended'],
        additionalProperties: false,
      },
    },
    searchTerms: { type: 'array', items: { type: 'string' } },
  },
  required: ['picks', 'searchTerms'],
  additionalProperties: false,
};

const cited = (textField = 'text') => ({
  type: 'object',
  properties: {
    [textField]: { type: 'string' },
    citationIds: { type: 'array', items: { type: 'string' } },
  },
  required: [textField, 'citationIds'],
  additionalProperties: false,
});

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    decisionStatement: { type: 'string' },
    intro: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          tagline: { type: 'string' },
          summary: { type: 'string' },
          howItWorks: { type: 'string' },
          effectiveness: cited(),
          benefits: { type: 'array', items: cited() },
          risks: { type: 'array', items: cited() },
          logistics: { type: 'string' },
          goodFitIf: { type: 'array', items: { type: 'string' } },
          thinkTwiceIf: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'name', 'tagline', 'summary', 'howItWorks', 'effectiveness', 'benefits', 'risks', 'logistics', 'goodFitIf', 'thinkTwiceIf'],
        additionalProperties: false,
      },
    },
    comparison: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          feature: { type: 'string' },
          values: {
            type: 'array',
            items: {
              type: 'object',
              properties: { optionId: { type: 'string' }, value: { type: 'string' } },
              required: ['optionId', 'value'],
              additionalProperties: false,
            },
          },
        },
        required: ['feature', 'values'],
        additionalProperties: false,
      },
    },
    valuesQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          helpText: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                favors: { type: 'array', items: { type: 'string' } },
                note: { type: 'string' },
              },
              required: ['label', 'favors', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'question', 'helpText', 'answers'],
        additionalProperties: false,
      },
    },
    summaryGuidance: { type: 'string' },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' },
          citationIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['q', 'a', 'citationIds'],
        additionalProperties: false,
      },
    },
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        properties: { term: { type: 'string' }, definition: { type: 'string' } },
        required: ['term', 'definition'],
        additionalProperties: false,
      },
    },
    conversationGuide: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              script: { type: 'string' },
              tips: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'script', 'tips'],
            additionalProperties: false,
          },
        },
      },
      required: ['steps'],
      additionalProperties: false,
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          source: { type: 'string', enum: ['pubmed', 'material', 'guideline'] },
          url: { type: 'string' },
        },
        required: ['id', 'label', 'source', 'url'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'decisionStatement', 'intro', 'options', 'comparison', 'valuesQuestions', 'summaryGuidance', 'faqs', 'glossary', 'conversationGuide', 'citations'],
  additionalProperties: false,
};

const TRAINING_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    whenToUse: { type: 'string' },
    introducingTheTool: { type: 'string' },
    talkingPoints: { type: 'array', items: { type: 'string' } },
    commonQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, a: { type: 'string' } },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
    pitfalls: { type: 'array', items: { type: 'string' } },
    equityNotes: { type: 'string' },
    timeNeeded: { type: 'string' },
  },
  required: ['overview', 'whenToUse', 'introducingTheTool', 'talkingPoints', 'commonQuestions', 'pitfalls', 'equityNotes', 'timeNeeded'],
  additionalProperties: false,
};

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          flag: { type: 'boolean' },
          relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
          whyFlagged: { type: 'string' },
        },
        required: ['id', 'flag', 'relevance', 'whyFlagged'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------
const SYSTEM = 'You are SDMLab, an expert assistant that helps clinicians build IPDAS-compliant shared decision-making tools. You are rigorous about evidence, balanced presentation of options, and plain language at a 6th-8th grade reading level. You never invent citations.';

// Fallback (mock) mode: lets the whole pipeline run without an API key, with
// real PubMed/Reddit data and clearly-labeled placeholder content where the AI
// would be. A real key always wins.
function isMock() {
  return process.env.MOCK_AI === '1' && !process.env.ANTHROPIC_API_KEY;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Crude topic/option extraction used only by fallback mode.
function mockTopic(decision) {
  return decision.split(/[.:]/)[0].trim().slice(0, 80);
}

const STOPWORDS = new Set(['choosing', 'choice', 'option', 'options', 'starting', 'start', 'deciding', 'decision', 'about', 'between', 'whether', 'with', 'the', 'and', 'for', 'not', 'now', 'a', 'an', 'or', 'of', 'to']);
function mockKeywords(decision) {
  const words = mockTopic(decision).toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words.slice(0, 4).join(' ');
}

function mockOptions(decision) {
  const after = decision.includes(':') ? decision.slice(decision.indexOf(':') + 1) : decision;
  const parts = after.split(/,| or |;/).map((s) => s.trim().replace(/\.$/, '')).filter((s) => s.length > 2 && s.length < 80);
  const names = parts.slice(0, 5);
  return names.length >= 2 ? names : ['Option A', 'Option B'];
}

async function buildPubmedQueries(decision) {
  if (isMock()) {
    const topic = mockTopic(decision);
    return {
      queries: [
        { purpose: 'values_preferences', query: `(${topic}) AND (patient preference OR values OR qualitative OR acceptability)` },
        { purpose: 'risks_benefits', query: `(${topic}) AND (adverse effects OR safety OR harms OR benefits)` },
        { purpose: 'effectiveness', query: `(${topic}) AND (effectiveness OR efficacy OR comparative)` },
        { purpose: 'guidelines', query: `(${topic}) AND (guideline OR recommendation)` },
      ],
      surveillanceQuery: mockKeywords(decision),
    };
  }
  return askJson({
    system: SYSTEM,
    prompt: `A clinical team is building a shared decision-making tool for this decision:\n\n"${decision}"\n\nWrite PubMed search queries (using standard PubMed syntax, MeSH terms where helpful) to find:\n1. Patient values and preferences research for this decision\n2. Risks and benefits / harms evidence\n3. Effectiveness and comparative effectiveness evidence\n4. Current guidelines\n\nAlso write one broad "surveillanceQuery" suitable for a weekly automated scan for new developments on this topic. Keep each query focused; do not over-restrict with too many ANDs.`,
    schema: PUBMED_QUERY_SCHEMA,
    maxTokens: 4000,
  });
}

async function tagEvidence(decision, articles) {
  if (isMock()) {
    return {
      items: articles.map((a) => ({
        pmid: a.pmid,
        relevant: true,
        tags: ['other'],
        summary: 'Fallback screening (no API key): included for manual review.',
      })),
    };
  }
  // Batch to keep each response comfortably inside output limits.
  const results = [];
  for (const batch of chunk(articles, 12)) {
    const list = batch.map((a) => `PMID ${a.pmid}\nTitle: ${a.title}\nAbstract: ${(a.abstract || '(no abstract)').slice(0, 1800)}`).join('\n\n---\n\n');
    const { items } = await askJson({
      system: SYSTEM,
      prompt: `Decision being built into an SDM tool: "${decision}"\n\nScreen these PubMed abstracts. For each, decide if it is relevant to building the decision aid, tag it (values, preferences, risks, benefits, effectiveness, guidelines, other), and write a 1-2 sentence plain-language summary of what it contributes. Be inclusive at this screening stage; a human will review.\n\n${list}`,
      schema: EVIDENCE_TAG_SCHEMA,
      maxTokens: 16000,
    });
    results.push(...items);
  }
  return { items: results };
}

async function pickSubreddits(decision, candidates) {
  if (isMock()) {
    const sorted = [...candidates].sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));
    return {
      picks: sorted.map((c, i) => ({
        name: c.name,
        rationale: `Fallback selection (no API key): matched the topic search, ${(c.subscribers || 0).toLocaleString()} members. Verify relevance manually.`,
        recommended: i < 5 && (c.subscribers || 0) > 1000,
      })),
      searchTerms: mockTopic(decision).split(/\s+/).slice(0, 5),
    };
  }
  const list = candidates.map((c) => `r/${c.name} (${c.subscribers} members${c.over18 ? ', 18+' : ''}): ${c.title}. ${c.description}`).join('\n');
  return askJson({
    system: SYSTEM,
    prompt: `Decision: "${decision}"\n\nThese subreddits were found by searching Reddit. Pick which are genuinely relevant communities where patients discuss this decision (exclude meme, dating, or off-topic communities). Also suggest 3-5 search terms to use when scanning these communities weekly for posts the clinical team should see (new side-effect chatter, access problems, misinformation, emerging questions).\n\n${list}`,
    schema: SUBREDDIT_PICK_SCHEMA,
    maxTokens: 4000,
  });
}

function mockGenerateTool({ decision, evidence, options = [] }) {
  const names = options.length ? options.map((o) => o.name) : mockOptions(decision);
  const citations = [
    { id: 'M1', label: 'Team materials (uploaded intake content)', source: 'material', url: '' },
    ...evidence.map((e) => ({
      id: `E${e.id}`,
      label: `${e.title} (${e.journal || 'journal'}, ${e.year || 'n.d.'})`,
      source: 'pubmed',
      url: e.url || '',
    })),
  ];
  const PLACEHOLDER = '[FALLBACK DRAFT - no API key was set, so this is placeholder structure, not generated clinical content. Replace via Edit content or regenerate with a key.]';
  const builtOptions = names.map((name, i) => ({
    id: `opt${i + 1}`,
    name,
    tagline: PLACEHOLDER,
    summary: PLACEHOLDER,
    howItWorks: PLACEHOLDER,
    effectiveness: { text: PLACEHOLDER, citationIds: ['M1'] },
    benefits: [{ text: PLACEHOLDER, citationIds: ['M1'] }],
    risks: [{ text: PLACEHOLDER, citationIds: ['M1'] }],
    logistics: PLACEHOLDER,
    goodFitIf: ['(fill in)'],
    thinkTwiceIf: ['(fill in)'],
  }));
  return {
    title: `${mockTopic(decision)} (fallback draft)`,
    decisionStatement: decision,
    intro: PLACEHOLDER,
    options: builtOptions,
    comparison: [
      { feature: 'How you take it', values: builtOptions.map((o) => ({ optionId: o.id, value: '(fill in)' })) },
      { feature: 'Visit frequency', values: builtOptions.map((o) => ({ optionId: o.id, value: '(fill in)' })) },
    ],
    valuesQuestions: [
      {
        id: 'v1', question: 'What matters most to you in this decision?', helpText: '(fallback question; replace)',
        answers: builtOptions.map((o) => ({ label: `Something that fits: ${o.name}`, favors: [o.id], note: '' })),
      },
    ],
    summaryGuidance: 'This summary is a conversation starter, not a verdict. You and your provider decide together.',
    faqs: [{ q: 'Why does this draft look unfinished?', a: 'It was produced in fallback mode without an AI key, to let the team test the workflow.', citationIds: [] }],
    glossary: [],
    conversationGuide: {
      steps: [
        { title: 'Team talk', script: 'There is a decision to make and more than one good option. Can we work through it together?', tips: [] },
        { title: 'Option talk', script: 'Walk through each option side by side using the tool.', tips: [] },
        { title: 'Decision talk', script: 'What matters most to you of what we discussed?', tips: [] },
      ],
    },
    citations,
  };
}

async function generateTool({ decision, materialsText, evidence, interview, options = [], feedback = '', currentContent = null }) {
  if (isMock()) return mockGenerateTool({ decision, evidence, options });
  const revisionBlock = (feedback && currentContent)
    ? `\n\n== REVISION REQUEST ==\nA draft already exists (below). Revise it according to the team's feedback. Keep everything the feedback does not ask you to change, stay IPDAS-compliant, and keep every claim cited.\n\nFEEDBACK FROM THE TEAM:\n${feedback}\n\nCURRENT DRAFT (JSON):\n${JSON.stringify(currentContent)}`
    : '';
  const optionsBlock = options.length
    ? `\n\n== THE TEAM HAS DEFINED THESE OPTIONS (valid choices). Build the tool around EXACTLY these, in this order, using these names. Do not add or remove options. ==\n${options.map((o, i) => `${i + 1}. ${o.name}${o.description ? ` - ${o.description}` : ''}`).join('\n')}`
    : '';
  const evidenceBlock = evidence.length
    ? evidence.map((e) => `[E${e.id}] ${e.title} (${e.journal || 'journal'}, ${e.year || 'n.d.'}) ${e.url}\nTags: ${e.tags || ''}\nSummary: ${e.summary || ''}\nAbstract: ${(e.abstract || '').slice(0, 1200)}`).join('\n\n')
    : '(none provided)';
  const interviewBlock = interview
    ? INTERVIEW_QUESTIONS.map((q) => `${q.label}\nAnswer: ${interview[q.id] || '(not answered)'}`).join('\n\n')
    : '(not completed)';

  const prompt = `Build a complete IPDAS-structured shared decision-making tool.

DECISION: ${decision}${optionsBlock}${revisionBlock}

== EXISTING MATERIALS PROVIDED BY THE TEAM (treat as trusted source content; cite as "material") ==
${materialsText || '(none provided)'}

== REVIEWED EVIDENCE (cite with the bracketed ids, source "pubmed", using the given URL) ==
${evidenceBlock}

== POPULATION INTERVIEW (tailor language, examples, values questions, and FAQ to this) ==
${interviewBlock}

REQUIREMENTS:
- 6th-8th grade reading level for all patient-facing text. Short sentences. No jargon without a glossary entry.
- Present every reasonable option, including "not starting / waiting" where clinically appropriate, in a balanced way with no implicit recommendation (IPDAS).
- Quantify benefits and risks with absolute numbers where evidence allows (e.g. "99 out of 100").
- Every effectiveness, benefit, risk, and FAQ claim must include citationIds pointing into the citations array. Citation ids: use "E<id>" for evidence items provided above and "M1" for the team's own materials. Do not invent sources; if a claim comes only from general clinical knowledge in the provided materials, cite M1.
- valuesQuestions: 5-8 values-clarification questions. Each answer lists which option ids it "favors" (may be empty). Make them about life and preferences, not medical knowledge quizzes.
- comparison: 6-10 features patients care about (how taken, visit frequency, privacy, cost, side effects, how fast protective/effective, stopping).
- conversationGuide: a provider-facing script following the three-talk model (team talk, option talk, decision talk) adapted to this decision.
- summaryGuidance: text shown to the patient with their values summary, reminding them the result is a conversation starter, not a verdict.`;

  // TOOL_SCHEMA is too large for the API's strict grammar compiler; use
  // prompt-guided JSON (parsed and retried) instead.
  return askJson({ system: SYSTEM, prompt, schema: TOOL_SCHEMA, maxTokens: 60000, strict: false });
}

async function generateTraining({ decision, tool, interview }) {
  if (isMock()) {
    const P = '[FALLBACK - placeholder until generated with an API key]';
    return {
      overview: P, whenToUse: P, introducingTheTool: P,
      talkingPoints: [P],
      commonQuestions: [{ q: 'Which option is best?', a: P }],
      pitfalls: [P],
      equityNotes: P,
      timeNeeded: P,
    };
  }
  return askJson({
    system: SYSTEM,
    prompt: `Write a decision-specific training companion for clinicians who will use this shared decision-making tool during visits. The general SDM skills module (three-talk model) is taught separately; this companion is about THIS decision and THIS population.\n\nDecision: ${decision}\n\nTool option names: ${tool.options.map((o) => o.name).join('; ')}\n\nPopulation interview answers:\n${JSON.stringify(interview || {}, null, 2)}\n\nInclude: when in the visit to use the tool, how to introduce it in one or two sentences, decision-specific talking points, the questions patients in this population are most likely to ask with strong answers, pitfalls (including subtle steering and implicit bias risks specific to this decision), equity notes, and realistic time needed.`,
    schema: TRAINING_SCHEMA,
    maxTokens: 16000,
    strict: false,
  });
}

async function triageSurveillance({ decision, items }) {
  if (isMock()) {
    return {
      items: items.map((it) => ({
        id: it.id,
        flag: true,
        relevance: 'medium',
        whyFlagged: 'Fallback triage (no API key): surfaced for manual review.',
      })),
    };
  }
  const results = [];
  for (const batch of chunk(items, 12)) {
    const list = batch.map((it) => `ID ${it.id} [${it.source}] ${it.title}\n${(it.snippet || '').slice(0, 1200)}`).join('\n\n---\n\n');
    const { items: triaged } = await askJson({
      system: SYSTEM,
      prompt: `You monitor new literature and patient community discussion for a live shared decision-making tool about: "${decision}".\n\nFor each item below, decide whether the clinical team should see it (flag=true), rate relevance, and explain in one sentence why (e.g. new evidence that may change content, emerging side-effect discussion, access barrier, common misinformation worth addressing in the tool). Do not flag routine personal anecdotes with no actionable signal.\n\n${list}`,
      schema: TRIAGE_SCHEMA,
      maxTokens: 16000,
    });
    results.push(...triaged);
  }
  return { items: results };
}

module.exports = {
  isMock,
  INTERVIEW_QUESTIONS,
  buildPubmedQueries,
  tagEvidence,
  pickSubreddits,
  generateTool,
  generateTraining,
  triageSurveillance,
};
