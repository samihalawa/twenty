'use strict';
const Ajv = require('ajv');
function compileResponseSchema(schema) {
  // No coercion, defaults, removal, network refs, or silently ignored keywords.
  const ajv = new Ajv({strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false, validateFormats: true});
  const check = ajv.compile(schema);
  return value => {
    if (check(value)) return {success: true, value};
    const details = (check.errors || []).slice(0, 8).map(e => ({
      path: e.instancePath, keyword: e.keyword, message: e.message, ...(e.params?.missingProperty ? {property: e.params.missingProperty} : {})
    }));
    return {success: false, error: new Error('Agent response violates its JSON schema: ' + JSON.stringify(details))};
  };
}
function parseValidatedResponse(text, validate) {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  const fenced = /^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i.exec(trimmed);
  const json = fenced ? fenced[1].trim() : trimmed;
  // Preserve the existing formatter only for ordinary non-JSON prose.
  // Never let a second model silently repair or reinterpret malformed JSON.
  if (!fenced && !/^[{\[]/.test(json)) return undefined;
  let value;
  try { value = JSON.parse(json); } catch { throw new Error('Agent response JSON is malformed'); }
  const checked = validate(value);
  if (!checked.success) throw checked.error;
  return checked;
}
function describeExecutionError(error) {
  const message = error instanceof Error ? error.message : 'Agent execution failed';
  const details = new Set();
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current);
    if (typeof current.message === 'string' && current.message.startsWith('Agent response violates its JSON schema: ')) details.add(current.message.slice(0, 1600));
    if (Number.isInteger(current.statusCode)) details.add('HTTP ' + current.statusCode);
    let body;
    try { body = typeof current.responseBody === 'string' ? JSON.parse(current.responseBody) : current.responseBody; } catch {}
    const providerError = body?.error;
    for (const [label, value] of [['code', providerError?.code], ['type', providerError?.type], ['provider', providerError?.metadata?.provider_name]]) {
      if ((typeof value === 'string' || typeof value === 'number') && /^[a-zA-Z0-9_. -]{1,80}$/.test(String(value))) details.add(label + '=' + value);
    }
    current = current.lastError || current.cause;
  }
  return message + (details.size ? ' [' + [...details].join('; ') + ']' : '');
}

function recoverStructuredParse(error, validate, isNoObjectError, steps = []) {
  if (!isNoObjectError || !validate || error.finishReason === 'length' ||
      typeof error.text !== 'string' || Buffer.byteLength(error.text, 'utf8') > 262144) throw error;
  let checked;
  try { checked = parseValidatedResponse(error.text, validate); } catch { throw error; }
  if (!checked?.success) throw error;
  return {text: error.text, usage: error.usage, finishReason: error.finishReason, steps};
}

module.exports = {compileResponseSchema, parseValidatedResponse, describeExecutionError, recoverStructuredParse};
