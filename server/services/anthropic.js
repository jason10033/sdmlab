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

// Structured JSON call. Schema must use additionalProperties: false on every
// object. Retries once on truncation or invalid JSON before giving up.
async function askJson({ system, prompt, schema, maxTokens = 16000, documents = [] }) {
  const anthropic = getClient();
  const content = [
    ...documents,
    { type: 'text', text: prompt },
  ];
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'max_tokens') {
      lastError = new Error('Model output was truncated; try again or simplify the input.');
      continue;
    }
    try {
      return JSON.parse(firstText(message));
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
