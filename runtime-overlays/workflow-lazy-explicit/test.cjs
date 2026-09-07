'use strict';
(async()=>{
const PATCHES=require('./patch.cjs').preparePatches();

const vm=require('node:vm'),assert=require('node:assert/strict');
const fallback=new Proxy({}, {get:()=>function(){return ()=>undefined}});
const decorators={UseGuards:()=>()=>{},UsePipes:()=>()=>{},UseFilters:()=>()=>{},Injectable:()=>()=>{},Inject:()=>()=>{},Logger:class{log(){} warn(){} error(){}}};
function moduleClass(source,name,overrides={}){
 const exports={};
 vm.runInNewContext(source,{exports,require:(key)=>key==='@nestjs/common'?decorators:key==='zod'?require('node:module').createRequire('/app/packages/twenty-server/package.json')('zod'):overrides[key]??fallback,Set,Map,Date,String,Object,Math,Error,Buffer},{timeout:2000});
 return exports[name];
}
const Registry=moduleClass(PATCHES[2].patched,'ToolRegistryService',{
'ai':{jsonSchema:x=>x},
'../output-transforms/compact-tool-output.util':{compactToolOutput:x=>x}
});
const contextSeen=[];
const provider={category:'record',isAvailable:async c=>true,generateDescriptors:async(c,o)=>{
 contextSeen.push({c,o});
 const allowed=[{name:'get_opportunity',category:'record',description:'Read opportunity'},...(!c.requireExplicitObjectGrants?[{name:'delete_ungranted',category:'record',description:'Ungrant'}]:[])];
 return allowed.map(x=>o.includeSchemas?{...x,inputSchema:{type:'object'}}:x);
}};
const dispatches=[];
const registry=new Registry([provider],{dispatch:async(d,a,c)=>{dispatches.push({d,a,c});return {success:true,id:'op-1'}}},{spillIfTooLarge:async x=>x});
const metaContexts=[],calls=[];
const usage={inputTokens:5,outputTokens:2,totalTokens:7};
const mockAi={
 jsonSchema:(x,options)=>({jsonSchema:x,...options}),Output:{object:x=>x},stepCountIs:()=>()=>false,
 generateText:async args=>{calls.push(args);return args.output&&!args.tools?{output:{id:'op-1',state:'unchanged'},usage,steps:[]}:{text:'Verified op-1',usage,steps:[]}}
};
const overrides={
'/opt/workflow-lazy-tools/schema-validation.cjs':require('./schema-validation.cjs'),
'/opt/workflow-lazy-tools/workflow-continuation.cjs':require('./workflow-continuation.cjs'),
'ai':mockAi,
'twenty-shared/constants':{AUTO_SELECT_SMART_MODEL_ID:'auto'},
'twenty-shared/utils':{isDefined:x=>x!=null,isNonEmptyArray:x=>Array.isArray(x)&&x.length>0,tipTapDocumentToMarkdown:()=>''},
'../../../../core-modules/auth/guards/is-user-auth-context.guard':{isUserAuthContext:x=>x.type==='user'},
'../utils/build-agent-role-permission-config.util':{buildAgentRolePermissionConfig:x=>({agent:x.agentRoleId,runAs:x.runAsRoleId})},
'../constants/workflow-agent-registry-tool-categories.const':{WORKFLOW_AGENT_REGISTRY_TOOL_CATEGORIES:['record']},
'../../../../core-modules/tool/tools/output-navigation-tool/constants/output-navigation-tool-names.constant':{OUTPUT_NAVIGATION_TOOL_NAMES:['get_tool_output']},
'../../../../core-modules/tool-provider/tools':{
 LEARN_TOOLS_TOOL_NAME:'learn_tools',EXECUTE_TOOL_TOOL_NAME:'execute_tool',
 createLearnToolsTool:(r,c,o)=>{metaContexts.push(c);return {execute:async({toolNames})=>{if(toolNames.some(n=>!o.isToolAllowed(n)))throw Error('not allowed');return r.getToolInfo(toolNames,c)}}},
 createExecuteToolTool:(r,c,o)=>{metaContexts.push(c);return {execute:async({toolName,args})=>{if(!o.isToolAllowed(toolName))throw Error('not allowed');return r.resolveAndExecute(toolName,args,c)}}}
},
'../../../../core-modules/tool-provider/utils/build-tool-catalog-section.util':{buildToolCatalogSection:c=>JSON.stringify(c)},
'../../ai-chat/utils/provider-options.util':{getCallLevelProviderOptions:()=>({})},
'../../ai-models/utils/build-ai-telemetry.util':{buildAiTelemetry:()=>({})},
'../../ai-billing/utils/extract-cache-creation-tokens.util':{extractCacheCreationTokensFromSteps:()=>0,extractCacheCreationTokens:()=>0},
'../../ai-billing/utils/count-native-web-search-calls-from-steps.util':{countNativeWebSearchCallsFromSteps:()=>0},
'../../ai-billing/utils/merge-language-model-usage.util':{mergeLanguageModelUsage:(a,b)=>a},
'../../ai-billing/utils/convert-dollars-to-billing-credits.util':{convertDollarsToBillingCredits:()=>0},
'../../ai-billing/constants/native-web-search-cost-per-call-dollars':{NATIVE_WEB_SEARCH_COST_PER_CALL_DOLLARS:0},
'../../ai-agent/constants/agent-config.const':{AGENT_CONFIG:{MAX_STEPS:10}},
'../../ai-agent/constants/structured-output-system-prompt.const':{STRUCTURED_OUTPUT_SYSTEM_PROMPT:'Format'},
'../../ai.exception':{AiException:class extends Error{},AiExceptionCode:{}},
'../../../../core-modules/usage/enums/usage-operation-type.enum':{UsageOperationType:{AI_WORKFLOW_TOKEN:'WORKFLOW'}}
};
const Executor=moduleClass(PATCHES[1].patched,'AgentAsyncExecutorService',overrides);
const executor=new Executor(
 {resolveModelForAgent:async()=>({modelId:'model',model:{},sdkPackage:'mock'}),validateModelAvailability(){},getEffectiveModelConfig:()=>({maxOutputTokens:4096})},
 {getReasoningProviderOptions:()=>({})},registry,{bind:()=>({})},
 {calculateCost:()=>0,emitAiTokenUsageEvent:async()=>{},billNativeWebSearchUsage:async()=>{},decrementAndCheckAvailableCredits:async()=>({hasNoMoreAvailableCredits:false})},
 {hasAvailableCreditsOrThrow:async()=>{}},{},{findOne:async()=>({roleId:'role'})},{findOneBy:async()=>null}
);
const agent={id:'agent',workspaceId:'workspace',modelId:'model'};
const base={agent,agentRoleId:'role',authContext:{type:'user',user:{id:'user'},userWorkspaceId:'uw'},actorContext:{name:'actor'}};
const results=[];
const test=async(name,fn)=>{await fn();results.push(name)};
await test('workflow lazy preserves explicit grants in catalog, schemas and execution',async()=>{
 const lazy=await executor.buildLazyRegistryTools({...base,requireExplicitObjectGrants:true});
 assert(!lazy.catalogSection.includes('delete_ungranted'));
 assert.deepEqual(Object.keys(lazy.tools),['learn_tools','execute_tool']);
 await lazy.tools.learn_tools.execute({toolNames:['get_opportunity']});
 await lazy.tools.execute_tool.execute({toolName:'get_opportunity',args:{}});
 assert.equal(dispatches.at(-1).c.requireExplicitObjectGrants,true);
 assert.equal(dispatches.at(-1).c.authContext.user.id,'user');
 assert.equal(dispatches.at(-1).c.actorContext.name,'actor');
 assert.equal(dispatches.at(-1).c.rolePermissionConfig.agent,'role');
 assert(contextSeen.every(x=>x.c.requireExplicitObjectGrants===true));
 await assert.rejects(lazy.tools.execute_tool.execute({toolName:'delete_ungranted',args:{}}));
});
await test('explicit workflow logic functions require admin configuration and bounded read-only allowlist',async()=>{
 const prior=registry.buildToolIndex;
 registry.buildToolIndex=async()=>[
  {name:'get_opportunity',category:'record'},
  {name:'app_crm_runtime_clock',category:'logic_function'},
  {name:'app_crm_case_context',category:'logic_function'},
  {name:'app_linkedin_conversations',category:'logic_function'},
  {name:'app_arbitrary_writer',category:'logic_function'},
  {name:'run_agent',category:'ai'},
  {name:'get_tool_output',category:'record'}
 ];
 try {
  const requested={...agent,modelConfiguration:{workflowReadOnlyToolNames:['app_crm_case_context','app_crm_runtime_clock','app_linkedin_conversations','app_arbitrary_writer','run_agent','get_tool_output']}};
  const scoped=await executor.buildLazyRegistryTools({...base,agent:requested,requireExplicitObjectGrants:true});
  assert(scoped.catalogSection.includes('app_crm_runtime_clock'));
  assert(scoped.catalogSection.includes('app_crm_case_context'));
  assert(scoped.catalogSection.includes('app_linkedin_conversations'));
  for(const denied of ['app_arbitrary_writer','run_agent','get_tool_output']){
   assert(!scoped.catalogSection.includes(denied));
   await assert.rejects(scoped.tools.execute_tool.execute({toolName:denied,args:{}}));
  }
  for(const opts of [{...base,requireExplicitObjectGrants:true},{...base,agent:requested}]){
   const out=await executor.buildLazyRegistryTools(opts);
   assert(!out.catalogSection.includes('app_crm_runtime_clock'));
   assert(!out.catalogSection.includes('app_crm_case_context'));
   await assert.rejects(out.tools.execute_tool.execute({toolName:'app_crm_case_context',args:{}}));
  }
 } finally {registry.buildToolIndex=prior;}
});
await test('case context runtime rejects legacy write modes and unexpected arguments before dispatch',async()=>{
 const before=dispatches.length;
 for(const args of [null,[],{}, {mode:'APPLY',opportunityId:'op'}, {mode:'READ_CASE',opportunityId:'op',apply:true}, {mode:'READ_CASE',payload:{mode:'WRITE'}}, {mode:'READ_CASE',userId:'spoof'}]){
  const out=await registry.resolveAndExecute('app_crm_case_context',args,base);
  assert.equal(out.success,false);assert.match(out.error,/read-only/);
 }
 assert.equal(dispatches.length,before);
 const oldCatalog=registry.getCatalog;registry.getCatalog=async()=>[{name:'app_crm_case_context',category:'logic_function'}];
 try {const out=await registry.resolveAndExecute('app_crm_case_context',{mode:'READ_CASE',opportunityId:'op',cursor:'cursor',fingerprint:'fingerprint'},base);assert.equal(out.success,true);assert.equal(dispatches.length,before+1);}
 finally {registry.getCatalog=oldCatalog;}
});
await test('workflow oversized output is an explicit bounded failure with mutation ambiguity preserved',async()=>{
 const prior=registry.resolveAndExecute;
 registry.resolveAndExecute=async()=>({success:true,result:'x'.repeat(60000)});
 try {
  const scoped=await executor.buildLazyRegistryTools({...base,requireExplicitObjectGrants:true});
  const out=await scoped.tools.execute_tool.execute({toolName:'get_opportunity',args:{}});
  assert.equal(out.success,false);assert.equal(out.errorCode,'WORKFLOW_TOOL_OUTPUT_TOO_LARGE');
  assert.equal(out.operationMayHaveApplied,true);assert(JSON.stringify(out).length<1000);
  assert(out.error.includes('not an empty result'));assert(out.error.includes('read back'));
  const ordinary=await executor.buildLazyRegistryTools(base);
  assert.equal((await ordinary.tools.execute_tool.execute({toolName:'get_opportunity',args:{}})).result.length,60000);
 } finally {registry.resolveAndExecute=prior;}
});
await test('workflow bounded result preserves exact content and dates',async()=>{
 const prior=registry.resolveAndExecute;
 const result={success:true,result:{receivedAt:'2026-09-04T01:02:03Z',body:'Complete message'}};
 registry.resolveAndExecute=async()=>result;
 try {
  const scoped=await executor.buildLazyRegistryTools({...base,requireExplicitObjectGrants:true});
  assert.equal(await scoped.tools.execute_tool.execute({toolName:'get_opportunity',args:{}}),result);
 } finally {registry.resolveAndExecute=prior;}
});
await test('ordinary lazy retains existing broad-role behavior',async()=>{
 const lazy=await executor.buildLazyRegistryTools(base);
 assert(lazy.catalogSection.includes('delete_ungranted'));
 assert.equal(metaContexts.at(-1).requireExplicitObjectGrants,false);
 assert.equal(metaContexts.at(-1).rolePermissionConfig,undefined);
});
await test('run-as composition is retained for ordinary lazy',async()=>{
 await executor.buildLazyRegistryTools({...base,runAsRoleId:'run-role'});
 assert.equal(metaContexts.at(-1).rolePermissionConfig.runAs,'run-role');
});
const execArgs={agent,messages:[{role:'user',content:'Reconcile op-1'}],workspaceId:'workspace',baseSystemPrompt:'Task',authContext:base.authContext};
await test('workflow lazy returns existing text result contract',async()=>{
 calls.length=0;
 const out=await executor.executeAgent({...execArgs,toolLoadingStrategy:'lazy-workflow-explicit'});
 assert.equal(out.result.response,'Verified op-1');
 assert.deepEqual(Object.keys(calls[0].tools),['learn_tools','execute_tool']);
 assert(!calls[0].system.includes('delete_ungranted'));
 assert.equal(calls.length,1);
 assert.equal(calls[0].maxOutputTokens,4096);
});
await test('workflow lazy retains second structured-output call',async()=>{
 calls.length=0;
 const out=await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:{type:'object'}}},toolLoadingStrategy:'lazy-workflow-explicit'});
 assert.equal(out.result.id,'op-1');
 assert.equal(calls.length,2);
 assert(calls[1].output);
 assert.equal(calls[0].maxOutputTokens,4096);
 assert.equal(calls[1].maxOutputTokens,4096);
});
await test('preload default remains unchanged for other callers',async()=>{
 calls.length=0;await executor.executeAgent(execArgs);
 assert.deepEqual(Object.keys(calls[0].tools),['get_opportunity']);
});
await test('agents without assigned role receive no registry tools',async()=>{
 executor.roleTargetRepository.findOne=async()=>null;
 calls.length=0;await executor.executeAgent({...execArgs,toolLoadingStrategy:'lazy-workflow-explicit'});
 assert.deepEqual(Object.keys(calls[0].tools),[]);
});
const Workflow=moduleClass(PATCHES[0].patched,'AiAgentWorkflowAction',{
'twenty-shared/utils':{resolveInput:x=>x},
'../../utils/find-step-or-throw.util':{findStepOrThrow:({steps})=>steps[0]},
'./guards/is-workflow-ai-agent-action.guard':{isWorkflowAiAgentAction:()=>true},
'./utils/build-ai-agent-step-log.util':{buildAiAgentStepLog:()=>null},
'../../../../../engine/core-modules/usage/enums/usage-operation-type.enum':{UsageOperationType:{AI_WORKFLOW_TOKEN:'WORKFLOW'}},
'../../../../../engine/metadata-modules/ai/ai-agent/constants/workflow-base-system-prompt.const':{WORKFLOW_BASE_SYSTEM_PROMPT:'Task'}
});
await test('all AI workflow calls select explicit lazy mode and preserve result wrapper',async()=>{
 let got;const caller=new Workflow({executeAgent:async args=>{got=args;return {result:{response:'ok'}}}},
 {getExecutionContext:async()=>({authContext:base.authContext,isActingOnBehalfOfUser:false})},{},{findOne:async()=>agent});
 const out=await caller.execute({currentStepId:'s',steps:[{settings:{input:{agentId:'agent',prompt:'Task'}}}],context:{},runInfo:{workspaceId:'workspace'}});
 assert.equal(got.toolLoadingStrategy,'lazy-workflow-explicit');
 assert.equal(out.result.response,'ok');
});

