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
  if (fenced || /^[{\[]/.test(json)) {
    let value;
    try { value = JSON.parse(json); } catch { throw new Error('Agent response JSON is malformed'); }
    const checked = validate(value);
    if (!checked.success) throw checked.error;
    return checked;
  }
  // Some compatible providers wrap an otherwise exact structured value in a
  // short explanatory prefix or suffix. Recover only a complete balanced JSON
  // value that independently passes the caller's closed response schema.
  const candidates=[];
  for(let start=0;start<trimmed.length;start++) {
    if(trimmed[start]!=='{'&&trimmed[start]!=='[')continue;
    const stack=[],opening=trimmed[start];let quoted=false,escaped=false;
    for(let i=start;i<trimmed.length;i++) {
      const char=trimmed[i];
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}
      if(char==='{'||char==='[')stack.push(char);
      else if(char==='}'||char===']'){
        const expected=char==='}'?'{':'[';
        if(stack.pop()!==expected)break;
        if(!stack.length){candidates.push(trimmed.slice(start,i+1));start=i;break;}
      }
    }
  }
  const valid=[];
  for(const candidate of [...new Set(candidates)])try{const checked=validate(JSON.parse(candidate));if(checked.success)valid.push(checked);}catch{}
  if(valid.length===1)return valid[0];
  if(valid.length>1)throw new Error('Agent response contains multiple schema-valid JSON values');
  return undefined;
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

function diagnoseInvalidResponse(text, validate) {
  if (typeof text !== 'string' || !text.trim()) return 'The provider returned no final JSON text.';
  const trimmed=text.trim(), first=trimmed.indexOf('{'), last=trimmed.lastIndexOf('}');
  if(first<0||last<=first)return 'The provider final response contains no complete JSON object (bytes='+Buffer.byteLength(text,'utf8')+').';
  let value;
  try { value=JSON.parse(trimmed.slice(first,last+1)); }
  catch { return 'The provider final response contains malformed JSON (bytes='+Buffer.byteLength(text,'utf8')+').'; }
  const checked=validate(value);
  if(!checked.success)return checked.error.message;
  return 'The provider final response contains valid JSON with unsupported surrounding content.';
}

function structuredOutputCandidates(error, steps = []) {
  const candidates=[];
  const add=(channel,value)=>{
    if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value,'utf8')>262144)return;
    candidates.push({channel,text:value});
  };
  add('error.text',error?.text);
  for(const step of [...steps].reverse()){
    add('step.text',step?.text);
    add('step.reasoningText',step?.reasoningText);
    for(const part of Array.isArray(step?.content)?step.content:[])if(part?.type==='text'||part?.type==='reasoning')add('step.content.'+part.type,part.text);
    for(const message of Array.isArray(step?.response?.messages)?step.response.messages:[]){
      if(message?.role!=='assistant')continue;
      if(typeof message.content==='string')add('response.messages.content',message.content);
      for(const part of Array.isArray(message.content)?message.content:[])if(part?.type==='text'||part?.type==='reasoning')add('response.messages.'+part.type,part.text);
    }
    const body=step?.response?.body;
    for(const choice of Array.isArray(body?.choices)?body.choices:[]){
      add('response.body.content',choice?.message?.content);
      add('response.body.reasoning',choice?.message?.reasoning);
      add('response.body.reasoning_content',choice?.message?.reasoning_content);
    }
  }
  const unique=new Map();
  for(const candidate of candidates)if(!unique.has(candidate.text))unique.set(candidate.text,candidate);
  return [...unique.values()];
}

function recoverStructuredParse(error, validate, isNoObjectError, steps = [], allowRepair = false) {
  if (!isNoObjectError || !validate || error.finishReason === 'length') throw error;
  const candidates=structuredOutputCandidates(error,steps);
  const valid=new Map();
  const failures=[];
  for(const candidate of candidates){
    try {
      const checked=parseValidatedResponse(candidate.text,validate);
      if(checked?.success)valid.set(JSON.stringify(checked.value),checked.value);
      else failures.push(candidate.channel+': '+diagnoseInvalidResponse(candidate.text,validate));
    } catch(problem) { failures.push(candidate.channel+': '+problem.message); }
  }
  if(valid.size===1) {
    const value=[...valid.values()][0];
    return {text:JSON.stringify(value),usage:error.usage,finishReason:error.finishReason,steps};
  }
  if(valid.size!==1) {
    if(!allowRepair)throw error;
    const observed=candidates.length?candidates.map(candidate=>candidate.channel+'='+Buffer.byteLength(candidate.text,'utf8')+'B').join(', '):'none';
    const reason=valid.size>1?'The provider returned multiple different schema-valid final objects.':failures[0]??'The provider returned no final JSON text.';
    return {text:typeof error.text==='string'?error.text:'',usage:error.usage,finishReason:error.finishReason,steps,nativeValidationError:reason+' Observed output channels: '+observed+'.'};
  }
}

module.exports = {compileResponseSchema, parseValidatedResponse, describeExecutionError, diagnoseInvalidResponse, structuredOutputCandidates, recoverStructuredParse};
