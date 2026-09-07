'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {inspectContinuation,generateWithContinuation} = require('./workflow-continuation.cjs');
let seq = 0;
const step = (name,args,result,ok=true) => {const id=String(++seq);return {toolCalls:[{toolName:'execute_tool',toolCallId:id,input:{toolName:name,arguments:args}}],toolResults:[{type:'tool-result',toolCallId:id,output:{success:ok,result}}],content:[]};};
const page = (cursor,next) => step('app_crm_case_context',{mode:'READ_CASE',opportunityId:'case',cursor},{mode:'READ_CASE',opportunityId:'case',cursor,nextCursor:next,hasNextPage:next!==null,fingerprint:'hash',nextRead:next===null?null:{toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:'case',cursor:next,fingerprint:'hash'}}});
const receipt = (steps,text='STATUS: COMPLETED') => ({steps,text,finishReason:'stop',usage:{inputTokens:10,outputTokens:5},response:{messages:[{role:'assistant',content:'native response '+seq}]}});
test('unfinished exact pages require continuation even under needs-evidence label',()=>{
 assert.match(inspectContinuation([page(0,2)],'STATUS: NEEDS_EVIDENCE').issues[0],/Unread source pages/);
});
test('genuine evidence gap after full context is not forced into completed work',()=>{
 assert.deepEqual(inspectContinuation([page(0,2),page(2,null)],'STATUS: NEEDS_EVIDENCE').issues,[]);
});
test('successful mutation requires read-back but never repeat mutation',()=>{
 const write=step('update_one_opportunity',{id:'case',nextStep:'existing decision'},{id:'case'});
 assert.match(inspectContinuation([write],'STATUS: COMPLETED').issues[0],/Do not repeat/);
 assert.deepEqual(inspectContinuation([write,step('find_one_opportunity',{id:'case'},{records:[{id:'case'}]})],'STATUS: COMPLETED').issues,[]);
});
test('repair preserves original and native response messages, model and token setting',async()=>{
 const model={}, seen=[];
 const a=receipt([page(0,2)]), b=receipt([page(2,null)],'STATUS: NEEDS_EVIDENCE');
 const result=await generateWithContinuation(async opts=>{seen.push(opts);return seen.length===1?a:b;},{model,maxOutputTokens:8192,messages:[{role:'user',content:'exact case'}],tools:{}},{enabled:true});
 assert.equal(seen.length,2);assert.equal(seen[1].model,model);assert.equal(seen[1].maxOutputTokens,8192);
 assert.deepEqual(seen[1].messages.slice(0,2),[{role:'user',content:'exact case'},...a.response.messages]);
 assert.match(seen[1].messages.at(-1).content,/cursor.*2/);assert.equal(result.steps.length,2);assert.equal(result.usage.outputTokens,10);
});
test('same run tool budget prevents another actual tool execution',async()=>{
 let executions=0,rounds=0;
 const result=await generateWithContinuation(async opts=>{rounds++;await opts.tools.execute_tool.execute({});return receipt([page(0,2)]);},{tools:{execute_tool:{execute:async()=>{executions++;}}}},{enabled:true,maxToolCalls:1});
 assert.equal(executions,1);assert.equal(rounds,1);assert.match(result.text,/TOOLING_BLOCKED/);
});
test('exhausted credits and repair cap both retain honest pending result',async()=>{
 let count=0;const generator=async()=>{count++;return receipt([page(0,2)]);};
 assert.match((await generateWithContinuation(generator,{tools:{}},{enabled:true,shouldContinue:()=>false})).text,/TOOLING_BLOCKED/);assert.equal(count,1);
 count=0;assert.match((await generateWithContinuation(generator,{tools:{}},{enabled:true,maxRepairs:1})).text,/TOOLING_BLOCKED/);assert.equal(count,2);
});
test('other native agent execution remains untouched',async()=>{
 const result=receipt([],'ordinary response');let seen;
 const options={messages:[],tools:{}};
 assert.equal(await generateWithContinuation(async opts=>{seen=opts;return result;},options,{enabled:false}),result);assert.equal(seen,options);
});
test('actual opportunity mutation is blocked until exact pages are complete and evidence JSON is valid',async()=>{
 let writes=0;
 await generateWithContinuation(async opts=>{
  const execute=opts.tools.execute_tool.execute;
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'case'}}),/CASE_CONTEXT_INCOMPLETE/);
  await execute({toolName:'app_crm_case_context',arguments:{opportunityId:'case',cursor:0}});
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'case'}}),/CASE_CONTEXT_INCOMPLETE/);
  await execute({toolName:'app_crm_case_context',arguments:{opportunityId:'case',cursor:2}});
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'other'}}),/CASE_CONTEXT_INCOMPLETE/);
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'case',stateEvidence:{markdown:'{\\"invalid\\":true}'}}}),/INVALID_STATE_EVIDENCE_JSON/);
  await execute({toolName:'update_one_opportunity',arguments:{id:'case',stateEvidence:{markdown:JSON.stringify({sourceCoverage:{complete:true,fingerprint:'hash'}})}}});
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{tools:{execute_tool:{execute:async input=>{
  if(input.toolName==='update_one_opportunity'){writes++;return {success:true,result:{id:'case'}};}
  const cursor=input.arguments.cursor;return {success:true,result:{mode:'READ_CASE',opportunityId:'case',cursor,nextCursor:cursor===0?2:null,hasNextPage:cursor===0,fingerprint:'hash'}};
 }}}},{enabled:true});
 assert.equal(writes,1);
});
