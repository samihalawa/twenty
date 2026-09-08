'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {inspectContinuation,generateWithContinuation} = require('./workflow-continuation.cjs');
let seq = 0;
const step = (name,args,result,ok=true) => {const id=String(++seq);return {toolCalls:[{toolName:'execute_tool',toolCallId:id,input:{toolName:name,arguments:args}}],toolResults:[{type:'tool-result',toolCallId:id,output:{success:ok,result}}],content:[]};};
const page = (cursor,next) => step('app_crm_case_context',{mode:'READ_CASE',opportunityId:'case',cursor},{mode:'READ_CASE',opportunityId:'case',cursor,nextCursor:next,hasNextPage:next!==null,totalSections:next===4||cursor===4?6:4,providerPaginationComplete:true,sections:Array.from({length:(next??(cursor===4?6:4))-cursor},(_,i)=>({sourceId:'message-'+(cursor+i)})),fingerprint:'hash',nextRead:next===null?null:{toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:'case',cursor:next,fingerprint:'hash'}}});
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
 assert.deepEqual(inspectContinuation([page(0,null),write,step('find_one_opportunity',{id:'case'},{records:[{id:'case'}]})],'STATUS: COMPLETED').issues,[]);
});
test('repair preserves original and native response messages, model and token setting',async()=>{
 const model={}, seen=[];
 const a=receipt([page(0,2)]), b=receipt([page(2,null)],'STATUS: NEEDS_EVIDENCE');
 const result=await generateWithContinuation(async opts=>{seen.push(opts);return seen.length===1?a:b;},{model,maxOutputTokens:8192,messages:[{role:'user',content:'exact case'}],tools:{}},{enabled:true});
 assert.equal(seen.length,2);assert.equal(seen[1].model,model);assert.equal(seen[1].maxOutputTokens,8192);
 assert.deepEqual(seen[1].messages.slice(0,2),[{role:'user',content:'exact case'},...a.response.messages]);
 assert.match(seen[1].messages.at(-1).content,/cursor.*2/);assert.equal(result.steps.length,2);assert.equal(result.usage.outputTokens,10);
});
test('length-limited premature output continues to the unread native cursor',async()=>{
 let rounds=0;const model={};
 const result=await generateWithContinuation(async options=>{
  rounds++;
  assert.equal(options.model,model);assert.equal(options.maxOutputTokens,8192);
  if(rounds===1)return {...receipt([page(0,2)],'{"status":"PREPARED","content":"partial"'),finishReason:'length'};
  assert.match(options.messages.at(-1).content,/cursor.*2/);
  return receipt([page(2,null)],'STATUS: NEEDS_EVIDENCE');
 },{model,maxOutputTokens:8192,messages:[{role:'user',content:'prepare exact case'}],tools:{}},{enabled:true,maxRepairs:3});
 assert.equal(rounds,2);assert.equal(result.text,'STATUS: NEEDS_EVIDENCE');
});
test('length-limited output repairs even when no native cursor remains',async()=>{
 let rounds=0;
 const result=await generateWithContinuation(async options=>{
  rounds++;
  if(rounds===1)return {...receipt([],'{"status":"PREPARED","content":"truncated"}'),finishReason:'length'};
  assert.match(options.messages.at(-1).content,/output-token limit/);
  return {...receipt([],'{"status":"PREPARED","content":"complete"}'),finishReason:'stop'};
 },{messages:[{role:'user',content:'prepare exact case'}],tools:{}},{enabled:true,maxRepairs:3});
 assert.equal(rounds,2);assert.equal(result.finishReason,'stop');assert.match(result.text,/complete/);
});
test('plain structured-output failure receives the exact required JSON shape',async()=>{
 let rounds=0;
 const responseSchema={type:'object',properties:{status:{type:'string'},candidateDecisions:{type:'array',items:{type:'object'}},documents:{type:'array',items:{type:'object'}}},required:['status','candidateDecisions','documents'],additionalProperties:false};
 const result=await generateWithContinuation(async options=>{
  if(++rounds===1)return {...receipt([],'I have enough context to prepare the package.'),nativeValidationError:'The final response must be valid JSON matching the configured response schema.'};
  assert.match(options.messages.at(-1).content,/Required JSON shape/);
  assert.match(options.messages.at(-1).content,/\{"status":"","candidateDecisions":\[\],"documents":\[\]\}/);
  return receipt([],'{"status":"PREPARED","candidateDecisions":[],"documents":[]}');
 },{messages:[{role:'user',content:'prepare'}],tools:{}},{enabled:true,responseSchema,maxRepairs:3});
 assert.equal(rounds,2);assert.equal(result.text,'{"status":"PREPARED","candidateDecisions":[],"documents":[]}');
});
test('an explicitly opened exact case drains its immutable cursor receipts before model repair',async()=>{
 let rounds=0,executions=0,persisted=0;
 const result=await generateWithContinuation(async options=>{
  rounds++;
  if(rounds===1){
   const first=await options.tools.execute_tool.execute({toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:'case',cursor:0}});
   return receipt([step('app_crm_case_context',{mode:'READ_CASE',opportunityId:'case',cursor:0},first.result)],'{"status":"PREPARED","content":"premature"}');
  }
  const receipts=options.messages.filter(message=>message.role==='tool');
  assert.ok(receipts.length>=2);assert.match(options.messages.at(-1).content,/Exact READ_CASE cursor transport completed/);
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{messages:[{role:'user',content:'prepare exact case'}],onStepFinish:async()=>{persisted++;},tools:{execute_tool:{execute:async input=>{
  executions++;const cursor=input.arguments.cursor;
  return {success:true,result:{mode:'READ_CASE',opportunityId:'case',fingerprint:'hash',cursor,nextCursor:cursor===0?2:cursor===2?4:null,hasNextPage:cursor<4,totalSections:6,providerPaginationComplete:true,sections:Array.from({length:2},(_,i)=>({sourceId:'message-'+(cursor+i)}))}};
 }}}},{enabled:true,maxToolCalls:40});
 assert.equal(rounds,2);assert.equal(executions,3);assert.equal(persisted,2);
 assert.equal(result.text,'STATUS: NEEDS_EVIDENCE');
});
test('returned SDK receipt also initializes deterministic cursor drain',async()=>{
 let rounds=0,executions=0;
 const result=await generateWithContinuation(async options=>{
  rounds++;
  if(rounds===1)return {...receipt([page(0,2)],'{"status":"PREPARED","content":"premature"}'),finishReason:'length'};
  const toolReceipts=options.messages.filter(message=>message.role==='tool');
  assert.ok(toolReceipts.length>=1);assert.match(options.messages.at(-1).content,/cursor transport completed/);
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{messages:[{role:'user',content:'prepare exact case'}],tools:{execute_tool:{execute:async input=>{
  executions++;assert.equal(input.arguments.cursor,2);
  return {success:true,result:{mode:'READ_CASE',opportunityId:'case',fingerprint:'hash',cursor:2,nextCursor:null,hasNextPage:false,totalSections:4,providerPaginationComplete:true,sections:[{sourceId:'message-2'},{sourceId:'message-3'}]}};
 }}}},{enabled:true,maxToolCalls:40});
 assert.equal(rounds,2);assert.equal(executions,1);assert.equal(result.text,'STATUS: NEEDS_EVIDENCE');
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
test('structured parse recovery keeps real step messages inside the continuation loop',async()=>{
 let rounds=0;const originalError=new Error('native structured parse');
 const first=page(0,2);first.response={messages:[{role:'assistant',content:'native tool call'},{role:'tool',content:'native first page'}]};
 const result=await generateWithContinuation(async options=>{
  rounds++;
  if(rounds===1){await options.onStepFinish(first);throw originalError;}
  assert.deepEqual(options.messages.slice(1,3),first.response.messages);
  return receipt([page(2,null)],'{"status":"NEEDS_EVIDENCE"}');
 },{tools:{},messages:[{role:'user',content:'case'}]},{enabled:true,recoverError:(error,steps)=>{assert.equal(error,originalError);return receipt(steps,'{"status":"TOOLING_BLOCKED"}');}});
 assert.equal(rounds,2);assert.equal(result.steps.length,2);
});
test('only exact registered tool with known malformed channel suffix is repaired',async()=>{
 const input='{ "id": "exact" }';
 await generateWithContinuation(async options=>{
  const repaired=await options.experimental_repairToolCall({toolCall:{toolName:'execute_tool<|channel|>json',input}});
  assert.equal(repaired.toolName,'execute_tool');assert.equal(repaired.input,input);
  assert.equal(await options.experimental_repairToolCall({toolCall:{toolName:'send_everything<|channel|>json',input}}),null);
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{tools:{execute_tool:{execute:async()=>({})}}},{enabled:true});
});
test('invalid final structured output receives bounded same-model repair with real steps',async()=>{
 let rounds=0;const first=page(0,null);first.response={messages:[{role:'assistant',content:'actual case read'},{role:'tool',content:'all native pages'}]};
 const result=await generateWithContinuation(async options=>{
  if(++rounds===1){await options.onStepFinish(first);throw Error('invalid final JSON');}
  assert.match(options.messages.at(-1).content,/Final response validation failed/);
  assert.deepEqual(options.messages.slice(1,3),first.response.messages);
  return receipt([],'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: exact external assessment completion');
 },{tools:{},messages:[{role:'user',content:'task'}]},{enabled:true,recoverError:(error,steps)=>({...receipt(steps,'{"status":'),nativeValidationError:'unexpected end'})});
 assert.equal(rounds,2);assert.equal(result.steps.length,1);
});
test('repeated cursor0 preserves already read pages for identical source fingerprint',()=>{
 const s=[page(0,2),page(2,4),page(0,2),page(4,null)];
 assert.deepEqual(inspectContinuation(s,'STATUS: NEEDS_EVIDENCE').issues,[]);
});
test('native execution binds opaque fingerprint and evidence from exact read receipts',async()=>{
 let second;
 await generateWithContinuation(async opts=>{
  const execute=opts.tools.execute_tool.execute;
  const a=await execute({toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:'case',cursor:0}});
  assert.equal(a.result.nextRead.arguments.fingerprint,undefined);
  await execute(a.result.nextRead);
  await execute({toolName:'update_one_opportunity',arguments:{id:'case',evidenceJSON:{sourceCoverage:{complete:true}}}});
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{tools:{execute_tool:{execute:async input=>{
  if(input.toolName==='update_one_opportunity'){assert.equal(input.arguments.evidenceJSON.sourceCoverage.fingerprint,'full-native-fingerprint');return {success:true,result:{id:'case'}};}
  const cursor=input.arguments.cursor;if(cursor>0){second=input.arguments;assert.equal(second.fingerprint,'full-native-fingerprint');}
  return {success:true,result:{mode:'READ_CASE',opportunityId:'case',cursor,nextCursor:cursor===0?2:null,hasNextPage:cursor===0,totalSections:4,fingerprint:'full-native-fingerprint'}};
 }}}},{enabled:true});
 assert.equal(second.cursor,2);
});

test('candidate index cannot authorize a mutation until exact selected bodies are read',async()=>{
 const body='Exact current source',hash=require('node:crypto').createHash('sha256').update(body).digest('hex');
 const manifest=JSON.stringify({id:'thread',messages:[{id:'message',bodyCharacters:body.length,bodySha256:hash}]});
 const section={sourceType:'DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ',sourceId:'thread',offset:0,totalCharacters:manifest.length,text:manifest};let writes=0;
 await generateWithContinuation(async opts=>{
  const execute=opts.tools.execute_tool.execute;
  await execute({toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:'case',cursor:0}});
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'case',evidenceJSON:{}}}),/CANDIDATE_CONTEXT_DECISIONS_MISSING/);
  const evidenceJSON={candidateDecisions:[{threadId:'thread',decision:'READ',reason:'Exact current request'}]};
  await assert.rejects(execute({toolName:'update_one_opportunity',arguments:{id:'case',evidenceJSON}}),/SELECTED_CONTEXT_READ_INCOMPLETE/);
  await execute({toolName:'find_many_messages',arguments:{messageThreadId:{eq:'thread'},select:['id','messageThreadId','text'],offset:0,limit:5}});
  await execute({toolName:'update_one_opportunity',arguments:{id:'case',evidenceJSON}});
  return receipt([],'STATUS: NEEDS_EVIDENCE');
 },{tools:{execute_tool:{execute:async input=>{
  if(input.toolName==='update_one_opportunity'){writes++;return {success:true,result:{id:'case'}};}
  if(input.toolName==='find_many_messages')return {success:true,result:{hasNextPage:false,records:[{id:'message',messageThreadId:'thread',text:body}]}};
  return {success:true,result:{mode:'READ_CASE',opportunityId:'case',cursor:0,nextCursor:null,hasNextPage:false,totalSections:1,fingerprint:'hash',sections:[section]}};
 }}}},{enabled:true});assert.equal(writes,1);
});