const ModelConfig=moduleClass(PATCHES[4].patched,'AiModelConfigService',{
 '../constants/ai-sdk-package.const':{AI_SDK_ANTHROPIC:'@ai-sdk/anthropic',AI_SDK_BEDROCK:'@ai-sdk/amazon-bedrock'},
 '../../ai-agent/constants/agent-config.const':{AGENT_CONFIG:{REASONING_BUDGET_TOKENS:100}}
});
const modelConfig=new ModelConfig({},{});
const groqModel={sdkPackage:'@ai-sdk/openai-compatible',modelsDevName:'groq',providerName:'groq_canary',supportsReasoning:true,model:{provider:'groq.chat',modelId:'openai/gpt-oss-120b'}};
await test('Groq GPT-OSS uses SDK namespace instead of workspace provider key',async()=>{
 assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions(groqModel)),JSON.stringify({groq:{include_reasoning:false}}));
});
await test('Groq GPT-OSS 20B shares the compatible multi-round fix',async()=>{
 assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions({...groqModel,model:{...groqModel.model,modelId:'openai/gpt-oss-20b'}})),JSON.stringify({groq:{include_reasoning:false}}));
});
await test('unrelated compatible models and provider identities remain unchanged',async()=>{
 for(const m of [
 {...groqModel,modelsDevName:'other'},
 {...groqModel,model:{...groqModel.model,provider:'other.chat'}},
 {...groqModel,model:{...groqModel.model,modelId:'qwen/qwen3.8-27b'}},
 {...groqModel,sdkPackage:'@ai-sdk/openai'}
 ])assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions(m)),'{}');
});
await test('Anthropic existing reasoning options are preserved',async()=>{
 const o=modelConfig.getReasoningProviderOptions({sdkPackage:'@ai-sdk/anthropic',supportsReasoning:true});
 assert.equal(o.anthropic.thinking.budgetTokens,100);
});
await test('Bedrock existing reasoning options are preserved',async()=>{
 const o=modelConfig.getReasoningProviderOptions({sdkPackage:'@ai-sdk/amazon-bedrock',supportsReasoning:true});
 assert.equal(o.bedrock.thinking.budgetTokens,100);
});
await test('reasoning unsupported and unknown models preserve empty options',async()=>{
 for(const m of [{sdkPackage:'@ai-sdk/anthropic',supportsReasoning:false},{sdkPackage:'@ai-sdk/amazon-bedrock',supportsReasoning:false},{sdkPackage:'unknown'}])
 assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions(m)),'{}');
});


