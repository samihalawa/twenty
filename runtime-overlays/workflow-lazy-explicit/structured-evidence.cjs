'use strict';
const {isDeepStrictEqual}=require('node:util');
const fields={opportunity:'stateEvidence',messageThread:'inboxEvidence'};
const customFields={messageThread:['inboxEvidence','inboxStatus','opportunityId'],calendarEvent:['opportunityId']};
function isCustomOnly(objectName,data){return !!customFields[objectName] && Object.keys(data).length>0 && Object.keys(data).every(k=>customFields[objectName].includes(k));}
function extendSchema(schema, objectName,z) {
  const field=fields[objectName];
  const custom=customFields[objectName];
  if(custom) schema=schema.pick(Object.fromEntries(['id',...custom].filter(k=>schema.shape[k]).map(k=>[k,true])));
  if(!field && !custom)return schema;
  const revision=z.string().datetime({offset:true}).describe('Exact updatedAt from latest native find_one; required for atomic compare-and-set.');
  if(!field)return schema.extend({expectedUpdatedAt:revision});
  if(!schema.shape[field])return schema;
  const candidateDecision=z.object({
    threadId:z.string().uuid().describe('Exact detached candidate thread UUID returned by app_crm_case_context.'),
    decision:z.enum(['READ','EXCLUDE']).describe('READ only after full native message pagination; EXCLUDE only with a source-based reason.'),
    reason:z.string().min(1).describe('Short source-based reason for reading or excluding this exact thread.'),
  });
  const evidenceJSON=z.object({
    candidateDecisions:z.array(candidateDecision).optional().describe('Required when READ_CASE returns candidateThreadIds. Include every exact candidate once. Selected READ threads must be fully read before this mutation.'),
  }).catchall(z.unknown()).describe('Structured internal evidence delta only. Merged into existing '+field+' and serialized by the native tool; do not copy the prior stateEvidence, admission, manualPreparation or historical prose, and do not escape JSON into markdown. Existing durable keys are preserved automatically. When READ_CASE returns candidateThreadIds, candidateDecisions is mandatory and must cover every exact ID once.');
  return schema.extend({evidenceJSON:evidenceJSON.optional(),expectedUpdatedAt:z.string().datetime({offset:true}).optional().describe('Exact updatedAt from the latest find_one read. Required with evidenceJSON for atomic revision comparison.')});
}
function prepare(objectName,args,current) {
  const field=fields[objectName];
  const custom=customFields[objectName];
  if(!custom && (!field || (args.evidenceJSON===undefined&&args[field]===undefined)))return null;
  if(!args.expectedUpdatedAt || !current?.id || current.id!==args.id || (current.updatedAt instanceof Date?current.updatedAt.toISOString():current.updatedAt)!==args.expectedUpdatedAt)throw Error('EVIDENCE_REVISION_CONFLICT: read the current exact record and reconcile before retrying; no mutation executed.');
  if(args.evidenceJSON!==undefined && args[field]!==undefined)throw Error('Use evidenceJSON or '+field+', never both.');
  let incoming=args.evidenceJSON;
  if(incoming===undefined&&field&&args[field]!==undefined){try{incoming=JSON.parse(args[field].markdown);}catch{throw Error("INVALID_STATE_EVIDENCE_JSON: use structured evidenceJSON; no mutation executed.");}}
  if(incoming!==undefined && (!incoming || typeof incoming!=='object' || Array.isArray(incoming)))throw Error('evidenceJSON must be a JSON object.');
  let previous={};
  if(typeof current[field]?.markdown==='string')try {const parsed=JSON.parse(current[field].markdown);if(parsed && typeof parsed==='object'&&!Array.isArray(parsed))previous=parsed;} catch {} // Legacy malformed interpretation is replaced; no fictitious structure is invented.
  for(const key of ['admission','manualPreparation','autonomousPreparation'])if(previous[key]!==undefined && incoming?.[key]!==undefined && !isDeepStrictEqual(previous[key],incoming[key]))throw Error('PROTECTED_EVIDENCE_CONFLICT: preserve existing '+key+'; no mutation executed.');
  const {id,evidenceJSON,expectedUpdatedAt,...data}=args;
  if(field && incoming!==undefined)data[field]={markdown:JSON.stringify({...previous,...incoming,...Object.fromEntries(['admission','manualPreparation','autonomousPreparation'].filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]]))})};
  if(custom && !isCustomOnly(objectName,data))throw Error('Only explicitly supported CRM custom fields may be updated on synced objects.');
  return {filter:{and:[{id:{eq:id}},{updatedAt:{eq:expectedUpdatedAt}}]},data};
}
async function update(service,ref,args,context,authContext) {
  const field=fields[ref.objectNameSingular];
  if(!customFields[ref.objectNameSingular] && (!field || (args.evidenceJSON===undefined&&args[field]===undefined)))return null;
  const found=await service.findRecordsService.execute({objectName:ref.objectNameSingular,filter:{id:{eq:args.id}},limit:1,select:['id','updatedAt',...(field?[field]:[])],shouldBuildEffectiveSelectFields:true,authContext,rolePermissionConfig:context.rolePermissionConfig});
  if(found.success!==true) return found;
  const result=found.result, current=Array.isArray(result)?result[0]:result?.records?.[0];
  const mutation=prepare(ref.objectNameSingular,args,current);
  const changed=await service.updateManyRecordsService.execute({objectName:ref.objectNameSingular,...mutation,customFieldsOnly:!!customFields[ref.objectNameSingular],authContext,rolePermissionConfig:context.rolePermissionConfig,slimResponse:true});
  if(!changed.success)return changed;
  if(!Array.isArray(changed.result)||changed.result.length!==1||changed.result[0].id!==args.id)return {success:false,error:'EVIDENCE_REVISION_CONFLICT: concurrent change prevented this update; read current native state before retrying.'};
  return {...changed,result:changed.result[0],message:'Updated exact record at expected revision; independently read the record back.'};
}
module.exports={extendSchema,prepare,update,isCustomOnly};