test('false NO_WORK after complete case reads is fed back through the independent operator verifier',()=>{
 const checked=inspectContinuation([page(0,null)],'STATUS: NO_WORK\nMISSING_EVIDENCE:none');
 assert.ok(checked.issues.some(x=>x.includes('NO_WORK has no bounded source search')));
});

test('incomplete NO_WORK pagination is downgraded once without wasting repair rounds',async()=>{
 let rounds=0;
 const discovery=step('find_many_messages',{receivedAt:{gte:'2026-09-01T00:00:00.000Z'},offset:0,limit:5},{records:[{id:'message-1',text:'Human request'}],count:1,hasNextPage:true});
 const result=await generateWithContinuation(async()=>{rounds++;return receipt([discovery],'STATUS: NO_WORK');},{tools:{}},{enabled:true,maxRepairs:3});
 assert.equal(rounds,1);
 assert.match(result.text,/STATUS: ATTEMPTED_UNVERIFIED/);
 assert.match(result.text,/NATIVE_EXECUTION_PENDING/);
 assert.deepEqual(inspectContinuation(result.steps,result.text).issues,[]);
});

test('tooling blocked and attempted statuses require real native evidence',()=>{
 assert.ok(inspectContinuation([],'STATUS: TOOLING_BLOCKED').issues.some(x=>x.includes('no failed native tool call')));
 assert.ok(inspectContinuation([],'STATUS: ATTEMPTED_UNVERIFIED').issues.some(x=>x.includes('no native tool call')));
 const failed={toolCalls:[{toolCallId:'bad',toolName:'execute_tool',input:{toolName:'find_many_messages',arguments:{offset:0}}}],toolResults:[{type:'tool-error',toolCallId:'bad',error:'provider unavailable'}],content:[]};
 assert.deepEqual(inspectContinuation([failed],'STATUS: TOOLING_BLOCKED').issues,[]);
 assert.deepEqual(inspectContinuation([step('find_one_person',{id:'person'},{id:'person'})],'STATUS: ATTEMPTED_UNVERIFIED').issues,[]);
});

