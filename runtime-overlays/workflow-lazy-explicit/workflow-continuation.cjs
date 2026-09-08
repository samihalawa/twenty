'use strict';
const {isDeepStrictEqual} = require('node:util');
const {verifySelectedCandidateReads}=require('./context-read-verification.cjs');
const {inspectOperatorExecution}=require('./operator-verification.cjs');
// Merge the actual SDK event representations once for verification and history replay.
function nativeToolEvents(step) {
  const calls=new Map(),results=new Map();
  for(const c of [...(step.toolCalls??[]),...(step.content??[]).filter(p=>p.type==='tool-call')])calls.set(c.toolCallId,{...calls.get(c.toolCallId),...c});
  for(const r of [...(step.toolResults??[]),...(step.content??[]).filter(p=>p.type==='tool-result'||p.type==='tool-error')]){
    const old=results.get(r.toolCallId);
    results.set(r.toolCallId,old?.type==='tool-error'?old:{...old,...r});
  }
  return {calls:[...calls.values()],results};
}
function nativeOutput(output) {
  let value=output,error,ok=true;const seen=new Set();
  for(let i=0;value&&typeof value==='object'&&!Array.isArray(value)&&i<8&&!seen.has(value);i++){
    seen.add(value);if(value.success===false)ok=false;if(value.error){error??=value.error;ok=false;}
    const next=value.result??value.data;if(next===undefined)break;value=next;
  }
  return {value,error,ok};
}
function recordOf(output) {
  const value=nativeOutput(output).value;
  return Array.isArray(value?.records)&&value.records.length===1?value.records[0]:value;
}
// Administrator-configured, read-only evidence contracts. These make a
// missing exact source read a same-agent continuation instead of allowing a
// downstream transaction to fail after the model has already stopped.
function requiredNativeReadIssues(calls,finalObject,requirements) {
  if(!finalObject||!Array.isArray(requirements)||!requirements.length)return [];
  const issues=[];
  for(const requirement of requirements){
    if(!requirement||typeof requirement!=='object'||typeof requirement.toolName!=='string')continue;
    let expected=requirement.argumentValue;
    if(typeof requirement.argumentFromResponseField==='string')expected=finalObject[requirement.argumentFromResponseField];
    if(requirement.requireResponseField===true&&(typeof expected!=='string'||!expected.trim())){
      issues.push('Required source binding '+requirement.argumentFromResponseField+' is empty. Preserve the exact current record ID supplied by the workflow; do not substitute another artifact or historical source.');
      continue;
    }
    const matching=calls.filter(call=>call.ok&&call.name===requirement.toolName&&(requirement.argumentName===undefined||call.args?.[requirement.argumentName]===expected));
    const accepted=matching.some(call=>{
      const record=recordOf(call.output);
      if(requirement.outputIdMatchesArgument===true&&record?.id!==expected)return false;
      if(typeof requirement.outputId==='string'&&record?.id!==requirement.outputId)return false;
      if(Array.isArray(requirement.nonemptyOutputFields)&&requirement.nonemptyOutputFields.some(field=>typeof record?.[field]!=='string'||!record[field].trim()))return false;
      return true;
    });
    if(!accepted)issues.push(String(requirement.instruction||('Before returning the final result, make the required successful native '+requirement.toolName+' read'+(expected?' for exact ID '+expected:'')+' and use its actual returned record.')));
  }
  return issues;
}
function recordCasePages(step, casePages) {
  let foundIncomplete = false;
  const events=nativeToolEvents(step);
  for(const call of events.calls) {
    const receipt=events.results.get(call.toolCallId),raw=call.input??call.args;
    const name=call.toolName==='execute_tool'?raw?.toolName:call.toolName;
    const output=nativeOutput(receipt?.output??receipt?.result);
    if(name==='app_crm_case_context' && receipt?.type!=='tool-error' && output.ok && output.value?.mode==='READ_CASE') {
      const page=output.value;
      const coverage=trackCoverage(casePages.get(page.opportunityId),page);
      casePages.set(page.opportunityId,coverage);
      if(!coverage.complete) foundIncomplete = true;
    }
  }
  return foundIncomplete;
}
// Mechanical tool-result contracts only. The same native model retains all judgment.
function inspectContinuation(steps, text, requirements={}) {
  const calls = [];
  for (const step of steps) {
    const events=nativeToolEvents(step);
    for (const c of events.calls) {
      const r=events.results.get(c.toolCallId),raw=c.input??c.args;
      const name=c.toolName==='execute_tool'?raw?.toolName:c.toolName,args=c.toolName==='execute_tool'?raw?.arguments:raw;
      const output=nativeOutput(r?.output??r?.result),error=r?.error??(r?.type==='tool-error'?r.output:undefined)??output.error;
      calls.push({nativeName:c.toolName,error,name,args,output:output.value,ok:!!r&&r.type!=='tool-error'&&!error&&output.ok});
    }
  }
  const issues = [], pages = new Map();
  let finalObject;try{finalObject=JSON.parse(text);}catch{}
  if(requirements.requireOperatorStatus && !/STATUS\s*[:*\s]+[A-Z_]+\b/.test(String(text).replace(/\*\*/g,'')) && typeof finalObject?.status!=='string') issues.push('Final report is missing the required explicit status. Continue the same task and return a complete status-bound result after the pending native operations.');
  const lastFailed=calls.findLast(c=>!c.ok);
  if(lastFailed && !calls.slice(calls.indexOf(lastFailed)+1).some(c=>c.ok && c.name===lastFailed.name) && !/STATUS\s*:\s*(?:TOOLING_BLOCKED|NEEDS_EVIDENCE)/.test(String(text))) issues.push('A native tool call failed or its arguments could not be parsed: '+String(lastFailed.name??lastFailed.nativeName)+'. Exact error: '+String(lastFailed.error??'missing successful tool result').slice(0,1600)+'. Use the learned schema, retry only an operation proven not executed, or report the exact tooling/evidence block.');
  issues.push(...requiredNativeReadIssues(calls,finalObject,requirements.requiredNativeReads));
  for (const call of calls) if(call.ok && call.name==='app_crm_case_context' && call.output?.mode==='READ_CASE')pages.set(call.output.opportunityId,trackCoverage(pages.get(call.output.opportunityId),call.output));
  for(const [id,state] of pages)if(!state.complete)issues.push('Unread source pages for '+id+'. Continue exact native cursor without copying the machine fingerprint: '+JSON.stringify({toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:id,cursor:state.next}}));
  if(finalObject&&Object.hasOwn(finalObject,'sourceFingerprint'))for(const state of pages.values())if(state.complete)try{verifySelectedCandidateReads([...state.sections.values()],calls.map(c=>({...c,output:{result:c.output}})),finalObject.candidateDecisions);}catch(error){issues.push(error.message+': choose relevance for every indexed candidate and read every full selected thread before completing the structured response.');}
  const writes = calls.map((c, index) => ({...c,index})).filter(c => /^(update|create|upsert)_one_/.test(c.name));
  for (const write of writes.filter(c=>c.ok)) {
    const id = write.args?.id ?? write.output?.id ?? write.output?.records?.[0]?.id;
    const object = write.name.replace(/^(update|create|upsert)_one_/,'');
    if (!id || !calls.slice(write.index + 1).some(c=>c.ok && c.name === 'find_one_' + object && c.args?.id === id)) issues.push('Successful ' + write.name + ' has no independent native read-back. Read exact ' + object + ' ID ' + (id ?? 'returned by the successful mutation') + ' before reporting completion. Do not repeat the mutation.');
  }
  const completed = /STATUS\s*[:*\s]+COMPLETED\b/.test(String(text).replace(/\*\*/g,''));
  if (completed && pages.size && !writes.some(c=>c.ok)) issues.push('COMPLETED has no successful permitted business mutation or independent read-back. Complete the intended reconciliation, or use an honest NO_WORK/NEEDS_EVIDENCE result with actual coverage; do not invent a completed write.');
  const failedWrites = writes.filter(c=>!c.ok);
  if (completed && failedWrites.length && !writes.some(c=>c.ok)) issues.push('Every attempted business mutation failed; COMPLETED is false. Learn the exact failed tool schema and repair the intended permitted operation, then read it back, or report TOOLING_BLOCKED. Native update_one_opportunity uses id plus direct fields, never opportunityId/set.');
  const report=String(text).replace(/\*\*/g,'');
  if(/STATUS\s*:\s*NEEDS_EVIDENCE\b/.test(report) && /MISSING_EVIDENCE\s*:\s*(?:none|nothing|no missing evidence)\b/i.test(report)) issues.push('NEEDS_EVIDENCE contradicts MISSING_EVIDENCE:none. An unread or unavailable source must be identified for that status. If coverage is complete, finish the supported reconciliation and read it back; waiting for another person is a business state to record, not an evidence gap.');
  if(/STATUS\s*[:*\s]+(?:COMPLETED|NO_WORK|NEEDS_EVIDENCE|ENTITY_CONFLICT|TOOLING_BLOCKED|ATTEMPTED_UNVERIFIED)\b/.test(String(text).replace(/\*\*/g,''))){
    const run={state:{stepInfos:{native:{result:{response:text}}}},stepLogs:{native:{details:{toolCalls:calls.map(c=>({toolName:'execute_tool',input:{toolName:c.name,arguments:c.args},state:c.ok?'success':'error',output:{success:c.ok,result:c.output}}))}}}};
    const verdict=inspectOperatorExecution(run,'native');
    issues.push(...verdict.problems.map(problem=>'Independent native execution verification: '+problem));
  }
  return { issues:[...new Set(issues)], calls: calls.length };
}
function downgradeIncompleteNoWork(text, checked) {
  const value=String(text??'');
  if(!/STATUS\s*:\s*NO_WORK\b/.test(value.replace(/\*\*/g,'')) || !checked.issues.length || checked.calls<1)return null;
  const allowed=[
    /^Independent native execution verification: NO_WORK discovery pagination is incomplete$/,
    /^Independent native execution verification: NO_WORK requires full native content and an explicit ignored disposition for every discovered candidate$/,
    /^Independent native execution verification: Discovered message content not read: /,
    /^Independent native execution verification: Discovered calendar event details not read: /,
    /^Independent native execution verification: Discovered calendar event participants not read: /,
    /^Independent native execution verification: Meeting discovery did not perform a bounded call-recording search$/,
    /^Independent native execution verification: Discovered call recording content not read: /
  ];
  if(checked.issues.some(issue=>!allowed.some(pattern=>pattern.test(issue))))return null;
  return value.replace(/(STATUS\s*:\s*)NO_WORK\b/,'$1ATTEMPTED_UNVERIFIED')+'\nNATIVE_EXECUTION_PENDING: '+checked.issues.join('; ')+'\nPreviously read native source pages remain available to the next scheduled continuation.';
}
function trackCoverage(prior,p) {
  const state=prior?.fingerprint===p.fingerprint?prior:{fingerprint:p.fingerprint,ranges:[],terminalEnd:null,sections:new Map()};
  for(let i=0;i<(p.sections??[]).length;i++)state.sections.set(p.cursor+i,p.sections[i]);
  const end=p.nextCursor??p.totalSections??(p.cursor+(p.sections?.length??1));
  state.ranges.push([p.cursor,end]);if(p.hasNextPage===false)state.terminalEnd=end;
  let next=0;for(const [start,end] of state.ranges.slice().sort((a,b)=>a[0]-b[0])){if(start>next)break;if(end>next)next=end;}
  state.next=next;state.complete=state.terminalEnd!==null&&next===state.terminalEnd;
  state.nextRead={toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:p.opportunityId,cursor:next}};
  return state;
}
function addUsage(a = {}, b = {}) {
  const out = {...a};
  for (const [key,value] of Object.entries(b)) {
    if (typeof value === 'number') out[key] = (typeof a[key] === 'number' ? a[key] : 0) + value;
    else if (value && typeof value === 'object') out[key] = addUsage(a[key],value);
  }
  return out;
}
function schemaSkeleton(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 8) return null;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : Object.keys(schema.properties ?? {}));
    return Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key])=>required.has(key)).map(([key,value])=>[key,schemaSkeleton(value,depth+1)]));
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'string') return '';
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return null;
}
function nativeResponseMessages(steps, text) {
  const messages=[];
  for(const step of steps){
    const events=nativeToolEvents(step);
    const assistant=[...(step.content??[]).filter(p=>['text','reasoning'].includes(p.type)&&typeof p.text==='string'),...events.calls.map(p=>({type:'tool-call',toolCallId:p.toolCallId,toolName:p.toolName,input:p.input??p.args}))];
    if(assistant.length)messages.push({role:'assistant',content:assistant});
    const results=[...events.results.values()].map(p=>({type:'tool-result',toolCallId:p.toolCallId,toolName:p.toolName??events.calls.find(c=>c.toolCallId===p.toolCallId)?.toolName,output:p.type==='tool-error'?{type:'error-text',value:String(p.error??p.output)}:{type:'json',value:p.output??p.result}}));
    if(results.length)messages.push({role:'tool',content:results});
  }
  if(typeof text==='string'&&text.trim())messages.push({role:'assistant',content:text});
  return messages;
}
function closeTruncatedJson(value) {
  if(typeof value!=='string'||value.length>65536)return null;
  const source=value.trim();if(!source.startsWith('{'))return null;
  const parseObject=candidate=>{try{const parsed=JSON.parse(candidate);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}};
  const withoutExtraContainerQuotes=source.replace(/([}\]])"(?=\s*[,}])/g,'$1');
  if(withoutExtraContainerQuotes!==source){const repaired=parseObject(withoutExtraContainerQuotes);if(repaired)return repaired;}
  const stack=[];let inString=false,escaped=false;
  for(const char of source){
    if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue;}
    if(char==='"'){inString=true;continue;}
    if(char==='{'||char==='[')stack.push(char);
    else if(char==='}'||char===']'){const open=stack.pop();if((char==='}'&&open!=='{')||(char===']'&&open!=='['))return null;}
  }
  if(inString||escaped||!stack.length)return null;
  const closed=source+stack.reverse().map(open=>open==='{'?'}':']').join('');
  return parseObject(closed);
}
function normalizeReadOnlyFindArguments(toolName,args) {
  if(typeof toolName!=='string'||!toolName.startsWith('find_many_')||!args||typeof args!=='object'||Array.isArray(args))return args;
  let changed=false;const normalized={...args};
  for(const key of ['and','or'])if(Array.isArray(args[key]))normalized[key]=args[key].map(value=>{
    if(typeof value!=='string'||value.length>8192)return value;
    try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){changed=true;return parsed;}}catch{}
    return value;
  });
  for(const [key,value] of Object.entries(args))if(key.endsWith('Id')&&typeof value==='string'){normalized[key]={eq:value};changed=true;}
  return changed?normalized:args;
}
function repairLearnToolsJson(value) {
  if(typeof value!=='string'||value.length>8192)return null;
  const repaired=value.replace(/([{,]\s*"aspects"\s*:\s*\[)\s*\{\s*"(schema|description)"\s*\}\s*(\])/,'$1"$2"$3');
  if(repaired===value)return null;
  try{const parsed=JSON.parse(repaired);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}
}
function promptText(messages) {
  return messages.map(message=>typeof message?.content==='string'?message.content:Array.isArray(message?.content)?message.content.filter(part=>part?.type==='text'&&typeof part.text==='string').map(part=>part.text).join('\n'):'').join('\n');
}
function requiredReadArgument(requirement,messages) {
  if(typeof requirement?.argumentValue==='string')return requirement.argumentValue;
  if(typeof requirement?.argumentFromPromptPattern!=='string')return undefined;
  try { return promptText(messages).match(new RegExp(requirement.argumentFromPromptPattern,'m'))?.[1]; } catch { return undefined; }
}
async function generateWithContinuation(generateText, options, policy = {}) {
  if (!policy.enabled) return generateText(options);
  const maxCalls = policy.maxToolCalls ?? 40, maxRepairs = policy.maxRepairs ?? 3;
  const structuredValidation = policy.responseSchema ? require('./schema-validation.cjs') : null;
  const validateStructured = structuredValidation?.compileResponseSchema(policy.responseSchema) ?? null;
  let used = 0, stalledRounds = 0, usage = {}, messages = [...(options.messages ?? [])], finalizeWithoutTools = false;
  policy={...policy,requiredNativeReads:(policy.requiredNativeReads??[]).map(requirement=>{
    const resolved=requiredReadArgument(requirement,messages);
    return typeof resolved==='string'&&resolved.trim()?{...requirement,argumentValue:resolved}:requirement;
  })};
  const steps = [];
  const casePages = new Map();
  const protectedEvidence = new Map();
  const opportunityReadRevisions = new Map();
  const nativeCalls=[];
  const learnedToolNames=new Set();
  const tools = Object.fromEntries(Object.entries(options.tools ?? {}).map(([name,tool]) => [name, !tool.execute ? tool : {...tool,execute:async (...args)=>{
    if (used >= maxCalls) throw new Error('NATIVE_TOOL_BUDGET_EXHAUSTED: preserve unfinished work for continuation');
    used++;
    const input=args[0], actualName=name==='execute_tool'?input?.toolName:name;
    let actualArgs=name==='execute_tool'?input?.arguments:input;
    const normalizedFindArgs=normalizeReadOnlyFindArguments(actualName,actualArgs);
    if(normalizedFindArgs!==actualArgs){actualArgs=normalizedFindArgs;if(name==='execute_tool')input.arguments=actualArgs;}
    if(actualName==='update_one_opportunity' && actualArgs && typeof actualArgs==='object' && !Array.isArray(actualArgs)) {
      const normalizedArgs={...actualArgs};
      if(normalizedArgs.expectedUpdatedAt===undefined && typeof normalizedArgs.updatedAt==='string') { normalizedArgs.expectedUpdatedAt=normalizedArgs.updatedAt; delete normalizedArgs.updatedAt; }
      if(normalizedArgs.stateEvidence && typeof normalizedArgs.stateEvidence==='object' && typeof normalizedArgs.stateEvidence.markdown!=='string') { normalizedArgs.evidenceJSON={...normalizedArgs.stateEvidence,...(normalizedArgs.evidenceJSON??{})}; delete normalizedArgs.stateEvidence; }
      if(Array.isArray(normalizedArgs.candidateDecisions) && !Array.isArray(normalizedArgs.evidenceJSON?.candidateDecisions)) { normalizedArgs.evidenceJSON={...(normalizedArgs.evidenceJSON??{}),candidateDecisions:normalizedArgs.candidateDecisions}; delete normalizedArgs.candidateDecisions; }
      for(const key of ['sourceCoverage','nextAction']) if(normalizedArgs[key]!==undefined) { if(normalizedArgs.evidenceJSON?.[key]===undefined) normalizedArgs.evidenceJSON={...(normalizedArgs.evidenceJSON??{}),[key]:normalizedArgs[key]}; delete normalizedArgs[key]; }
      if(normalizedArgs.lastReconciledAt!==undefined && normalizedArgs.evidenceJSON?.lastReconciledAt===undefined) normalizedArgs.evidenceJSON={...(normalizedArgs.evidenceJSON??{}),lastReconciledAt:normalizedArgs.lastReconciledAt};
      if(normalizedArgs.lastReconciledAt===undefined && typeof normalizedArgs.evidenceJSON?.lastReconciledAt==='string') normalizedArgs.lastReconciledAt=normalizedArgs.evidenceJSON.lastReconciledAt;
      const exactReadRevision=opportunityReadRevisions.get(normalizedArgs.id);
      if(typeof exactReadRevision==='string') normalizedArgs.expectedUpdatedAt=exactReadRevision;
      actualArgs=normalizedArgs;
      if(name==='execute_tool') input.arguments=actualArgs;
    }
    if(actualName==='app_crm_case_context' && Number(actualArgs?.cursor??0)>0) {
      const bound=casePages.get(actualArgs.opportunityId);
      if(!bound)throw Error('CASE_SNAPSHOT_NOT_BOUND: first read cursor0 for this exact case in this native execution.');
      if(actualArgs.fingerprint!==undefined && actualArgs.fingerprint!==bound.fingerprint)throw Error('CASE_SNAPSHOT_BINDING_MISMATCH: the copied fingerprint is invalid; omit fingerprint and use the exact next cursor from the last native result. Existing successfully read pages remain available.');
      actualArgs.fingerprint=bound.fingerprint;
    }
    if(actualName==='update_one_opportunity') {
      const context=casePages.get(actualArgs?.id);
      if(!context?.complete) throw new Error('CASE_CONTEXT_INCOMPLETE: mutation was not executed. Read every READ_CASE page for this exact opportunity before deciding or updating. '+JSON.stringify(context?.nextRead??{toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:actualArgs?.id}}));
      let decisions=actualArgs.evidenceJSON?.candidateDecisions;
      if(!decisions&&typeof actualArgs.stateEvidence?.markdown==='string')try{decisions=JSON.parse(actualArgs.stateEvidence.markdown).candidateDecisions;}catch{}
      verifySelectedCandidateReads([...context.sections.values()],nativeCalls,decisions);
      if(actualArgs?.evidenceJSON!==undefined || actualArgs?.stateEvidence?.markdown!==undefined) {
        let evidence;
        try { evidence=actualArgs.evidenceJSON??JSON.parse(actualArgs.stateEvidence.markdown); } catch { throw new Error('INVALID_STATE_EVIDENCE_JSON: mutation was not executed. stateEvidence.markdown must contain valid JSON, without escaped outer quotes. Use the learned native input schema and JSON.stringify semantics.'); }
        if(!evidence || typeof evidence!=='object' || Array.isArray(evidence)) throw new Error('INVALID_STATE_EVIDENCE_JSON: evidence must be a JSON object. Mutation was not executed.');
        if(evidence.sourceCoverage?.complete!==true || typeof evidence.sourceCoverage?.checkedAt!=='string' || !Number.isFinite(Date.parse(evidence.sourceCoverage.checkedAt)) || !Array.isArray(evidence.sourceCoverage.sourceIds)) throw new Error('FRESH_SOURCE_COVERAGE_REQUIRED: mutation was not executed. evidenceJSON must include sourceCoverage {complete:true, checkedAt:<current ISO timestamp>, sourceIds:[exact native IDs]}; the runtime binds the exact READ_CASE fingerprint.');
        if(!evidence.nextAction || typeof evidence.nextAction!=='object' || Array.isArray(evidence.nextAction)) throw new Error('CURRENT_NEXT_ACTION_REQUIRED: mutation was not executed. evidenceJSON.nextAction must preserve the distinct current owner, kind, dueAt and exact source IDs.');
        if(typeof evidence.lastReconciledAt!=='string' || !Number.isFinite(Date.parse(evidence.lastReconciledAt))) throw new Error('FRESH_RECONCILIATION_TIME_REQUIRED: mutation was not executed. evidenceJSON.lastReconciledAt must be the current verified ISO timestamp.');
        if(actualArgs.evidenceJSON && evidence.sourceCoverage?.complete===true) evidence.sourceCoverage={...evidence.sourceCoverage,checkedAt:new Date().toISOString(),fingerprint:context.fingerprint};
        if(evidence.sourceCoverage?.complete===true && evidence.sourceCoverage.fingerprint!==context.fingerprint) throw new Error('STATE_EVIDENCE_FINGERPRINT_MISMATCH: mutation was not executed. Bind sourceCoverage to the exact fully read READ_CASE fingerprint.');
        const prior=protectedEvidence.get(actualArgs.id);
        for(const key of ['manualPreparation','admission','autonomousPreparation']) if(prior?.[key]!==undefined && evidence[key]!==undefined && !isDeepStrictEqual(evidence[key],prior[key])) throw new Error('STATE_EVIDENCE_PRESERVATION_REQUIRED: mutation was not executed. Preserve the exact existing '+key+' object from the native opportunity read-back.');
      }
    }
    let output;try{output=await tool.execute(...args);}catch(error){nativeCalls.push({name:actualName,args:actualArgs,output:{success:false,error:String(error)},ok:false});throw error;}
    const normalized=nativeOutput(output),result=normalized.value;
    nativeCalls.push({name:actualName,args:actualArgs,output,ok:normalized.ok});
    if(actualName==='learn_tools' && normalized.ok) for(const learned of result?.tools??[]) if(typeof learned?.name==='string') learnedToolNames.add(learned.name);
    if(actualName==='find_one_opportunity' && normalized.ok) {
      const record=result?.records?.[0]??result;
      if(record?.id && typeof record.updatedAt==='string') opportunityReadRevisions.set(record.id,record.updatedAt);
      if(record?.id && typeof record.stateEvidence?.markdown==='string') try { const evidence=JSON.parse(record.stateEvidence.markdown); if(evidence && typeof evidence==='object' && !Array.isArray(evidence)) protectedEvidence.set(record.id,evidence); } catch { /* An invalid historical blob is not an invented structured admission. */ }
    }
    if(actualName==='app_crm_case_context' && result?.mode==='READ_CASE' && normalized.ok) {
      const coverage=trackCoverage(casePages.get(result.opportunityId),result);casePages.set(result.opportunityId,coverage);
      if(result.hasNextPage) result.nextRead=coverage.nextRead;
    }
    return output;
  }}]));
  // Preload only administrator-declared read-only evidence. The exact receipts
  // are persisted and replayed to the same model. No contextual choice or
  // business mutation is performed here.
  if(typeof tools.execute_tool?.execute==='function')for(const requirement of policy.requiredNativeReads??[]){
    if(requirement?.preload!==true||typeof requirement.toolName!=='string'||typeof requirement.argumentName!=='string')continue;
    const expected=requiredReadArgument(requirement,messages);
    if(typeof expected!=='string'||!expected.trim())continue;
    const input={toolName:requirement.toolName,arguments:{...(requirement.arguments??{}),[requirement.argumentName]:expected}};
    const toolCallId='native-required-read-'+Date.now()+'-'+used;
    const callPart={type:'tool-call',toolCallId,toolName:'execute_tool',input};let synthetic;
    try {
      const output=await tools.execute_tool.execute(input);
      const resultPart={type:'tool-result',toolCallId,toolName:'execute_tool',output};
      synthetic={toolCalls:[callPart],toolResults:[resultPart],content:[callPart,resultPart]};
    } catch(error) {
      const errorPart={type:'tool-error',toolCallId,toolName:'execute_tool',error:String(error)};
      synthetic={toolCalls:[callPart],toolResults:[errorPart],content:[callPart,errorPart]};
    }
    // Persist native values exactly, but replay the provider wire shape. Date
    // objects are valid in Twenty records and invalid in ModelMessage content.
    const wireSynthetic=JSON.parse(JSON.stringify(synthetic));
    steps.push(synthetic);messages.push(...nativeResponseMessages([wireSynthetic],''));await options.onStepFinish?.(synthetic);
    // An administrator-preloaded exact case is already bound before model
    // judgment. Drain only that immutable cursor transport now so the first
    // model response sees one complete snapshot, instead of answering from a
    // first page and then trying to rewrite a partial response.
    if(requirement.toolName==='app_crm_case_context')while(used<maxCalls){
      const state=casePages.get(expected);
      if(!state||state.complete||!state.nextRead)break;
      const continuationInput=state.nextRead;
      const continuationCallId='native-required-case-'+Date.now()+'-'+used;
      const continuationCall={type:'tool-call',toolCallId:continuationCallId,toolName:'execute_tool',input:continuationInput};let continuationStep;
      try {
        const continuationOutput=await tools.execute_tool.execute(continuationInput);
        const continuationResult={type:'tool-result',toolCallId:continuationCallId,toolName:'execute_tool',output:continuationOutput};
        continuationStep={toolCalls:[continuationCall],toolResults:[continuationResult],content:[continuationCall,continuationResult]};
      } catch(error) {
        const continuationError={type:'tool-error',toolCallId:continuationCallId,toolName:'execute_tool',error:String(error)};
        continuationStep={toolCalls:[continuationCall],toolResults:[continuationError],content:[continuationCall,continuationError]};
      }
      const wireContinuation=JSON.parse(JSON.stringify(continuationStep));
      steps.push(continuationStep);messages.push(...nativeResponseMessages([wireContinuation],''));await options.onStepFinish?.(continuationStep);
      if(continuationStep.toolResults[0].type==='tool-error')break;
    }
  }
  for (let repair = 0; ; repair++) {
    const stopConditions = Array.isArray(options.stopWhen) ? options.stopWhen : options.stopWhen ? [options.stopWhen] : [];
    const observedSteps=[], callsBeforeRound=used;
    let result = await generateText({...options, tools, toolChoice: finalizeWithoutTools ? 'none' : options.toolChoice, messages,
      onStepFinish:async step=>{
        observedSteps.push(step);
        await options.onStepFinish?.(step);
        if(recordCasePages(step,casePages)) {
          const error=new Error('INCOMPLETE_CASE_SNAPSHOT: deterministic cursor transport must finish before another model step');
          error.code='INCOMPLETE_CASE_SNAPSHOT';
          throw error;
        }
      },
      experimental_repairToolCall:async repairInput=>{
        if(repairInput.toolCall?.toolName==='execute_tool'){
          const repairedInput=closeTruncatedJson(repairInput.toolCall.input);
          if(repairedInput)return {...repairInput.toolCall,input:repairedInput};
        }
        if(repairInput.toolCall?.toolName==='learn_tools'){
          const repairedInput=repairLearnToolsJson(repairInput.toolCall.input);
          if(repairedInput)return {...repairInput.toolCall,input:repairedInput};
        }
        const match=repairInput.toolCall?.toolName?.match(/^(.+)<\|channel\|>(?:analysis|commentary|json)$/);
        if(match && Object.hasOwn(tools,match[1])) return {...repairInput.toolCall,toolName:match[1]};
        const directName=repairInput.toolCall?.toolName,directInput=repairInput.toolCall?.input;
        if(learnedToolNames.has(directName) && Object.hasOwn(tools,'execute_tool') && directInput && typeof directInput==='object' && !Array.isArray(directInput)) return {...repairInput.toolCall,toolName:'execute_tool',input:{toolName:directName,arguments:directInput}};
        return options.experimental_repairToolCall?.(repairInput)??null;
      },
      // The tool-phase stop predicate is stateful and AI SDK structured output
      // may need its own terminal generation step. Once tools are closed, use
      // the SDK's default single-result completion contract instead of carrying
      // the tool-oriented predicate into the schema-only request.
      stopWhen: finalizeWithoutTools ? undefined : async state => used >= maxCalls || (await Promise.all(stopConditions.map(stop=>stop(state)))).some(Boolean)
    }).catch(error=>{
      if(error?.code==='INCOMPLETE_CASE_SNAPSHOT') return {steps:observedSteps,text:'STATUS: ATTEMPTED_UNVERIFIED\nNATIVE_CONTINUATION_REQUIRED: complete the bound READ_CASE cursor before judgment or mutation.',finishReason:'stop',usage:observedSteps.reduce((sum,step)=>addUsage(sum,step.usage),{}),response:observedSteps.at(-1)?.response};
      if(!policy.recoverError)throw error;
      const recovered=policy.recoverError(error,observedSteps);
      return {...recovered,response:observedSteps.at(-1)?.response};
    });
    // AI SDK v6 exposes schema-validated results on `output`. Compatible
    // providers can leave `text` empty or non-canonical even when that value is
    // complete. Canonicalize only an independently schema-valid SDK output.
    if (validateStructured) {
      try {
        const checked = result.output === undefined ? null : validateStructured(result.output);
        if (checked?.success) result = {...result, text: JSON.stringify(checked.value), nativeValidationError: undefined};
      } catch {}
      // GPT-OSS compatible providers can place the only final payload in the
      // separate reasoning channel. Accept it only when one complete value
      // independently satisfies the same closed public response schema.
      if ((!result.text || !result.text.trim()) && typeof result.reasoningText === 'string') {
        try {
          const checked = structuredValidation.parseValidatedResponse(result.reasoningText, validateStructured);
          if (checked?.success) result = {...result, text: JSON.stringify(checked.value), nativeValidationError: undefined};
        } catch {}
      }
    }
    const roundSteps = result.steps ?? [];
    steps.push(...roundSteps);
    // Some AI SDK/provider paths surface an executed lazy tool only in the
    // returned step receipt. Reconstruct the same mechanical READ_CASE state
    // from that authoritative receipt so cursor draining never depends on the
    // provider having invoked our execute proxy in a particular shape.
    for(const step of (roundSteps.length ? roundSteps : observedSteps)) recordCasePages(step,casePages);
    const completeCases=[...casePages.values()].filter(c=>c.complete);
    if(completeCases.length===1 && typeof result.text==='string')try{const value=JSON.parse(result.text);if(value && typeof value==='object' && Object.hasOwn(value,'sourceFingerprint')){value.sourceFingerprint=completeCases[0].fingerprint;result={...result,text:JSON.stringify(value)};}}catch{}
    usage = addUsage(usage,result.totalUsage ?? result.usage);
    let checked = inspectContinuation(steps,result.text,policy);
    if(result.finishReason!=='length' && !result.nativeValidationError){
      const downgraded=downgradeIncompleteNoWork(result.text,checked);
      if(downgraded!==null){result={...result,text:downgraded};checked=inspectContinuation(steps,result.text,policy);}
    }
    stalledRounds = used > callsBeforeRound ? 0 : stalledRounds + 1;
    if(result.finishReason === 'length') checked.issues.push('The previous response reached the fixed output-token limit and is incomplete. Return one concise valid final response matching the original schema; retain the existing native reads and do not repeat completed tool calls.');
    if(result.nativeValidationError)checked.issues.push('Final response validation failed: '+result.nativeValidationError+'. Return valid JSON matching the original response schema; preserve the actual source facts and tool outcomes.');
    const responseOnlyRepair = !!result.nativeValidationError && checked.issues.every(issue =>
      issue.startsWith('Final report is missing the required explicit status.') ||
      issue.startsWith('Final response validation failed:')
    );
    // AI SDK structured output is a separate generation step after tool use.
    // Some OpenAI-compatible providers return an empty stop response when the
    // model attempts another tool transition during final schema generation.
    // Once all native contracts are satisfied, retain the definitions required
    // to interpret prior tool receipts but explicitly prohibit another call.
    // No judgment or source content is replaced, and any unresolved native
    // contract keeps ordinary tool choice enabled.
    if(responseOnlyRepair) finalizeWithoutTools = true;
    const originalMessages = JSON.parse(JSON.stringify(result.response?.messages?.length ? result.response.messages : nativeResponseMessages(roundSteps.length?roundSteps:observedSteps,result.text)));
    const cursorMessages=[];
    // Once the native agent explicitly opens an exact case, advancing its
    // immutable snapshot cursor is transport rather than contextual judgment.
    // Drain only that already-bound READ_CASE sequence, retain every native
    // receipt in the persisted step log and leave candidate selection, related
    // source reads, mutations and final prose to the same model.
    while(typeof tools.execute_tool?.execute==='function' && [...casePages.values()].some(state=>!state.complete) && used<maxCalls) {
      const state=[...casePages.values()].find(item=>!item.complete),input=state.nextRead;
      if(!input)break;
      const toolCallId='native-case-cursor-'+Date.now()+'-'+used;
      let output,synthetic;
      const callPart={type:'tool-call',toolCallId,toolName:'execute_tool',input};
      try {
        output=await tools.execute_tool.execute(input);
        const resultPart={type:'tool-result',toolCallId,toolName:'execute_tool',output};
        synthetic={toolCalls:[callPart],toolResults:[resultPart],content:[callPart,resultPart]};
      } catch(error) {
        const errorPart={type:'tool-error',toolCallId,toolName:'execute_tool',error:String(error)};
        synthetic={toolCalls:[callPart],toolResults:[errorPart],content:[callPart,errorPart]};
      }
      steps.push(synthetic);cursorMessages.push(...nativeResponseMessages([synthetic],''));
      await options.onStepFinish?.(synthetic);
      if(synthetic.toolResults[0].type==='tool-error')break;
    }
    if(cursorMessages.length){
      checked=inspectContinuation(steps,result.text,policy);
      if(result.finishReason === 'length') checked.issues.push('The previous response reached the fixed output-token limit and is incomplete. Return one concise valid final response matching the original schema; retain the existing native reads and do not repeat completed tool calls.');
      if(result.nativeValidationError)checked.issues.push('Final response validation failed: '+result.nativeValidationError+'. Return valid JSON matching the original response schema; preserve the actual source facts and tool outcomes.');
      if(checked.issues.some(issue =>
        !issue.startsWith('Final report is missing the required explicit status.') &&
        !issue.startsWith('Final response validation failed:')
      )) finalizeWithoutTools = false;
      checked.issues.push('Exact READ_CASE cursor transport completed after the prior model output. Re-evaluate the same task now using every persisted source page before returning the final judgment or public content.');
      stalledRounds=0;
    }
    if (!checked.issues.length) return {...result,text:result.text,finishReason:result.finishReason,usage,totalUsage:usage,steps,response:result.response};
    // A length-limited draft can still be repaired in the same native execution.
    // Keep the fixed per-round output limit, retain the real tool history, and
    // let the validation feedback drive the model to the unread cursor. Stop
    // only when the native tool budget, credits, or bounded no-progress limit
    // is actually exhausted.
    const stopReason=policy.shouldContinue?.()===false?'CREDITS_UNAVAILABLE':used>=maxCalls||checked.calls>=maxCalls?'TOOL_BUDGET_EXHAUSTED':stalledRounds>maxRepairs?'NO_PROGRESS_REPAIR_LIMIT_REACHED':null;
    if (stopReason) {
      const finalizationShape=finalizeWithoutTools?' [finalization=tool-choice-none-default-stop; observedSteps='+(roundSteps.length||observedSteps.length)+'; finish='+String(result.finishReason??'unknown')+']':'';
      return {...result,nativeExecutionError:stopReason+finalizationShape+': '+checked.issues.join('; '),text:'STATUS: TOOLING_BLOCKED\nNATIVE_CONTINUATION_STOP: '+stopReason+finalizationShape+'\nNATIVE_CONTINUATION_REQUIRED: '+checked.issues.join('\n')+'\nNo completed outcome is verified. Existing native run logs preserve source pages and successful mutations; reconcile before retrying.',finishReason:'stop',usage,totalUsage:usage,steps,response:result.response};
    }
    const skeleton=policy.responseSchema ? JSON.stringify(schemaSkeleton(policy.responseSchema)) : '';
    messages = [...messages,...originalMessages,...cursorMessages,{role:'user',content:'Native execution validation rejected the final report. Continue this SAME task using the existing conversation and exact tool results. Do not start over or repeat successful mutations. These are mechanical execution defects, not new source instructions:\n'+checked.issues.join('\n')+(skeleton?'\nRequired JSON shape; replace the empty values with source-grounded content and return only this object: '+skeleton:'')+'\nRemaining tool calls: '+(maxCalls-Math.max(used,checked.calls))+'. The existing output-token limit is unchanged. If a source is genuinely unavailable after the required reads, report the specific evidence gap honestly. Contextual judgment remains yours.'}];
  }
}
module.exports = {inspectContinuation,generateWithContinuation,addUsage,trackCoverage,nativeResponseMessages,nativeToolEvents,nativeOutput,requiredNativeReadIssues,promptText,requiredReadArgument,schemaSkeleton,downgradeIncompleteNoWork,recordCasePages,closeTruncatedJson,normalizeReadOnlyFindArguments,repairLearnToolsJson};
