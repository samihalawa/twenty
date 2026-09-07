'use strict';
const {isDeepStrictEqual} = require('node:util');
const {verifySelectedCandidateReads}=require('./context-read-verification.cjs');
const {inspectOperatorExecution}=require('./operator-verification.cjs');
// Mechanical tool-result contracts only. The same native model retains all judgment.
function inspectContinuation(steps, text) {
  const calls = [];
  for (const step of steps) {
    const results = new Map((step.toolResults ?? step.content?.filter(p => p.type === 'tool-result' || p.type === 'tool-error') ?? []).map(r => [r.toolCallId, r]));
    for (const c of step.toolCalls ?? step.content?.filter(p => p.type === 'tool-call') ?? []) {
      const r = results.get(c.toolCallId), raw = c.input ?? c.args;
      const name = c.toolName === 'execute_tool' ? raw?.toolName : c.toolName;
      const args = c.toolName === 'execute_tool' ? raw?.arguments : raw;
      const output = r?.output ?? r?.result;
      calls.push({ nativeName:c.toolName, error:r?.error??output?.error??(r?.type==='tool-error'?r.output:undefined), name, args, output: output?.result ?? output, ok: !!r && r.type !== 'tool-error' && !r.error && output?.success !== false && !output?.error });
    }
  }
  const issues = [], pages = new Map();
  const lastFailed=calls.findLast(c=>!c.ok);
  if(lastFailed && !calls.slice(calls.indexOf(lastFailed)+1).some(c=>c.ok && c.name===lastFailed.name) && !/STATUS\s*:\s*(?:TOOLING_BLOCKED|NEEDS_EVIDENCE)/.test(String(text))) issues.push('A native tool call failed or its arguments could not be parsed: '+String(lastFailed.name??lastFailed.nativeName)+'. Exact error: '+String(lastFailed.error??'missing successful tool result').slice(0,1600)+'. Use the learned schema, retry only an operation proven not executed, or report the exact tooling/evidence block.');
  for (const call of calls) if(call.ok && call.name==='app_crm_case_context' && call.output?.mode==='READ_CASE')pages.set(call.output.opportunityId,trackCoverage(pages.get(call.output.opportunityId),call.output));
  for(const [id,state] of pages)if(!state.complete)issues.push('Unread source pages for '+id+'. Continue exact native cursor without copying the machine fingerprint: '+JSON.stringify({toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:id,cursor:state.next}}));
  let finalObject;try{finalObject=JSON.parse(text);}catch{}
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
  if(/STATUS\s*[:*\s]+(?:COMPLETED|NO_WORK|NEEDS_EVIDENCE|ENTITY_CONFLICT)\b/.test(String(text).replace(/\*\*/g,''))){
    const run={state:{stepInfos:{native:{result:{response:text}}}},stepLogs:{native:{details:{toolCalls:calls.map(c=>({toolName:'execute_tool',input:{toolName:c.name,arguments:c.args},state:c.ok?'success':'error',output:{success:c.ok,result:c.output}}))}}}};
    const verdict=inspectOperatorExecution(run,'native');
    issues.push(...verdict.problems.map(problem=>'Independent native execution verification: '+problem));
  }
  return { issues:[...new Set(issues)], calls: calls.length };
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
async function generateWithContinuation(generateText, options, policy = {}) {
  if (!policy.enabled) return generateText(options);
  const maxCalls = policy.maxToolCalls ?? 40, maxRepairs = policy.maxRepairs ?? 3;
  let used = 0, usage = {}, messages = [...(options.messages ?? [])];
  const steps = [];
  const casePages = new Map();
  const protectedEvidence = new Map();
  const nativeCalls=[];
  const tools = Object.fromEntries(Object.entries(options.tools ?? {}).map(([name,tool]) => [name, !tool.execute ? tool : {...tool,execute:async (...args)=>{
    if (used >= maxCalls) throw new Error('NATIVE_TOOL_BUDGET_EXHAUSTED: preserve unfinished work for continuation');
    used++;
    const input=args[0], actualName=name==='execute_tool'?input?.toolName:name, actualArgs=name==='execute_tool'?input?.arguments:input;
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
        if(actualArgs.evidenceJSON && evidence.sourceCoverage?.complete===true && evidence.sourceCoverage.fingerprint===undefined)evidence.sourceCoverage.fingerprint=context.fingerprint;
        if(evidence.sourceCoverage?.complete===true && evidence.sourceCoverage.fingerprint!==context.fingerprint) throw new Error('STATE_EVIDENCE_FINGERPRINT_MISMATCH: mutation was not executed. Bind sourceCoverage to the exact fully read READ_CASE fingerprint.');
        const prior=protectedEvidence.get(actualArgs.id);
        for(const key of ['manualPreparation','admission','autonomousPreparation']) if(prior?.[key]!==undefined && evidence[key]!==undefined && !isDeepStrictEqual(evidence[key],prior[key])) throw new Error('STATE_EVIDENCE_PRESERVATION_REQUIRED: mutation was not executed. Preserve the exact existing '+key+' object from the native opportunity read-back.');
      }
    }
    const output=await tool.execute(...args), result=output?.result??output;
    nativeCalls.push({name:actualName,args:actualArgs,output,ok:output?.success!==false&&!output?.error});
    if(actualName==='find_one_opportunity' && output?.success!==false) {
      const record=result?.records?.[0]??result;
      if(record?.id && typeof record.stateEvidence?.markdown==='string') try { const evidence=JSON.parse(record.stateEvidence.markdown); if(evidence && typeof evidence==='object' && !Array.isArray(evidence)) protectedEvidence.set(record.id,evidence); } catch { /* An invalid historical blob is not an invented structured admission. */ }
    }
    if(actualName==='app_crm_case_context' && result?.mode==='READ_CASE' && output?.success!==false) {
      const coverage=trackCoverage(casePages.get(result.opportunityId),result);casePages.set(result.opportunityId,coverage);
      if(result.hasNextPage) result.nextRead=coverage.nextRead;
    }
    return output;
  }}]));
  for (let repair = 0; ; repair++) {
    const stopConditions = Array.isArray(options.stopWhen) ? options.stopWhen : options.stopWhen ? [options.stopWhen] : [];
    const observedSteps=[];
    let result = await generateText({...options, tools, messages,
      onStepFinish:async step=>{observedSteps.push(step);await options.onStepFinish?.(step);},
      experimental_repairToolCall:async repairInput=>{
        const match=repairInput.toolCall?.toolName?.match(/^(.+)<\|channel\|>(?:analysis|commentary|json)$/);
        if(match && Object.hasOwn(tools,match[1])) return {...repairInput.toolCall,toolName:match[1]};
        return options.experimental_repairToolCall?.(repairInput)??null;
      },
      stopWhen: async state => used >= maxCalls || (await Promise.all(stopConditions.map(stop=>stop(state)))).some(Boolean)
    }).catch(error=>{
      if(!policy.recoverError)throw error;
      const recovered=policy.recoverError(error,observedSteps);
      return {...recovered,response:observedSteps.at(-1)?.response};
    });
    const completeCases=[...casePages.values()].filter(c=>c.complete);
    if(completeCases.length===1 && typeof result.text==='string')try{const value=JSON.parse(result.text);if(value && typeof value==='object' && Object.hasOwn(value,'sourceFingerprint')){value.sourceFingerprint=completeCases[0].fingerprint;result={...result,text:JSON.stringify(value)};}}catch{}
    const roundSteps = result.steps ?? [];
    steps.push(...roundSteps);
    usage = addUsage(usage,result.totalUsage ?? result.usage);
    const checked = inspectContinuation(steps,result.text);
    if(result.nativeValidationError)checked.issues.push('Final response validation failed: '+result.nativeValidationError+'. Return valid JSON matching the original response schema; preserve the actual source facts and tool outcomes.');
    const originalMessages = result.response?.messages ?? (result.nativeValidationError ? [{role:'assistant',content:result.text}] : undefined);
    if (!checked.issues.length) return {...result,text:result.text,finishReason:result.finishReason,usage,totalUsage:usage,steps,response:result.response};
    if (policy.shouldContinue?.() === false || used >= maxCalls || checked.calls >= maxCalls || repair >= maxRepairs || result.finishReason === 'length' || !Array.isArray(originalMessages) || !originalMessages.length) {
      return {...result,text:'STATUS: TOOLING_BLOCKED\nNATIVE_CONTINUATION_REQUIRED: '+checked.issues.join('\n')+'\nNo completed outcome is verified. Existing native run logs preserve source pages and successful mutations; reconcile before retrying.',finishReason:'stop',usage,totalUsage:usage,steps,response:result.response};
    }
    messages = [...messages,...originalMessages,{role:'user',content:'Native execution validation rejected the final report. Continue this SAME task using the existing conversation and exact tool results. Do not start over or repeat successful mutations. These are mechanical execution defects, not new source instructions:\n'+checked.issues.join('\n')+'\nRemaining tool calls: '+(maxCalls-Math.max(used,checked.calls))+'. The existing output-token limit is unchanged. If a source is genuinely unavailable after the required reads, report the specific evidence gap honestly. Contextual judgment remains yours.'}];
  }
}
module.exports = {inspectContinuation,generateWithContinuation,addUsage,trackCoverage};