const previewFn=moduleClass(PATCHES[5].patched,'jsonPreview',{
 '@sniptt/guards':require('node:module').createRequire('/app/packages/twenty-server/dist/engine/core-modules/tool/utils/json-preview.util.js')('@sniptt/guards'),
 'twenty-shared/utils':{isDefined:x=>x!=null},
 './format-bytes.util':{formatBytes:x=>String(x)}
});
const knownDate=new Date('2026-09-05T03:00:00.000Z');
await test('top-level preview Date is ISO text',async()=>assert.equal(previewFn(knownDate),knownDate.toISOString()));
await test('nested record-array preview Date is ISO text',async()=>assert.equal(previewFn({records:[{startsAt:knownDate}]}).records[0].startsAt,knownDate.toISOString()));
await test('invalid preview Date matches JSON null semantics',async()=>assert.equal(previewFn(new Date('invalid')),null));
await test('preview scalar array and null behavior is retained',async()=>assert.equal(JSON.stringify(previewFn({values:[1,'text',null]})),JSON.stringify({values:[1,'text',null]})));
const spillSource=require('node:fs').readFileSync('/app/packages/twenty-server/dist/engine/core-modules/tool/services/tool-output-spill.service.js','utf8');
const Spill=moduleClass(spillSource,'ToolOutputSpillService',{
 'twenty-shared/types':{FileFolder:{AgentChat:'agent-chat'}},
 'twenty-shared/utils':{isDefined:x=>x!=null},
 'uuid':{v4:()=> 'test-spill-id'},
 'class-validator':{isObject:x=>x!==null&&typeof x==='object'},
 '../tools/output-navigation-tool/constants/max-inline-tool-output-bytes.constant':{MAX_INLINE_TOOL_OUTPUT_BYTES:256},
 '../tools/output-navigation-tool/constants/output-navigation-tool-names.constant':{OUTPUT_NAVIGATION_TOOL_NAMES:[]},
 '../utils/format-bytes.util':{formatBytes:x=>String(x)},
 '../utils/json-preview.util':{jsonPreview:previewFn}
});
let storedSpill;
const spill=new Spill({writeFile:async args=>{storedSpill=JSON.parse(args.sourceFile.toString());return{id:'test-spill-id'};}},{findWorkspaceTwentyStandardAndCustomApplicationOrThrow:async()=>({workspaceCustomFlatApplication:{universalIdentifier:'test-app'}})});
await test('oversized tool-output preview and stored JSON retain the same Date',async()=>{
 const output={success:true,records:[{startsAt:knownDate,content:'x'.repeat(1000)}]};
 const result=await spill.spillIfTooLarge(output,{workspaceId:'test-workspace'},{toolName:'find_records'});
 assert.equal(result.result.spilled,true);
 assert.equal(result.result.preview.records[0].startsAt,knownDate.toISOString());
 assert.equal(storedSpill.records[0].startsAt,knownDate.toISOString());
});
await test('small tool output retains its existing non-spilled contract',async()=>{
 const output={startsAt:knownDate};
 const result=await spill.spillIfTooLarge(output,{workspaceId:'test-workspace'},{toolName:'find_records'});
 assert.equal(result,output);
});


const {compileResponseSchema}=require('./schema-validation.cjs');
const exactSchema={type:'object',properties:{runStatus:{type:'string'},processed:{type:'number'}},required:['runStatus','processed'],additionalProperties:false};
await test('formatter receives exact schema even when provider only supports JSON mode',async()=>{
 calls.length=0;
 const schema={type:'object',properties:{id:{type:'string'},state:{type:'string'}},required:['id','state'],additionalProperties:false};
 await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema}}});
 assert(calls[1].system.includes(JSON.stringify(schema)));
 assert.equal(typeof calls[1].output.schema.validate,'function');
 assert.equal(calls[1].output.schema.validate({id:'op-1'}).success,false);
});
await test('invalid agent schema fails before any model or tool execution',async()=>{
 calls.length=0;
 await assert.rejects(executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:{type:'nonsense'}}}}));
 assert.equal(calls.length,0);
});
await test('wrong output keys cannot be marked successful even if provider or SDK skips validation',async()=>{
 calls.length=0;
 await assert.rejects(executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:exactSchema}}}),/violates its JSON schema/);
 assert.equal(calls.length,2);
});
await test('required fields, extra fields and types are enforced without coercion',async()=>{
 const v=compileResponseSchema(exactSchema);
 for(const input of [{},{analysis:'wrong'}, {runStatus:'PARTIAL',processed:'1'}, {runStatus:'PARTIAL',processed:1,other:true}]) assert.equal(v(input).success,false);
 const valid={runStatus:'PARTIAL',processed:1};
 assert.equal(v(valid).value,valid);
});
await test('nested arrays enums refs and constraints are validated',async()=>{
 const v=compileResponseSchema({type:'object',properties:{items:{type:'array',minItems:1,items:{$ref:'#/$defs/item'}}},required:['items'],additionalProperties:false,$defs:{item:{type:'object',properties:{status:{enum:['OK']},n:{type:'integer',minimum:1}},required:['status','n'],additionalProperties:false}}});
 assert.equal(v({items:[{status:'OK',n:1}]}).success,true);
 for(const input of [{items:[]},{items:[{status:'NO',n:1}]},{items:[{status:'OK',n:0}]},{items:[{status:'OK',n:1.5}]}])assert.equal(v(input).success,false);
});
await test('unknown validation keywords and unavailable external refs fail closed',async()=>{
 for(const schema of [{type:'object',requiredField:['id']},{$ref:'https://invalid.example/schema.json'},{type:'string',format:'unknown-format'}])assert.throws(()=>compileResponseSchema(schema));
});
await test('validation errors do not echo private response values',async()=>{
 const v=compileResponseSchema(exactSchema);
 const result=v({runStatus:123,processed:'private-secret-payload'});
 assert.equal(result.success,false);assert(!result.error.message.includes('private-secret-payload'));
});
await test('structured formatting preserves provider reasoning options',async()=>{
 const prior=overrides['../../ai-chat/utils/provider-options.util'].getCallLevelProviderOptions;
 overrides['../../ai-chat/utils/provider-options.util'].getCallLevelProviderOptions=x=>x.providerOptions;
 executor.aiModelConfigService.getReasoningProviderOptions=()=>({groq:{include_reasoning:false}});
 calls.length=0;
 await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:{type:'object'}}}});
 assert.equal(JSON.stringify(calls[1].providerOptions),JSON.stringify({groq:{include_reasoning:false}}));
 overrides['../../ai-chat/utils/provider-options.util'].getCallLevelProviderOptions=prior;
});


