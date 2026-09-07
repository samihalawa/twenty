const test=require('node:test'),assert=require('node:assert/strict');
const {executeCaseContext}=require('./case-pagination.cjs');
const make=(fingerprint='h')=>({status:'SUCCESS',data:{mode:'READ_CASE',fingerprint,totalSections:4,__nativeSnapshot:{sections:Array.from({length:4},(_,i)=>({sourceId:String(i),text:'x'.repeat(20000)}))}}});
test('native pages hydrate once and terminal page revalidates; full snapshot stays private',async()=>{
 let calls=0;const invoke=async args=>{assert.equal(args.__nativeSnapshot,true);calls++;return make();};
 let args={mode:'READ_CASE',opportunityId:'a'},p;
 for(let i=0;i<4;i++){p=await executeCaseContext(invoke,args,'workspace');assert.equal(p.data.__nativeSnapshot,undefined);assert.equal(p.data.sections[0].sourceId,String(i));args=p.data.nextRead?.arguments;}
 assert.equal(calls,2);assert.equal(p.data.canJudgeCase,true);
});
test('changed native source at terminal invalidates previous fingerprint',async()=>{
 let calls=0;const invoke=async()=>make(++calls===1?'first':'changed');let args={mode:'READ_CASE',opportunityId:'b'};
 for(let i=0;i<3;i++)args=(await executeCaseContext(invoke,args,'workspace')).data.nextRead.arguments;
 await assert.rejects(executeCaseContext(invoke,args,'workspace'),/CASE_CONTEXT_CHANGED/);
});
test('whole native Unicode tool response stays bounded with12KBpages',async()=>{
 const invoke=async()=>({status:'SUCCESS',data:{mode:'READ_CASE',fingerprint:'unicode',totalSections:20,__nativeSnapshot:{sections:Array.from({length:20},(_,i)=>({sourceId:String(i),text:'你🙂é\\"'.repeat(200)}))}}});
 const r=await executeCaseContext(invoke,{mode:'READ_CASE',opportunityId:'unicode'},'workspace');
 assert.ok(Buffer.byteLength(JSON.stringify(r))<30000);
 assert.ok(r.data.sections.length>1);assert.equal(r.data.hasNextPage,true);
});
