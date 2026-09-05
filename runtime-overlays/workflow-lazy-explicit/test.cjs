'use strict';
(async()=>{
const PATCHES=require('./patch.cjs').preparePatches();

const vm=require('node:vm'),assert=require('node:assert/strict');
const fallback=new Proxy({}, {get:()=>function(){return ()=>undefined}});
const decorators={Injectable:()=>()=>{},Inject:()=>()=>{},Logger:class{log(){} warn(){} error(){}}};
function moduleClass(source,name,overrides={}){
 const exports={};
 vm.runInNewContext(source,{exports,require:(key)=>key==='@nestjs/common'?decorators:overrides[key]??fallback,Set,Map,Date,String,Object,Math,Error},{timeout:2000});
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
 jsonSchema:x=>x,Output:{object:x=>x},stepCountIs:()=>()=>false,
 generateText:async args=>{calls.push(args);return args.output?{output:{id:'op-1',state:'unchanged'},usage,steps:[]}:{text:'Verified op-1',usage,steps:[]}}
};
const overrides={
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
 {resolveModelForAgent:async()=>({modelId:'model',model:{},sdkPackage:'mock'}),validateModelAvailability(){}},
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
});
await test('workflow lazy retains second structured-output call',async()=>{
 calls.length=0;
 const out=await executor.executeAgent({...execArgs,agent:{...agent,responseFormat:{type:'json',schema:{type:'object'}}},toolLoadingStrategy:'lazy-workflow-explicit'});
 assert.equal(out.result.id,'op-1');
 assert.equal(calls.length,2);
 assert(calls[1].output);
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

console.log(JSON.stringify({status:'PASS',tests:results.length,results,scope:'isolated VM tests of exact candidate source; no provider AI call or live mutation'}));

})().catch(error=>{console.error(error);process.exitCode=1;});