await test('all ten current structured agent schema shapes compile and reject the observed wrong envelope',async()=>{
 const schemas=[{"type":"object","required":["result","opportunityId","emailAiState","sourceMessageId","sourceActivityId","personId","companyId","artifactIds","draftIds","nextAction","reason","readback"],"properties":{"reason":{"type":"string"},"result":{"type":"string"},"draftIds":{"type":"string"},"personId":{"type":"string"},"readback":{"type":"string"},"companyId":{"type":"string"},"nextAction":{"type":"string"},"artifactIds":{"type":"string"},"emailAiState":{"type":"string"},"opportunityId":{"type":"string"},"sourceMessageId":{"type":"string"},"sourceActivityId":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["ready","recipient","subject","body","reason"],"properties":{"body":{"type":"string"},"ready":{"type":"boolean"},"reason":{"type":"string"},"subject":{"type":"string"},"recipient":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["reconciliationStatus","personId","companyId","opportunityId","externalActivityId","opportunityMutation","queueState","crmReadback"],"properties":{"personId":{"type":"string"},"companyId":{"type":"string"},"queueState":{"type":"string"},"crmReadback":{"type":"string"},"opportunityId":{"type":"string"},"externalActivityId":{"type":"string"},"opportunityMutation":{"type":"string"},"reconciliationStatus":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["runStatus","evaluated","createdIds","updatedIds","skippedIds","reasons"],"properties":{"reasons":{"type":"string"},"evaluated":{"type":"number"},"runStatus":{"type":"string"},"createdIds":{"type":"string"},"skippedIds":{"type":"string"},"updatedIds":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["direction","senderReadiness","classification","ballInCourt","shouldDraft","recipient","linkedinKind","needsDocuments","personId","companyId","opportunityId","interactionId","opportunityMutation","idempotencyKey","confidence","reason","crmReadback"],"properties":{"reason":{"type":"string"},"personId":{"type":"string"},"companyId":{"type":"string"},"direction":{"type":"string"},"recipient":{"type":"string"},"confidence":{"type":"string"},"ballInCourt":{"type":"string"},"crmReadback":{"type":"string"},"shouldDraft":{"type":"boolean"},"linkedinKind":{"type":"string"},"interactionId":{"type":"string"},"opportunityId":{"type":"string"},"classification":{"type":"string"},"idempotencyKey":{"type":"string"},"needsDocuments":{"type":"boolean"},"senderReadiness":{"type":"string"},"opportunityMutation":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["content","emailSubject","emailBody","sourceObjectType","sourceRecordId"],"properties":{"content":{"type":"string"},"emailBody":{"type":"string"},"emailSubject":{"type":"string"},"sourceRecordId":{"type":"string"},"sourceObjectType":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["content","emailSubject","emailBody","sourceObjectType","sourceRecordId"],"properties":{"content":{"type":"string"},"emailBody":{"type":"string"},"emailSubject":{"type":"string"},"sourceRecordId":{"type":"string"},"sourceObjectType":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["content","emailSubject","emailBody","sourceObjectType","sourceRecordId"],"properties":{"content":{"type":"string"},"emailBody":{"type":"string"},"emailSubject":{"type":"string"},"sourceRecordId":{"type":"string"},"sourceObjectType":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["content","emailSubject","emailBody","sourceObjectType","sourceRecordId"],"properties":{"content":{"type":"string"},"emailBody":{"type":"string"},"emailSubject":{"type":"string"},"sourceRecordId":{"type":"string"},"sourceObjectType":{"type":"string"}},"additionalProperties":false},{"type":"object","required":["runStatus","processed","changedIds","unchangedIds","blockedIds","reasons"],"properties":{"reasons":{"type":"string"},"processed":{"type":"number"},"runStatus":{"type":"string"},"blockedIds":{"type":"string"},"changedIds":{"type":"string"},"unchangedIds":{"type":"string"}},"additionalProperties":false}];
 for(const schema of schemas){
  const validate=compileResponseSchema(schema);
  const valid=Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,v.type==='string'?'':v.type==='number'?0:false]));
  assert.equal(validate(valid).success,true);
  assert.equal(validate({analysis:'wrong',key_points:[],data_extracted:{}}).success,false);
 }
});
await test('nested provider failures retain status and safe codes without response body contents',async()=>{
 const {describeExecutionError}=require('./schema-validation.cjs');
 const e=new Error('Provider returned error');
 e.lastError={statusCode:429,responseBody:JSON.stringify({error:{code:429,type:'rate_limit_error',metadata:{provider_name:'Example',raw:'private payload'}}})};
 const result=describeExecutionError(e);
 assert(result.includes('HTTP 429'));assert(result.includes('code=429'));assert(!result.includes('private payload'));
});
await test('diagnostic traversal is bounded and accepts non-JSON error bodies',async()=>{
 const {describeExecutionError}=require('./schema-validation.cjs');
 const e=new Error('Upstream failed');e.cause=e;e.statusCode=503;e.responseBody='private unparseable body';
 assert.equal(describeExecutionError(e),'Upstream failed [HTTP 503]');
});


await test('schema is supplied to the original task execution, not only the formatter',async()=>{
 calls.length=0;
 const schema={type:'object',properties:{id:{type:'string'},state:{type:'string'}},required:['id','state'],additionalProperties:false};
 await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema}}});
 assert(calls[0].system.includes(JSON.stringify(schema)));
 assert(calls[0].output, 'Primary call must request native structured output');
 assert.equal(typeof calls[0].output.schema.validate,'function');
});
await test('valid task JSON bypasses the lossy second model call',async()=>{
 const prior=mockAi.generateText;
 const exact={runStatus:'PARTIAL',processed:1};
 mockAi.generateText=async args=>{calls.push(args);return {text:JSON.stringify(exact),usage,steps:[]}};
 try{
  calls.length=0;
  const out=await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:exactSchema}}});
  assert.equal(JSON.stringify(out.result),JSON.stringify(exact));assert.equal(calls.length,1);assert.equal(calls[0].maxOutputTokens,4096);
 }finally{mockAi.generateText=prior;}
});
await test('invalid task JSON fails before a formatter can invent missing fields',async()=>{
 const prior=mockAi.generateText;
 mockAi.generateText=async args=>{calls.push(args);return {text:'{"runStatus":"PARTIAL"}',usage,steps:[]}};
 try{
  calls.length=0;
  await assert.rejects(executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:exactSchema}}}),/processed/);
  assert.equal(calls.length,1);
 }finally{mockAi.generateText=prior;}
});
await test('JSON parsing retains false zero empty strings and strict fenced values',async()=>{
 const {parseValidatedResponse}=require('./schema-validation.cjs');
 const validate=compileResponseSchema({type:'object',properties:{flag:{type:'boolean'},n:{type:'number'},s:{type:'string'}},required:['flag','n','s'],additionalProperties:false});
 for(const text of ['{"flag":false,"n":0,"s":""}','\x60\x60\x60json\n{"flag":false,"n":0,"s":""}\n\x60\x60\x60']){
  assert.equal(JSON.stringify(parseValidatedResponse(text,validate).value),'{"flag":false,"n":0,"s":""}');
 }
 assert.equal(parseValidatedResponse('Ordinary existing prose result',validate),undefined);
 for(const text of ['{"flag":', '{"flag":"false","n":0,"s":""}', '{"flag":false,"n":0,"s":"","extra":true}'])assert.throws(()=>parseValidatedResponse(text,validate));
});
await test('nested SDK schema error reports the missing field without private data',async()=>{
 const {describeExecutionError}=require('./schema-validation.cjs');
 const result=compileResponseSchema(exactSchema)({runStatus:'private-source-data'});
 const error=new Error('No object generated: response did not match schema.');error.cause=result.error;
 const message=describeExecutionError(error);
 assert(message.includes('processed'));assert(!message.includes('private-source-data'));
});


