'use strict';
const {isDeepStrictEqual}=require('node:util');
const guardId='17f12dc7-d373-4a09-8ff9-32215dfce8c0';
const createWorkflowId='4644044c-8119-4a9f-aca6-8f72177169e2';
const parents=new Set(['3f959ea3-1718-4292-bffe-25da2c561995','58192e32-e898-45ac-9d64-2e8aa95b2b52','3c012edc-6aeb-48cc-8713-56cadd751d66','fac3399c-888b-4af5-a04e-0be1fac8a78b']);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// This is an internal workflow continuation, never an agent tool or public API.
async function enqueueVerifiedPreparation({input,data,runInfo,currentStepId,getRunner}) {
  if(input.logicFunctionId!==guardId||input.logicFunctionInput?.mode!=='AUTO_PREPARE')return data;
  const binding=input.logicFunctionInput;
  if(!uuid(runInfo.workflowRunId)||binding.upstreamWorkflowRunId!==runInfo.workflowRunId||!uuid(binding.upstreamVerifierStepId))throw Error('NATIVE_PREPARATION_PARENT_BINDING_REQUIRED');
  const entries=data?.nativePreparationEnqueues;
  if(!Array.isArray(entries)||entries.length>5)throw Error('NATIVE_PREPARATION_REQUESTS_INVALID');
  const runner=getRunner(),parent=await runner.workflowRunWorkspaceService.getWorkflowRunOrFail({workspaceId:runInfo.workspaceId,workflowRunId:runInfo.workflowRunId});
  const verifier=parent.state?.stepInfos?.[binding.upstreamVerifierStepId];
  const verifierStep=parent.state?.flow?.steps?.find(s=>s.id===binding.upstreamVerifierStepId);
  const currentStep=parent.state?.flow?.steps?.find(s=>s.id===currentStepId);
  if(!parents.has(parent.workflowId)||verifier?.status!=='SUCCESS'||verifier?.result?.executionVerified!==true||verifierStep?.settings?.input?.logicFunctionId!=='ec6e9a81-3dfb-48f9-bd59-184bfcca125a'||currentStep?.settings?.input?.logicFunctionId!==guardId)throw Error('NATIVE_PREPARATION_VERIFIER_BINDING_REQUIRED');
  const receipts=[];
  for(const entry of entries){
    const p=entry?.payload,request=p?.preparationRequest,retry=entry.operation==='RETRY';
    if(entry.operation!==undefined&&!['CREATE','RETRY'].includes(entry.operation))throw Error('NATIVE_PREPARATION_OPERATION_INVALID');
    if(!uuid(entry?.workflowVersionId)||!uuid(entry?.workflowRunId)||!uuid(p?.opportunityId)||p.id!==p.opportunityId||p.workflowRunId!==entry.workflowRunId||(!retry&&(request?.upstreamWorkflowRunId!==parent.id||p.upstreamVerifierStepId!==binding.upstreamVerifierStepId)))throw Error('NATIVE_PREPARATION_PAYLOAD_INVALID');
    if(!verifier.result.preparationRequests?.some(r=>r.opportunityId===p.opportunityId&&r.kind===request.kind&&r.providerSourceFingerprint===request.providerSourceFingerprint&&(retry||r.sourceFingerprint===request.sourceFingerprint)))throw Error('NATIVE_PREPARATION_REQUEST_NOT_VERIFIED');
    const version=await runner.workflowCommonWorkspaceService.getWorkflowVersionOrFail({workspaceId:runInfo.workspaceId,workflowVersionId:entry.workflowVersionId});
    if(version.workflowId!==createWorkflowId||version.status!=='ACTIVE')throw Error('NATIVE_PREPARATION_TARGET_NOT_ACTIVE_CREATE_WORKFLOW');
    const args={workspaceId:runInfo.workspaceId,workflowRunId:entry.workflowRunId};
    let existing=await runner.workflowRunWorkspaceService.getWorkflowRun(args);
    if(existing&&(existing.workflowId!==createWorkflowId||existing.state?.stepInfos?.trigger?.result?.preparationRequest?.providerSourceFingerprint!==request.providerSourceFingerprint))throw Error('NATIVE_PREPARATION_RUN_ID_CONFLICT');
    if(retry){
      if(!existing||existing.workflowVersionId!==entry.workflowVersionId)throw Error('NATIVE_PREPARATION_RETRY_VERSION_MISMATCH');
      if(!isDeepStrictEqual(existing.state?.stepInfos?.trigger?.result,p))throw Error('NATIVE_PREPARATION_RETRY_PROVENANCE_MISMATCH');
      if(existing.status==='FAILED')await runner.retryWorkflowRun(runInfo.workspaceId,entry.workflowRunId);
    }else if(!existing){
      try{await runner.run({...args,workflowVersionId:entry.workflowVersionId,payload:p,source:{source:'WORKFLOW',name:'Verified opportunity preparation',context:{upstreamWorkflowRunId:parent.id,upstreamVerifierStepId:binding.upstreamVerifierStepId},workspaceMemberId:null}});}
      catch(error){existing=await runner.workflowRunWorkspaceService.getWorkflowRun(args);if(!existing)throw error;if(existing.workflowId!==createWorkflowId||!isDeepStrictEqual(existing.state?.stepInfos?.trigger?.result,p))throw Error('NATIVE_PREPARATION_RUN_ID_CONFLICT');if(['ENQUEUED','NOT_STARTED'].includes(existing.status))await runner.resume(args);}
    }else if(['ENQUEUED','NOT_STARTED'].includes(existing.status))await runner.resume(args);
    const actual=await runner.workflowRunWorkspaceService.getWorkflowRunOrFail(args);
    if(actual.workflowId!==createWorkflowId||actual.workflowVersionId!==entry.workflowVersionId||actual.state?.stepInfos?.trigger?.result?.opportunityId!==p.opportunityId||actual.state?.stepInfos?.trigger?.result?.preparationRequest?.providerSourceFingerprint!==request.providerSourceFingerprint)throw Error('NATIVE_PREPARATION_READ_BACK_MISMATCH');
    receipts.push({workflowRunId:actual.id,workflowVersionId:actual.workflowVersionId,opportunityId:p.opportunityId,status:actual.status,nativeReadBackConfirmed:true});
  }
  return {...data,nativePreparationReceipts:receipts};
}
module.exports={enqueueVerifiedPreparation};
