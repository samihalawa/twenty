'use strict';
const snapshots=new Map();const ttl=10*60*1000,maxBytes=24*1024*1024;
function retain(key,data) {
 const bytes=Buffer.byteLength(JSON.stringify(data));if(bytes>maxBytes)throw Error('CASE_SNAPSHOT_TOO_LARGE: preserve pending work; no context was declared complete.');
 snapshots.set(key,{data,bytes,at:Date.now()});
 let total=[...snapshots.values()].reduce((n,v)=>n+v.bytes,0);
 for(const [k,v] of snapshots)if(Date.now()-v.at>ttl || total>maxBytes){snapshots.delete(k);total-=v.bytes;}
}
async function executeCaseContext(invoke,args,workspaceId) {
 const prefix=workspaceId+':'+args.opportunityId+':';
 const fresh=async()=>{
   const result=await invoke({...args,cursor:0,fingerprint:undefined,__nativeSnapshot:true});
   if(result.error)return result;
   const data=result.data;
   if(data?.mode!=='READ_CASE'||!Array.isArray(data.__nativeSnapshot?.sections))throw Error('CASE_SNAPSHOT_UNAVAILABLE: native source reader did not provide a complete snapshot.');
   retain(prefix+data.fingerprint,data);return result;
 };
 let data;
 if(!args.cursor){const result=await fresh();if(result.error)return result;data=result.data;}
 else {
   const item=snapshots.get(prefix+args.fingerprint);
   if(item && Date.now()-item.at<=ttl)data=item.data;
   else {const result=await fresh();if(result.error)return result;data=result.data;}
   if(data.fingerprint!==args.fingerprint)throw Error('CASE_CONTEXT_CHANGED: restart cursor0; native sources changed since the prior fingerprint.');
 }
 const sections=data.__nativeSnapshot.sections,cursor=Number(args.cursor??0);if(!Number.isInteger(cursor)||cursor<0||cursor>sections.length)throw Error('INVALID_CASE_CURSOR');
 const page=[];let bytes=0,next=cursor;
 for(;next<sections.length;next++){const size=Buffer.byteLength(JSON.stringify(sections[next]));if(page.length&&bytes+size>18000)break;page.push(sections[next]);bytes+=size;}
 if(cursor>0&&next===sections.length){const checked=await fresh();if(checked.error)return checked;if(checked.data.fingerprint!==data.fingerprint)throw Error('CASE_CONTEXT_CHANGED: material source changes occurred during reading; restart cursor0.');}
 const {__nativeSnapshot,...publicData}=data;
 return {status:'SUCCESS',data:{...publicData,cursor,nextCursor:next<sections.length?next:null,hasNextPage:next<sections.length,sourceCoverageComplete:next===sections.length,contentCoverageComplete:cursor===0&&next===sections.length,canJudgeCase:next===sections.length,sections:page,nextRead:next<sections.length?{toolName:'app_crm_case_context',arguments:{mode:'READ_CASE',opportunityId:args.opportunityId,cursor:next,fingerprint:data.fingerprint}}:null}};
}
module.exports={executeCaseContext};