test('meeting outcome cannot finalize before every discovered event and participant set is opened',()=>{
 const events=[{id:'event-1',title:'First',startsAt:'2026-09-08T07:00:00Z',endsAt:'2026-09-08T07:30:00Z'},{id:'event-2',title:'Second',startsAt:'2026-09-08T08:00:00Z',endsAt:'2026-09-08T08:30:00Z'}];
 const discovery=step('find_many_calendar_events',{and:[{startsAt:{gte:'2026-09-08T01:00:00Z'}}],offset:0,limit:5},{records:events,count:2,hasNextPage:true});
 const first=[discovery,step('find_one_calendar_event',{id:'event-1'},events[0]),step('find_many_calendar_event_participants',{and:[{calendarEventId:{eq:'event-1'}}]},{records:[],hasNextPage:false})];
 let issues=inspectContinuation(first,'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: opportunity link');
 assert.ok(issues.issues.some(x=>x.includes('event-2')));
 const complete=[...first,step('find_one_calendar_event',{id:'event-2'},events[1]),step('find_many_calendar_event_participants',{and:[{calendarEventId:{eq:'event-2'}}]},{records:[],hasNextPage:false})];
 issues=inspectContinuation(complete,'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: opportunity link');
 assert.deepEqual(issues.issues,[]);
});

