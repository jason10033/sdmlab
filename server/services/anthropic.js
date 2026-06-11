const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY is not set. Add it to the server environment to enable AI features.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  if (!client) client = new Anthropic.Anthropic();
  return client;
}

function firstText(message) {
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

function stripFences(text) {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (m ? m[1] : t).trim();
}

// Structured JSON call. Schema must use additionalProperties: false on every
// object. Retries once on truncation or invalid JSON before giving up.
//
// strict=true uses the API's grammar-constrained structured output (best for
// small/medium schemas). strict=false embeds the schema in the prompt and parses
// the JSON ourselves; use this for large schemas that exceed the grammar-size
// limit ("compiled grammar is too large").
async function askJson({ system, prompt, schema, maxTokens = 16000, documents = [], strict = true }) {
  const anthropic = getClient();
  const userText = strict
    ? prompt
    : `${prompt}\n\nReturn ONLY a single valid JSON object (no markdown, no code fences, no commentary) that conforms exactly to this JSON Schema:\n${JSON.stringify(schema)}`;
  const content = [...documents, { type: 'text', text: userText }];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const params = {
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content }],
    };
    if (strict) params.output_config = { format: { type: 'json_schema', schema } };
    const stream = anthropic.messages.stream(params);
    const message = await stream.finalMessage();
    if (message.stop_reason === 'max_tokens') {
      lastError = new Error('Model output was truncated; try again or simplify the input.');
      continue;
    }
    try {
      return JSON.parse(stripFences(firstText(message)));
    } catch (err) {
      lastError = new Error(`Model returned invalid JSON: ${err.message}`);
    }
  }
  throw lastError;
}

// Free-text call (used for extraction from PDFs and URLs).
async function askText({ system, prompt, maxTokens = 16000, documents = [] }) {
  const anthropic = getClient();
  const content = [
    ...documents,
    { type: 'text', text: prompt },
  ];
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content }],
  });
  const message = await stream.finalMessage();
  return firstText(message);
}

function pdfDocument(base64Data, title) {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
    title: title || 'Uploaded material',
  };
}

module.exports = { askJson, askText, pdfDocument, MODEL };