await test('paid OpenRouter GPT-OSS sets supported low reasoning effort',async()=>{
 const m={sdkPackage:'@ai-sdk/openai-compatible',model:{provider:'openrouter.chat',modelId:'openai/gpt-oss-20b'}};
 assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions(m)),JSON.stringify({openaiCompatible:{reasoningEffort:'low'},openrouter:{provider:{only:['CoreWeave','DeepInfra'],order:['CoreWeave','DeepInfra'],require_parameters:true,max_price:{prompt:0.05,completion:0.20}}}}));
 assert.equal(JSON.stringify(modelConfig.getReasoningProviderOptions({...m,model:{...m.model,modelId:'unrelated'}})),'{}');
});
await test('empty and output-budget-exhausted agent responses fail instead of false completion',async()=>{
 const prior=mockAi.generateText;
 try{
  for(const response of [{text:'',finishReason:'stop'},{text:' ',finishReason:'stop'},{text:'partial',finishReason:'length'}]){
   mockAi.generateText=async args=>({ ...response,usage,steps:[] });
   await assert.rejects(executor.executeAgent(execArgs),/no final response|output budget exhausted/);
  }
 }finally{mockAi.generateText=prior;}
});

await test('catalog lists exact authorized CRUD names without plural inference or invented writes',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('build-tool-catalog-section.util.js'));
 const build=moduleClass(p.patched,'buildToolCatalogSection',{
 'twenty-shared/ai':{ToolCategory:{DATABASE_CRUD:'record'}},
 'twenty-shared/utils':{assertUnreachable:()=>{throw Error('unknown');}},
 '../tools':{LEARN_TOOLS_TOOL_NAME:'learn_tools',EXECUTE_TOOL_TOOL_NAME:'execute_tool'}
 });
 const out=build([{name:'find_many_opportunities',objectName:'opportunity',operation:'find_many',category:'record'},{name:'find_one_opportunity',objectName:'opportunity',operation:'find_one',category:'record'}],[]);
 assert(out.includes('`find_many_opportunities`'));assert(out.includes('`find_one_opportunity`'));
 assert(!out.includes('`find_many_opportunity`'));assert(!out.includes('update'));assert(!out.includes('operation + object name'));
});
await test('workflow blocked business output is failed, not a green completed step',async()=>{
 for(const runStatus of ['BLOCKED','PARTIAL','NO_WORK']){
 const caller=new Workflow({executeAgent:async()=>({result:{runStatus,reasons:'Missing permitted query tool'}})},
 {getExecutionContext:async()=>({authContext:base.authContext,isActingOnBehalfOfUser:false})},{},{findOne:async()=>agent});
 const out=await caller.execute({currentStepId:'s',steps:[{settings:{input:{agentId:'agent',prompt:'Task'}}}],context:{},runInfo:{workspaceId:'workspace'}});
 if(runStatus==='BLOCKED'){assert(out.error.includes('Missing permitted query tool'));assert.equal(out.result,undefined);}
 else assert.equal(out.result.runStatus,runStatus);
 }
});
await test('structured output capability is enabled only for the verified OpenRouter endpoint',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('sdk-provider-factory.service.js'));
 const opts=[];
 const Factory=moduleClass(p.patched,'SdkProviderFactoryService',{
 '@ai-sdk/openai-compatible':{createOpenAICompatible:o=>{opts.push(o);return id=>({id});}},
 '../constants/ai-sdk-package.const':{AI_SDK_OPENAI_COMPATIBLE:'compatible'}
 });
 const f=new Factory();
 for(const baseUrl of ['https://openrouter.ai/api/v1','https://openrouter.ai/api/v1/','https://other.example/api/v1','https://openrouter.ai.evil.example/api/v1']){
 f.buildOpenAiCompatibleProvider({name:'compatible',baseUrl,apiKey:'test'});
 }
 assert.deepEqual(opts.map(x=>x.supportsStructuredOutputs),[true,true,false,false]);
});
await test('installed compatible SDK forwards the paid provider allowlist into the actual request',async()=>{
 const sdk=require('node:module').createRequire('/app/packages/twenty-server/dist/engine/metadata-modules/ai/ai-models/services/sdk-provider-factory.service.js')('@ai-sdk/openai-compatible');
 const model=sdk.createOpenAICompatible({name:'openrouter',baseURL:'https://openrouter.ai/api/v1',apiKey:'test',supportsStructuredOutputs:true})('openai/gpt-oss-20b');
 const options=modelConfig.getReasoningProviderOptions({sdkPackage:'@ai-sdk/openai-compatible',model});
 const req=await model.getArgs({prompt:[{role:'user',content:[{type:'text',text:'test'}]}],providerOptions:options,maxOutputTokens:512,responseFormat:{type:'json',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}});
 assert.equal(req.args.response_format.type,'json_schema');assert.equal(req.args.reasoning_effort,'low');
 assert.equal(JSON.stringify(req.args.provider.only),JSON.stringify(['CoreWeave','DeepInfra']));assert.equal(req.args.provider.require_parameters,true);assert.equal(req.args.provider.max_price.prompt,0.05);assert.equal(req.args.provider.max_price.completion,0.20);
 assert(!req.args.provider.only.includes('Darkbloom'));
});

await test('AI log sanitizer preserves nested Dates and still removes noisy keys',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('map-ai-steps-to-tool-call-logs.util.js'));
 const map=moduleClass(p.patched,'mapAiStepsToToolCallLogs',{'../../../../../utils/truncate-string-to-utf8-byte-budget.util':{truncateStringToUtf8ByteBudget:value=>({value,truncated:false})}});
 const stamp=new Date('2026-09-05T01:02:03.000Z');
 const out=map([{content:[{type:'tool-call',toolName:'read',toolCallId:'1',input:{}},{type:'tool-result',toolCallId:'1',output:{result:{records:[{lastReconciledAt:stamp,searchVector:'noise',nested:{receivedAt:stamp},empty:{}}]}}}]}]);
 const row=out[0].output.result.records[0];
 assert(row.lastReconciledAt instanceof Date);assert.equal(row.lastReconciledAt.toISOString(),stamp.toISOString());
 assert.equal(JSON.parse(JSON.stringify(row)).lastReconciledAt,stamp.toISOString());assert.equal(row.searchVector,undefined);assert.equal(Object.keys(row.empty).length,0);assert.equal(row.nested.receivedAt.toISOString(),stamp.toISOString());
});
function runHookFixture(){
 const p=PATCHES.find(x=>x.path.includes('useFindOneRecord-'));const body='const J='+p.patched.split(',J=')[1].split(';export')[0]+';J';
 let opts=null,data=null,index=0,refetches=0;const refs=[],effects=[];
 const client={refetchQueries:async arg=>{assert.equal(arg.include,'active');refetches++;}};
 const hook=vm.runInNewContext(body,{Promise,m:{useRef:value=>{const idx=index++;return refs[idx]??=( {current:value});},useMemo:fn=>fn(),useEffect:fn=>effects.push(fn)},i:()=>({objectMetadataItem:{id:'object'}}),v:()=>({recordGqlFields:{}}),q:()=>client,L:()=>({findOneRecordQuery:'query'}),G:()=>({canReadObjectRecords:true}),M:x=>x!=null,y:(q,o)=>{opts=o;return{data,loading:false,refetch:()=>{}};},h:({recordNode})=>recordNode});
 return {count:()=>refetches,render:(objectNameSingular,status,extra={})=>{index=0;data=status?{[objectNameSingular]:{id:extra.dataId||extra.objectRecordId||'run',status}}:null;hook({objectNameSingular,objectRecordId:'run',...extra});while(effects.length)effects.shift()();return opts;}};
}
await test('run panel uses current network data and bounded refresh only for workflow runs',async()=>{
 const f=runHookFixture(),o=f.render('workflowRun','RUNNING');assert.equal(o.fetchPolicy,'cache-and-network');assert.equal(o.pollInterval,3000);assert.equal(o.skipPollAttempt(),false);
});
await test('all native terminal statuses stop workflow refresh',async()=>{
 const f=runHookFixture();for(const state of ['COMPLETED','FAILED','STOPPED'])assert.equal(f.render('workflowRun',state).skipPollAttempt(),true);
});
await test('queued starting and stopping runs keep refreshing',async()=>{
 const f=runHookFixture();for(const state of ['NOT_STARTED','ENQUEUED','RUNNING','STOPPING'])assert.equal(f.render('workflowRun',state).skipPollAttempt(),false);
});
await test('other objects retain previous query behavior',async()=>{
 const f=runHookFixture(),o=f.render('opportunity','NEW');assert.equal(o.fetchPolicy,undefined);assert.equal(o.pollInterval,undefined);assert.equal(o.skipPollAttempt,undefined);
});
await test('missing IDs and explicit skips preserve native skip behavior',async()=>{
 const f=runHookFixture();assert.equal(f.render('workflowRun',null,{objectRecordId:''}).skip,true);assert.equal(f.render('workflowRun','RUNNING',{skip:true}).skip,true);
});