test('inbox outcome cannot finalize before every discovered message body is opened',()=>{
 const discovery=step('find_many_messages',{and:[{receivedAt:{gte:'2026-09-01T00:00:00Z'}},{receivedAt:{lt:'2026-09-08T00:00:00Z'}}],offset:0,limit:5},{records:[{id:'message-1'},{id:'message-2'}],count:2,hasNextPage:true});
 const partial=[discovery,step('find_one_message',{id:'message-1'},{id:'message-1',text:'Body one'})];
 assert.ok(inspectContinuation(partial,'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: exact case').issues.some(x=>x.includes('message-2')));
 const complete=[...partial,step('find_one_message',{id:'message-2'},{id:'message-2',text:'Body two'})];
 assert.deepEqual(inspectContinuation(complete,'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: exact case').issues,[]);
});

test('structured parse recovery without SDK messages retains actual native tool history and continues',async()=>{
 let rounds=0;const first=page(0,2);first.response={id:'provider-response'};
 const result=await generateWithContinuation(async options=>{
  if(++rounds===1){await options.onStepFinish(first);throw Error('parsed response missing SDK messages');}
  const replay=options.messages.find(m=>m.role==='tool');
  assert.equal(replay.content[0].output.type,'json');assert.equal(replay.content[0].output.value.result.cursor,0);
  assert.equal(options.messages.find(m=>m.role==='assistant').content[0].toolCallId,first.toolCalls[0].toolCallId);
  return receipt([page(2,null)],'{"status":"NEEDS_EVIDENCE"}');
 },{tools:{},messages:[{role:'user',content:'case'}]},{enabled:true,recoverError:(_error,steps)=>({steps,text:'{"status":"TOOLING_BLOCKED"}',finishReason:'stop',usage:{outputTokens:12}})});
 assert.equal(rounds,2);assert.equal(result.steps.length,2);
});

