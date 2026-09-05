'use strict';
const Ajv = require('ajv');
function compileResponseSchema(schema) {
  // No coercion, defaults, removal, network refs, or silently ignored keywords.
  const ajv = new Ajv({strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false, validateFormats: true});
  const check = ajv.compile(schema);
  return value => {
    if (check(value)) return {success: true, value};
    const details = (check.errors || []).slice(0, 8).map(e => ({
      path: e.instancePath, keyword: e.keyword, message: e.message
    }));
    return {success: false, error: new Error('Agent response violates its JSON schema: ' + JSON.stringify(details))};
  };
}
function describeExecutionError(error) {
  const message = error instanceof Error ? error.message : 'Agent execution failed';
  const details = new Set();
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current);
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
module.exports = {compileResponseSchema, describeExecutionError};
