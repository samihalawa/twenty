'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,update,extendSchema}=require('./structured-evidence.cjs');
const current={id:'case',updatedAt:'2026-09-07T11:00:00.000Z',stateEvidence:{markdown:JSON.stringify({admission:{id:'source'},manualPreparation:{run:'human'},pendingCarry:{active:true},old:'preserved'})}};
const input={id:current.id,expectedUpdatedAt:current.updatedAt,evidenceJSON:{responseOwner:'THEM',nextAction:{kind:'ASSESSMENT',owner:'SAMI'}}};
test('native structured evidence preserves durable state and serializes exact model judgment',()=>{
 const change=prepare('opportunity',input,current),value=JSON.parse(change.data.stateEvidence.markdown);
 assert.equal(value.responseOwner,'THEM');assert.equal(value.nextAction.owner,'SAMI');assert.equal(value.manualPreparation.run,'human');assert.equal(value.admission.id,'source');assert.equal(value.pendingCarry.active,true);
 assert.deepEqual(change.filter,{and:[{id:{eq:'case'}},{updatedAt:{eq:current.updatedAt}}]});
});
test('stale revision and protected overwrite fail before mutation',()=>{
 assert.throws(()=>prepare('opportunity',{...input,expectedUpdatedAt:'stale'},current),/REVISION_CONFLICT/);
 assert.throws(()=>prepare('opportunity',{...input,evidenceJSON:{manualPreparation:{run:'agent'}}},current),/PROTECTED/);
});
test('messageThread uses identical serialization and preserves admission',()=>{
 const thread={...current,inboxEvidence:current.stateEvidence};
 assert.equal(JSON.parse(prepare('messageThread',input,thread).data.inboxEvidence.markdown).manualPreparation.run,'human');
});
test('existing native services perform atomic exact update and zero-row race is failure',async()=>{
 let changed,permission={roleId:'native'};
 const service={findRecordsService:{execute:async p=>{assert.equal(p.rolePermissionConfig,permission);return {success:true,result:{records:[current]}};}},updateManyRecordsService:{execute:async p=>{changed=p;return {success:true,result:[{id:'case'}]};}}};
 const receipt=await update(service,{objectNameSingular:'opportunity'},input,{rolePermissionConfig:permission},{type:'native'});
 assert.equal(receipt.result.id,'case');assert.equal(changed.filter.and[1].updatedAt.eq,current.updatedAt);
 service.updateManyRecordsService.execute=async()=>({success:true,result:[]});
 assert.equal((await update(service,{objectNameSingular:'opportunity'},input,{rolePermissionConfig:permission},{})).success,false);
});
test('synced calendar permits only exact opportunity link with revision CAS',()=>{
 const args={id:current.id,expectedUpdatedAt:current.updatedAt,opportunityId:'exact-opportunity'};
 assert.equal(prepare('calendarEvent',args,current).data.opportunityId,'exact-opportunity');
 assert.throws(()=>prepare('calendarEvent',{...args,startsAt:'invented'},current),/custom fields/);
 assert.throws(()=>prepare('calendarEvent',{...args,expectedUpdatedAt:undefined},current),/REVISION/);
});
test('native Date timestamp compares to exact API ISO revision without weakening CAS',()=>{
 assert.ok(prepare('opportunity',input,{...current,updatedAt:new Date(current.updatedAt)}));
});

test('raw markdown evidence cannot bypass protected merge and revision checks',()=>{
 const prior={id:'x',updatedAt:'2026-09-07T00:00:00.000Z',stateEvidence:{markdown:JSON.stringify({admission:{id:'source'},manualPreparation:{id:'request'}})}};
 assert.throws(()=>prepare('opportunity',{id:'x',stateEvidence:{markdown:'{}'}},prior),/REVISION_CONFLICT/);
 const p=prepare('opportunity',{id:'x',expectedUpdatedAt:prior.updatedAt,stateEvidence:{markdown:JSON.stringify({judgment:'new'})}},prior);
 const saved=JSON.parse(p.data.stateEvidence.markdown);assert.equal(saved.admission.id,'source');assert.equal(saved.manualPreparation.id,'request');assert.equal(saved.judgment,'new');
});

test('opportunity evidence schema teaches exact candidate decision contract',()=>{
 const z=require('/app/node_modules/zod');
 const schema=extendSchema(z.object({id:z.string(),stateEvidence:z.object({markdown:z.string().optional()}).optional()}),'opportunity',z);
 const evidence=schema.shape.evidenceJSON.unwrap();
 const valid={candidateDecisions:[{threadId:'4fd9093a-3bc7-4f83-aee9-d04347c2175b',decision:'EXCLUDE',reason:'Different requisition'}]};
 assert.deepEqual(evidence.parse(valid),valid);
 assert.throws(()=>evidence.parse({candidateDecisions:[{threadId:valid.candidateDecisions[0].threadId,decision:'SKIP',reason:'Different requisition'}]}));
 assert.match(evidence.description,/candidateDecisions is mandatory/);
});