test('actual SDK tool-error content is retained when toolResults contains only successful results',()=>{
 const failed={toolCalls:[{toolCallId:'failed',toolName:'execute_tool',input:{toolName:'update_one_opportunity',arguments:{id:'case'}}}],toolResults:[],content:[{type:'tool-error',toolCallId:'failed',toolName:'execute_tool',error:Error('CANDIDATE_CONTEXT_DECISIONS_MISSING: exact thread requires a decision')}]};
 assert.ok(inspectContinuation([failed],'STATUS: NO_WORK').issues.some(x=>x.includes('CANDIDATE_CONTEXT_DECISIONS_MISSING')));
});
test('real native tool progress may continue beyond three rounds within the fixed forty-call budget',async()=>{
 let rounds=0;
 const result=await generateWithContinuation(async options=>{
  rounds++;await options.tools.execute_tool.execute({toolName:'find_one_person',arguments:{id:'canonical'}});
  if(rounds<5)return {...receipt([],'{"status":"PREPARED","content":"partial"}'),finishReason:'length'};
  return receipt([],'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: exact provider confirmation');
 },{tools:{execute_tool:{execute:async()=>({success:true,result:{id:'canonical'}})}}},{enabled:true,maxToolCalls:40,maxRepairs:3});
 assert.equal(rounds,5);assert.equal(result.text,'STATUS: NEEDS_EVIDENCE\nMISSING_EVIDENCE: exact provider confirmation');
});

test('an empty structured-error round retains earlier native history instead of declaring history unavailable',async()=>{
 let rounds=0;const first=receipt([page(0,2)]);
 const result=await generateWithContinuation(async options=>{
  rounds++;if(rounds===1)return first;
  if(rounds===2)throw Error('empty provider structured response');
  assert.deepEqual(options.messages[0],first.response.messages[0]);
  return receipt([page(2,null)],'STATUS: NEEDS_EVIDENCE');
 },{tools:{}},{enabled:true,recoverError:()=>({text:'',steps:[],finishReason:'stop',nativeValidationError:'Empty final JSON'})});
 assert.equal(rounds,3);assert.equal(result.text,'STATUS: NEEDS_EVIDENCE');
});

test('one canonical SDK event merge preserves separate errors for both history and verification',()=>{
 const {nativeResponseMessages}=require('./workflow-continuation.cjs');
 const raw={content:[{type:'tool-call',toolCallId:'bad-1',toolName:'execute_tool',input:{toolName:'find_many_messages',arguments:{filter:{bad:true}}}}],toolResults:[{type:'tool-error',toolCallId:'bad-1',error:'invalid filter field'}]};
 const replay=nativeResponseMessages([raw],'');assert.equal(replay[1].role,'tool');assert.equal(replay[1].content[0].output.value,'invalid filter field');
 assert.ok(inspectContinuation([raw],'STATUS: NO_WORK').issues.some(x=>x.includes('invalid filter field')));
});
test('nested error payload is never successful source coverage',()=>{
 const bad=step('app_crm_case_context',{opportunityId:'case'},{data:{error:'Native provider unavailable',mode:'READ_CASE',opportunityId:'case',cursor:0,hasNextPage:false}});
 assert.ok(inspectContinuation([bad],'STATUS: NO_WORK').issues.some(x=>x.includes('Native provider unavailable')));
});