await test('terminal run refreshes active dashboard queries once',async()=>{
 const f=runHookFixture();f.render('workflowRun','RUNNING');assert.equal(f.count(),0);f.render('workflowRun','COMPLETED');assert.equal(f.count(),1);f.render('workflowRun','COMPLETED');assert.equal(f.count(),1);
});
await test('failed and stopped runs also refresh partial saved results',async()=>{
 for(const status of ['FAILED','STOPPED']){const f=runHookFixture();f.render('workflowRun',status);assert.equal(f.count(),1);f.render('workflowRun',status);assert.equal(f.count(),1);}
});
await test('new run gets its own single dashboard refresh',async()=>{
 const f=runHookFixture();f.render('workflowRun','COMPLETED');f.render('workflowRun','RUNNING',{objectRecordId:'second'});assert.equal(f.count(),1);f.render('workflowRun','COMPLETED',{objectRecordId:'second'});assert.equal(f.count(),2);
});
await test('skip and stale cached identity never trigger dashboard refresh',async()=>{
 const f=runHookFixture();f.render('workflowRun','COMPLETED',{skip:true});f.render('workflowRun','COMPLETED',{objectRecordId:''});f.render('workflowRun','COMPLETED',{dataId:'wrong'});f.render('opportunity','COMPLETED');assert.equal(f.count(),0);
});

for(const [suffix,className,guard]of [['logic-function/logic-function.workflow-action.js','LogicFunctionWorkflowAction','isWorkflowLogicFunctionAction'],['code/code.workflow-action.js','CodeWorkflowAction','isWorkflowCodeAction']]){
 await test(className+' uses source-aware executor exactly once with exact identity and payload',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith(suffix));let calls=0,logs=0;
 const Action=moduleClass(p.patched,className,{
 '/opt/workflow-lazy-tools/native-preparation.cjs':require('./native-preparation.cjs'),
 '@nestjs/common':{Injectable:()=>x=>x,Logger:class{warn(){}}},
 'twenty-shared/utils':{resolveInput:x=>x,isDefined:x=>x!=null},
 '../../utils/find-step-or-throw.util':{findStepOrThrow:({steps})=>steps[0]},
 [suffix.startsWith('code')?'./guards/is-workflow-code-action.guard':'./guards/is-workflow-logic-function-action.guard']:{[guard]:()=>true},
 '../../../../../engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util':{findFlatEntityByIdInFlatEntityMaps:()=>({workflowActionTriggerSettings:{}})},
 './utils/build-code-step-log.util':{buildCodeStepLog:x=>x}
 });
 const service={executeOneFromSource:async args=>{calls++;assert.equal(args.id,'exact');assert.equal(args.workspaceId,'workspace');assert.equal(args.payload.message,'test');return{data:{fresh:true}};}};
 const auxiliary={getOrRecomputeManyOrAllFlatEntityMaps:async()=>({flatLogicFunctionMaps:{}}),setStepLog:async()=>{logs++;}};
 const action=new Action(service,auxiliary),args={currentStepId:'step',steps:[{settings:{input:{logicFunctionId:'exact',logicFunctionInput:{message:'test'}}}}],context:{},runInfo:{workspaceId:'workspace',workflowRunId:'run'}};
 assert.equal((await action.execute(args)).result.fresh,true);assert.equal(calls,1);if(suffix.startsWith('code'))assert.equal(logs,1);
 service.executeOneFromSource=async()=>{throw Error('BUILD_FAILED');};
 await assert.rejects(action.execute(args),/BUILD_FAILED/);assert.equal(calls,1);
 });
}
await test('both workflow modules provide the existing source build service',async()=>{
 for(const suffix of ['logic-function/logic-function-action.module.js','code/code-action.module.js']){
  const p=PATCHES.find(x=>x.path.endsWith(suffix));assert(p.patched.includes('engine/metadata-modules/logic-function/logic-function.module'));
 }
});


await test('native parse recovery accepts only bounded schema-valid text and preserves tool history',async()=>{
 const {recoverStructuredParse}=require('./schema-validation.cjs'),validate=compileResponseSchema(exactSchema);
 const steps=[{toolCalls:[{toolName:'read'}]}],error={text:'\x60\x60\x60json\n{"runStatus":"PARTIAL","processed":1}\n\x60\x60\x60',finishReason:'stop',usage};
 const r=recoverStructuredParse(error,validate,true,steps);
 assert.equal(r.steps,steps);assert.equal(r.usage,usage);assert.equal(r.text,error.text);
 for(const e of [{...error,text:'{"runStatus":'}, {...error,text:'{"runStatus":"PARTIAL"}'}, {...error,text:'ordinary prose'}, {...error,text:' '.repeat(262145)}, {...error,finishReason:'length'}]) assert.throws(()=>recoverStructuredParse(e,validate,true),x=>x===e);
 assert.throws(()=>recoverStructuredParse(error,validate,false),x=>x===error);
 assert.throws(()=>recoverStructuredParse(error,undefined,true),x=>x===error);
});

