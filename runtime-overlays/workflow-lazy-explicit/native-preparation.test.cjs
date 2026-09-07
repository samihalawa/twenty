'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {enqueueVerifiedPreparation}=require('./native-preparation.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const guard='17f12dc7-d373-4a09-8ff9-32215dfce8c0',verifier='ec6e9a81-3dfb-48f9-bd59-184bfcca125a',create='4644044c-8119-4a9f-aca6-8f72177169e2';
function fixture(){
 const request={opportunityId:id(3),kind:'DOCUMENT',sourceFingerprint:'full',providerSourceFingerprint:'provider',upstreamWorkflowRunId:id(1)};
 const parent={id:id(1),workflowId:'58192e32-e898-45ac-9d64-2e8aa95b2b52',state:{flow:{steps:[{id:id(4),settings:{input:{logicFunctionId:verifier}}},{id:id(5),settings:{input:{logicFunctionId:guard}}}]},stepInfos:{[id(4)]:{status:'SUCCESS',result:{executionVerified:true,preparationRequests:[request]}}}}};
 const payload={id:id(3),opportunityId:id(3),workflowRunId:id(2),preparationRequest:request,upstreamVerifierStepId:id(4)};
 let created=null,calls=0;
 const runner={workflowRunWorkspaceService:{getWorkflowRunOrFail:async x=>x.workflowRunId===parent.id?parent:created,getWorkflowRun:async()=>created},workflowCommonWorkspaceService:{getWorkflowVersionOrFail:async()=>({workflowId:create,status:'ACTIVE'})},run:async x=>{calls++;assert.equal(x.source.source,'WORKFLOW');assert.equal(x.source.workspaceMemberId,null);created={id:x.workflowRunId,workflowVersionId:x.workflowVersionId,workflowId:create,status:'ENQUEUED',state:{stepInfos:{trigger:{result:x.payload}}}};return {workflowRunId:x.workflowRunId};},resume:async()=>{}};
 const args={input:{logicFunctionId:guard,logicFunctionInput:{mode:'AUTO_PREPARE',upstreamWorkflowRunId:parent.id,upstreamVerifierStepId:id(4)}},data:{nativePreparationEnqueues:[{workflowVersionId:id(6),workflowRunId:id(2),payload}]},runInfo:{workspaceId:id(7),workflowRunId:parent.id},currentStepId:id(5),getRunner:()=>runner};
 return {args,parent,runner,calls:()=>calls};
}
test('other function modes have no workflow-run authority',async()=>{const data={nativePreparationEnqueues:[{}]};assert.equal(await enqueueVerifiedPreparation({input:{logicFunctionId:guard,logicFunctionInput:{mode:'PREVIEW'}},data}),data);});
test('native preparation queues only verified existing create workflow and reads same run back',async()=>{const f=fixture(),out=await enqueueVerifiedPreparation(f.args);assert.equal(out.nativePreparationReceipts[0].nativeReadBackConfirmed,true);assert.equal(f.calls(),1);await enqueueVerifiedPreparation(f.args);assert.equal(f.calls(),1);});
test('wrong parent, verifier state, source or target fails before queue mutation',async()=>{
 for(const change of [f=>f.parent.workflowId=id(99),f=>f.parent.state.stepInfos[id(4)].status='FAILED',f=>f.args.data.nativePreparationEnqueues[0].payload.preparationRequest={...f.args.data.nativePreparationEnqueues[0].payload.preparationRequest,sourceFingerprint:'forged'},f=>f.runner.workflowCommonWorkspaceService.getWorkflowVersionOrFail=async()=>({workflowId:id(99),status:'ACTIVE'})]){const f=fixture();change(f);await assert.rejects(enqueueVerifiedPreparation(f.args),/NATIVE_PREPARATION/);assert.equal(f.calls(),0);}
});
test('a cross-run invocation cannot use a verified request from another parent',async()=>{const f=fixture();f.args.runInfo.workflowRunId=id(99);await assert.rejects(enqueueVerifiedPreparation(f.args),/PARENT_BINDING/);assert.equal(f.calls(),0);});

test('native failed-step retry preserves exact original payload and run id',async()=>{
 const f=fixture();await enqueueVerifiedPreparation(f.args);const saved=await f.runner.workflowRunWorkspaceService.getWorkflowRun({});saved.status='FAILED';
 f.args.data.nativePreparationEnqueues[0].operation='RETRY';let retried=0;
 f.runner.retryWorkflowRun=async(workspaceId,runId)=>{assert.equal(runId,saved.id);retried++;saved.status='RUNNING';};
 await enqueueVerifiedPreparation(f.args);assert.equal(retried,1);assert.equal(f.calls(),1);
 f.args.data.nativePreparationEnqueues[0].workflowVersionId=id(99);await assert.rejects(enqueueVerifiedPreparation(f.args),/RETRY_VERSION_MISMATCH/);
});
