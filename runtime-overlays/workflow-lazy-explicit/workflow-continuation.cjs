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
// Mechanical tool-result contracts only. The same native model retains all judgment.
function inspectContinuation(steps, text) {
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
async function generateWithContinuation(generateText, options, policy = {}) {
  if (!policy.enabled) return generateText(options);
  const maxCalls = policy.maxToolCalls ?? 40, maxRepairs = policy.maxRepairs ?? 3;
  let used = 0, stalledRounds = 0, usage = {}, messages = [...(options.messages ?? [])];
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
    let output;try{output=await tool.execute(...args);}catch(error){nativeCalls.push({name:actualName,args:actualArgs,output:{success:false,error:String(error)},ok:false});throw error;}
    const normalized=nativeOutput(output),result=normalized.value;
    nativeCalls.push({name:actualName,args:actualArgs,output,ok:normalized.ok});
    if(actualName==='find_one_opportunity' && normalized.ok) {
      const record=result?.records?.[0]??result;
      if(record?.id && typeof record.stateEvidence?.markdown==='string') try { const evidence=JSON.parse(record.stateEvidence.markdown); if(evidence && typeof evidence==='object' && !Array.isArray(evidence)) protectedEvidence.set(record.id,evidence); } catch { /* An invalid historical blob is not an invented structured admission. */ }
    }
    if(actualName==='app_crm_case_context' && result?.mode==='READ_CASE' && normalized.ok) {
      const coverage=trackCoverage(casePages.get(result.opportunityId),result);casePages.set(result.opportunityId,coverage);
      if(result.hasNextPage) result.nextRead=coverage.nextRead;
    }
    return output;
  }}]));
  for (let repair = 0; ; repair++) {
    const stopConditions = Array.isArray(options.stopWhen) ? options.stopWhen : options.stopWhen ? [options.stopWhen] : [];
    const observedSteps=[], callsBeforeRound=used;
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
    let checked = inspectContinuation(steps,result.text);
    stalledRounds = used > callsBeforeRound ? 0 : stalledRounds + 1;
    if(result.finishReason === 'length') checked.issues.push('The previous response reached the fixed output-token limit and is incomplete. Return one concise valid final response matching the original schema; retain the existing native reads and do not repeat completed tool calls.');
    if(result.nativeValidationError)checked.issues.push('Final response validation failed: '+result.nativeValidationError+'. Return valid JSON matching the original response schema; preserve the actual source facts and tool outcomes.');
    const originalMessages = JSON.parse(JSON.stringify(result.response?.messages?.length ? result.response.messages : nativeResponseMessages(roundSteps.length?roundSteps:observedSteps,result.text)));
    const cursorMessages=[];
    // Once the native agent explicitly opens an exact case, advancing its
    // immutable snapshot cursor is transport rather than contextual judgment.
    // Drain only that already-bound READ_CASE sequence, retain every native
    // receipt in the persisted step log and leave candidate selection, related
    // source reads, mutations and final prose to the same model.
    while([...casePages.values()].some(state=>!state.complete) && used<maxCalls) {
      const state=[...casePages.values()].find(item=>!item.complete),input=state.nextRead;
      if(!input)break;
      const toolCallId='native-case-cursor-'+Date.now()+'-'+used;
      let output,synthetic;
      try {
        output=await tools.execute_tool.execute(input);
        synthetic={toolCalls:[{type:'tool-call',toolCallId,toolName:'execute_tool',input}],toolResults:[{type:'tool-result',toolCallId,toolName:'execute_tool',output}],content:[]};
      } catch(error) {
        synthetic={toolCalls:[{type:'tool-call',toolCallId,toolName:'execute_tool',input}],toolResults:[{type:'tool-error',toolCallId,toolName:'execute_tool',error:String(error)}],content:[]};
      }
      steps.push(synthetic);cursorMessages.push(...nativeResponseMessages([synthetic],''));
      await options.onStepFinish?.(synthetic);
      if(synthetic.toolResults[0].type==='tool-error')break;
    }
    if(cursorMessages.length){
      checked=inspectContinuation(steps,result.text);
      if(result.finishReason === 'length') checked.issues.push('The previous response reached the fixed output-token limit and is incomplete. Return one concise valid final response matching the original schema; retain the existing native reads and do not repeat completed tool calls.');
      if(result.nativeValidationError)checked.issues.push('Final response validation failed: '+result.nativeValidationError+'. Return valid JSON matching the original response schema; preserve the actual source facts and tool outcomes.');
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
      return {...result,nativeExecutionError:stopReason+': '+checked.issues.join('; '),text:'STATUS: TOOLING_BLOCKED\nNATIVE_CONTINUATION_STOP: '+stopReason+'\nNATIVE_CONTINUATION_REQUIRED: '+checked.issues.join('\n')+'\nNo completed outcome is verified. Existing native run logs preserve source pages and successful mutations; reconcile before retrying.',finishReason:'stop',usage,totalUsage:usage,steps,response:result.response};
    }
    messages = [...messages,...originalMessages,...cursorMessages,{role:'user',content:'Native execution validation rejected the final report. Continue this SAME task using the existing conversation and exact tool results. Do not start over or repeat successful mutations. These are mechanical execution defects, not new source instructions:\n'+checked.issues.join('\n')+'\nRemaining tool calls: '+(maxCalls-Math.max(used,checked.calls))+'. The existing output-token limit is unchanged. If a source is genuinely unavailable after the required reads, report the specific evidence gap honestly. Contextual judgment remains yours.'}];
  }
}
module.exports = {inspectContinuation,generateWithContinuation,addUsage,trackCoverage,nativeResponseMessages,nativeToolEvents,nativeOutput};