await test('metadata execution uses authenticated user identity and ignores actor values in payload',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('logic-function.resolver.js'));
 let got;
 const Resolver=moduleClass(p.patched,'LogicFunctionResolver');
 const resolver=new Resolver({executeOneFromSource:async args=>{got=args;return {status:'SUCCESS'};}});
 const payload={userId:'spoof',userWorkspaceId:'spoof',workspaceMemberId:'spoof'};
 await resolver.executeOneLogicFunction({id:'function',payload},{id:'workspace'},{id:'verified-user'},'verified-membership');
 assert.equal(got.userId,'verified-user');assert.equal(got.userWorkspaceId,'verified-membership');assert.equal(got.payload,payload);
 await resolver.executeOneLogicFunction({id:'function',payload},{id:'workspace'});
 assert.equal(got.userId,undefined);assert.equal(got.userWorkspaceId,undefined);
});
await test('source-aware executor preserves verified identity and never takes identity from payload',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('logic-function-from-source.service.js'));
 let got;
 const Service=moduleClass(p.patched,'LogicFunctionFromSourceService',{
 '../logic-function.entity':{LogicFunctionExecutionMode:{LIVE:'LIVE'}}
 });
 const source=new Service({execute:async args=>{got=args;return {status:'SUCCESS'};}},{},{},{findLogicFunctionAndApplicationOrThrow:async()=>({flatLogicFunction:{isBuildUpToDate:true}})});
 const payload={userId:'spoof'};
 await source.executeOneFromSource({id:'function',workspaceId:'workspace',payload,userId:'verified-user',userWorkspaceId:'verified-membership'});
 assert.equal(got.userId,'verified-user');assert.equal(got.userWorkspaceId,'verified-membership');assert.equal(got.executionMode,'LIVE');
 await source.executeOneFromSource({id:'function',workspaceId:'workspace',payload});
 assert.equal(got.userId,undefined);assert.equal(got.userWorkspaceId,undefined);
});
await test('Gmail draft returns exact native IDs and independently fetched MIME with attachment hashes',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('gmail-message-outbound.service.js'));
 const Gmail=moduleClass(p.patched,'GmailMessageOutboundService',{'@sniptt/guards':{isNonEmptyString:x=>typeof x==='string'&&x.length>0},'node:crypto':require('node:crypto')});
 const service=new Gmail();let creates=0,gets=0,attachments=0;
 const nativeMessage={id:'m1',threadId:'t1',payload:{headers:[{name:'Subject',value:'Native subject'}],parts:[{filename:'CV.pdf',mimeType:'application/pdf',body:{attachmentId:'a1'}}]}};
 const client={users:{threads:{get:async()=>({data:{id:'t1',messages:[nativeMessage]}})},drafts:{create:async()=>{creates++;return {data:{id:'d1',message:{id:'m1',threadId:'t1'}}};},get:async args=>{gets++;assert.equal(args.id,'d1');assert.equal(args.format,'full');return {data:{id:'d1',message:nativeMessage}};}},messages:{attachments:{get:async args=>{attachments++;assert.equal(args.messageId,'m1');assert.equal(args.id,'a1');return {data:{data:Buffer.from('exact bytes').toString('base64url')}};}}}}};
 service.composeGmailMessage=async()=>({gmailClient:client,encodedMessage:'encoded'});
 const out=await service.createDraft({},{});
 assert.equal(creates,1);assert.equal(gets,1);assert.equal(attachments,1);assert.equal(out.readBackConfirmed,true);assert.equal(out.nativeMessage,nativeMessage);
 assert.equal(out.attachmentManifest[0].sha256,require('node:crypto').createHash('sha256').update('exact bytes').digest('hex'));
 assert.equal(out.attachmentManifest[0].size,11);
});
await test('Gmail read-back failure preserves created draft ID and never repeats creation',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('gmail-message-outbound.service.js'));
 const Gmail=moduleClass(p.patched,'GmailMessageOutboundService',{'@sniptt/guards':{isNonEmptyString:()=>false}});
 for(const get of [async()=>{throw Error('provider timeout');},async()=>({data:{id:'wrong',message:{id:'m1'}}})]){
  let count=0;const service=new Gmail();
  service.composeGmailMessage=async()=>({encodedMessage:'encoded',gmailClient:{users:{drafts:{create:async()=>{count++;return {data:{id:'d1',message:{id:'m1'}}};},get}}}});
  const out=await service.createDraft({},{});assert.equal(count,1);assert.equal(out.draftId,'d1');assert.equal(out.messageId,'m1');assert.equal(out.readBackConfirmed,false);assert(out.error);
 }
});
await test('draft email tool exposes provider evidence separately from input echoes',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('/draft-email-tool.js'));
 const Draft=moduleClass(p.patched,'DraftEmailTool',{'./email-tool.schema':{EmailToolInputZodSchema:{extend:()=>({})}},'./utils/get-missing-draft-email-scopes.util':{getMissingDraftEmailScopes:()=>[]}});
 const nativeDraft={draftId:'d1',messageId:'m1',readBackConfirmed:true};
 const data={connectedAccount:{id:'account'},recipients:{to:['to@example.com'],cc:[],bcc:[]},attachments:[],sanitizedSubject:'subject',sanitizedHtmlBody:'body',plainTextBody:'body'};
 const tool=new Draft({composeEmail:async()=>({success:true,data})},{createDraft:async()=>nativeDraft});
 const out=await tool.execute({},{});assert.equal(out.success,true);assert.equal(out.result.nativeDraft,nativeDraft);assert.equal(out.result.attachmentCount,0);
});
await test('native email tool preserves Sent proof independently from echoed input and CRM persistence',async()=>{
 const p=PATCHES.find(x=>x.path.endsWith('/send-email-tool.js'));
 const Send=moduleClass(p.patched,'SendEmailTool',{'./email-tool.schema':{EmailToolInputZodSchema:{extend:()=>({})}}});
 const nativeSent={provider:'GOOGLE',messageId:'native-sent',readBackConfirmed:false,error:'read timeout'};
 const data={connectedAccount:{id:'account',provider:'GOOGLE'},recipients:{to:['to@example.com'],cc:[],bcc:[]},attachments:[],sanitizedSubject:'subject',sanitizedHtmlBody:'body',plainTextBody:'body',shouldPersistMessage:true};
 let sends=0;
 const tool=new Send({composeEmail:async()=>({success:true,data})},{sendComposedEmail:async()=>{sends++;return {messageExternalId:'native-sent',nativeSent};},persistSentMessage:async()=>undefined});
 const out=await tool.execute({providerDraftId:'d1'},{workspaceId:'workspace'});
 assert.equal(sends,1);assert.equal(out.success,true);assert.equal(out.result.nativeSent,nativeSent);assert.equal(out.result.messageExternalId,'native-sent');assert.equal(out.result.messageId,undefined);
});
function draftFixture(){
 const p=PATCHES.find(x=>x.path.endsWith('gmail-message-outbound.service.js'));
 const calls=[];let edited=false,missing=false,sentMode='valid',contextMessages=[];
 const message={id:'m1',threadId:'t1',payload:{headers:[],body:{data:''}}};
 const parsed={from:{address:'me@example.com'},to:[{address:'to@example.com'}],cc:[],bcc:[],subject:'subject',text:'body',html:'<p>body</p>',messageId:'<message>',attachments:[]};
 const client={users:{threads:{get:async()=>{calls.push(['thread-read']);return {data:{id:'t1',messages:[message,...contextMessages]}};}},drafts:{
 get:async args=>{calls.push(['get',args]);if(missing)throw Error('404');return {data:{id:args.id,message:args.format==='raw'?{...message,raw:Buffer.from('raw').toString('base64url')}:message}};},
 create:async args=>{calls.push(['create',args]);throw Error('CREATE must not run');},
 update:async args=>{calls.push(['update',args]);return {data:{id:args.id,message}};},
 send:async args=>{calls.push(['send',args]);return {data:{id:'sent-id',threadId:'t1'}};}
 },messages:{get:async args=>{calls.push(['sent-read',args]);if(sentMode==='timeout')throw Error('read timeout');return {data:{...message,id:sentMode==='identity'?'other':'sent-id',labelIds:sentMode==='label'?[]:['SENT'],payload:{headers:[],parts:[{filename:'proof.pdf',mimeType:'application/pdf',body:{attachmentId:'a1'}}]}}};},attachments:{get:async args=>{calls.push(['sent-attachment',args]);return {data:sentMode==='bytes'?{}:{data:Buffer.from('sent bytes').toString('base64url')}};}}}}};
 const Gmail=moduleClass(p.patched,'GmailMessageOutboundService',{'googleapis':{google:{gmail:()=>client}},'@sniptt/guards':{isNonEmptyString:x=>!!x},'postal-mime':{parse:async()=>({...parsed,subject:edited?'edited':parsed.subject})},'node:crypto':require('node:crypto')});
 const service=new Gmail();service.googleOAuth2ClientProvider={getClient:async()=>({})};service.composeGmailMessage=async()=>({gmailClient:client,encodedMessage:'reviewed'});
 const input={providerDraftId:'d1',approvedThreadContextFingerprint:require('node:crypto').createHash('sha256').update('[]').digest('hex'),to:['to@example.com'],cc:[],bcc:[],subject:'subject',body:'body',html:'<p>body</p>',threadExternalId:'t1',attachments:[]};
 return {service,calls,input,account:{id:'account',handle:'me@example.com'},edit:()=>{edited=true;},missing:()=>{missing=true;},sentMode:mode=>{sentMode=mode;},context:messages=>{contextMessages=messages;}};
}
await test('READ performs no provider writes and returns exact provider evidence',async()=>{
 const f=draftFixture();const out=await f.service.createDraft({draftOperation:'READ',draftId:'d1'},f.account);
 assert.equal(out.readBackConfirmed,true);assert.equal(out.draftId,'d1');assert.deepEqual(f.calls.map(x=>x[0]),['get','thread-read']);
});
await test('UPSERT updates exact draft ID and performs no create',async()=>{
 const f=draftFixture();const out=await f.service.createDraft({draftOperation:'UPSERT',draftId:'d1'},f.account);
 assert.equal(out.readBackConfirmed,true);assert.equal(out.draftId,'d1');assert.deepEqual(f.calls.map(x=>x[0]),['get','update','get','thread-read']);
 assert.equal(f.calls[1][1].id,'d1');assert.equal(f.calls[1][1].requestBody.id,'d1');
});
await test('unknown draft cannot fall back to create or new send',async()=>{
 for(const operation of ['READ','UPSERT','SEND']){
  const f=draftFixture();f.missing();
  if(operation==='READ'){const out=await f.service.createDraft({draftOperation:operation,draftId:'missing'},f.account);assert.equal(out.readBackConfirmed,false);}
  else if(operation==='UPSERT') await assert.rejects(f.service.createDraft({draftOperation:operation,draftId:'missing'},f.account),/404/);
  else await assert.rejects(f.service.sendMessage(f.input,f.account),/404/);
  assert.deepEqual(f.calls.map(x=>x[0]),['get']);
 }
});
await test('exact reviewed draft is consumed once and preserves native sent receipt',async()=>{
 const f=draftFixture();const out=await f.service.sendMessage(f.input,f.account);
 assert.deepEqual(f.calls.map(x=>x[0]),['get','thread-read','send','sent-read','sent-attachment']);assert.equal(f.calls[2][1].requestBody.id,'d1');
 assert.equal(out.messageExternalId,'sent-id');assert.equal(out.threadExternalId,'t1');assert.equal(out.headerMessageId,'<message>');
});
await test('Sent proof uses independently fetched MIME, SENT label and downloaded attachment bytes',async()=>{
 const f=draftFixture();const out=await f.service.sendMessage(f.input,f.account);
 assert.equal(out.nativeSent.readBackConfirmed,true);assert.equal(out.nativeSent.messageId,'sent-id');
 assert.equal(out.nativeSent.nativeMessage.labelIds[0],'SENT');
 assert.equal(out.nativeSent.attachmentManifest[0].sha256,require('node:crypto').createHash('sha256').update('sent bytes').digest('hex'));
 assert.equal(f.calls[3][1].id,'sent-id');assert.equal(f.calls[3][1].format,'full');
 assert.equal(f.calls[4][1].messageId,'sent-id');assert.equal(f.calls[4][1].id,'a1');
});
await test('Sent read-back timeout, identity, label and missing bytes never repeat the successful send',async()=>{
 for(const mode of ['timeout','identity','label','bytes']){
  const f=draftFixture();f.sentMode(mode);const out=await f.service.sendMessage(f.input,f.account);
  assert.equal(out.nativeSent.readBackConfirmed,false);assert.equal(out.nativeSent.messageId,'sent-id');
  assert.equal(out.messageExternalId,'sent-id');assert(out.nativeSent.error);assert.equal(f.calls.filter(x=>x[0]==='send').length,1);
 }
});
await test('missing send receipt fails proof without inventing a Sent ID or retrying',async()=>{
 const f=draftFixture();const out=await f.service.readSentEvidence({},undefined,undefined);
 assert.equal(out.readBackConfirmed,false);assert.equal(out.messageId,null);assert(out.error);assert.equal(f.calls.length,0);
});
await test('new native reply or Sent activity blocks dispatch even before CRM sync',async()=>{
 for(const labelIds of [['INBOX'],['SENT'],['DRAFT']]){
  const f=draftFixture();f.context([{id:'new-message',threadId:'t1',internalDate:'123',labelIds,payload:{headers:[],body:{data:'new'}}}]);
  await assert.rejects(f.service.sendMessage(f.input,f.account),/thread changed since approval/);
  assert.equal(f.calls.filter(x=>x[0]==='send').length,0);
 }
});
await test('absent approved thread fingerprint blocks exact draft send',async()=>{
 const f=draftFixture();delete f.input.approvedThreadContextFingerprint;
 await assert.rejects(f.service.sendMessage(f.input,f.account),/fingerprint required/);assert.equal(f.calls.filter(x=>x[0]==='send').length,0);
});
await test('thread fingerprint ignores ephemeral labels and catches body changes',async()=>{
 const f=draftFixture();const source={id:'prior',threadId:'t1',internalDate:'1',payload:{headers:[{name:'Subject',value:'Original'}],body:{data:'original'}}};
 f.context([{...source,labelIds:['INBOX']}]);const first=await f.service.createDraft({draftOperation:'READ',draftId:'d1'},f.account);
 assert.equal(first.readBackConfirmed,true);assert(first.threadContextFingerprint);
 f.context([{...source,labelIds:['UNREAD','INBOX']}]);const second=await f.service.createDraft({draftOperation:'READ',draftId:'d1'},f.account);
 assert.equal(first.threadContextFingerprint,second.threadContextFingerprint);
 f.context([{...source,payload:{...source.payload,body:{data:'changed'}}}]);const third=await f.service.createDraft({draftOperation:'READ',draftId:'d1'},f.account);
 assert.notEqual(first.threadContextFingerprint,third.threadContextFingerprint);
});
await test('provider edit after approval blocks exact draft send before mutation',async()=>{
 const f=draftFixture();f.edit();await assert.rejects(f.service.sendMessage(f.input,f.account),/differs from the reviewed/);
 assert.deepEqual(f.calls.map(x=>x[0]),['get']);
});
await test('draft-only native action input extension preserves send schema separation',async()=>{
 const patch=PATCHES.find(x=>x.path.endsWith('workflow.cjs'));
 const nativeRequire=require('node:module').createRequire('/app/packages/twenty-shared/dist/workflow.cjs');
 const exports={};vm.runInNewContext(patch.patched,{exports,require:nativeRequire,Symbol,Set,Map,Object,Array,RegExp,String,Number,JSON},{timeout:3000});
 const draft=exports.workflowDraftEmailActionSchema.shape.settings.shape.input;
 const send=exports.workflowSendEmailActionSchema.shape.settings.shape.input;
 const input={connectedAccountId:'account',recipients:{to:'to@example.com'},draftId:'d1',draftOperation:'READ',providerDraftId:'d1'};
 const d=draft.parse(input),e=send.parse(input);
 assert.equal(d.draftId,'d1');assert.equal(d.draftOperation,'READ');assert.equal(d.providerDraftId,undefined);
 assert.equal(e.providerDraftId,'d1');assert.equal(e.draftId,undefined);assert.equal(e.draftOperation,undefined);
});
await test('installed MIME parser verifies actual compiled Unicode draft and rejects changed attachment bytes',async()=>{
 const runtimeRequire=require('node:module').createRequire('/app/packages/twenty-server/package.json');
 const MailComposer=runtimeRequire('nodemailer/lib/mail-composer');
 const p=PATCHES.find(x=>x.path.endsWith('gmail-message-outbound.service.js'));
 const input={providerDraftId:'d1',approvedThreadContextFingerprint:require('node:crypto').createHash('sha256').update('[]').digest('hex'),to:['to@example.com'],cc:[],bcc:[],subject:'Revisión exacta',body:'Texto íntegro',html:'<p>Texto íntegro</p>',attachments:[{filename:'CV.pdf',contentType:'application/pdf',content:Buffer.from('original PDF bytes')}]};
 const raw=await new MailComposer({from:'me@example.com',to:input.to,subject:input.subject,text:input.body,html:input.html,attachments:input.attachments}).compile().build();
 let sends=0;
 const client={users:{threads:{get:async()=>({data:{id:'t1',messages:[]}})},drafts:{get:async()=>({data:{id:'d1',message:{id:'m1',threadId:'t1',raw:raw.toString('base64url')}}}),send:async()=>{sends++;return {data:{id:'sent'}};}}}};
 const Gmail=moduleClass(p.patched,'GmailMessageOutboundService',{'googleapis':{google:{gmail:()=>client}},'postal-mime':runtimeRequire('postal-mime'),'node:crypto':require('node:crypto')});
 const service=new Gmail();service.googleOAuth2ClientProvider={getClient:async()=>({})};
 const out=await service.sendMessage(input,{id:'account',handle:'me@example.com'});assert.equal(sends,1);assert.equal(out.messageExternalId,'sent');
 await assert.rejects(service.sendMessage({...input,attachments:[{...input.attachments[0],content:Buffer.from('changed PDF bytes')}]},{id:'account',handle:'me@example.com'}),/differs from the reviewed/);
 assert.equal(sends,1);
});
await test('native app tool uses source-aware execution instead of stale built code',async()=>{
 const patch=PATCHES.find(p=>p.path.endsWith('tool-executor.service.js'));
 const ToolExecutor=moduleClass(patch.patched,'ToolExecutorService');
 const service=Object.create(ToolExecutor.prototype);let input;
 service.logicFunctionExecutorService={executeOneFromSource:async value=>{input=value;return {data:{sourceRevision:'new'},status:'SUCCESS'}}};
 const result=await service.dispatchLogicFunction({logicFunctionId:'exact-function'},{mode:'READ_CASE',opportunityId:'case'},{workspaceId:'workspace'});
 assert.equal(input.id,'exact-function');assert.equal(input.workspaceId,'workspace');assert.equal(input.payload.opportunityId,'case');assert.equal(result.result.sourceRevision,'new');
});
console.log(JSON.stringify({status:'PASS',tests:results.length,results,scope:'isolated VM tests of exact candidate source; no provider AI call or live mutation'}));

})().catch(error=>{console.error(error);process.exitCode=1;});
