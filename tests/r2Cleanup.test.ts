import test from 'node:test';import assert from 'node:assert/strict';
import {signCleanupFile,verifyCleanupFile,cleanupUnusedFiles,cleanupBlockedReason} from '../lib/r2Cleanup.ts';
const now=Date.parse('2026-11-16T12:00:00Z'),secret='test-only-secret';
const file={key:'brstm-files/unused.brstm',size:100,etag:'"abc123"',modifiedAt:'2026-11-15T12:00:00.000Z'};
test('cleanup proofs bind exact file metadata, reject tampering and expire',()=>{
 const proof=signCleanupFile(file,secret,now);assert.deepEqual(verifyCleanupFile(proof,secret,now),file);
 assert.throws(()=>verifyCleanupFile(proof+'x',secret,now));
 assert.throws(()=>verifyCleanupFile(proof,'wrong',now));
 assert.throws(()=>verifyCleanupFile(proof,secret,now+31*60_000));
 assert.ok(cleanupBlockedReason({...file,key:'__admin__/state'},now));
 assert.ok(cleanupBlockedReason({...file,modifiedAt:new Date(now).toISOString()},now));
});
test('only confirmed unchanged unreferenced files are deleted; active references and changed objects survive',async()=>{
 const deleted:string[]=[];
 const deps={publicBaseUrl:'https://files.test',head:async()=>({...file}),references:async()=>[],remove:async(key:string)=>{deleted.push(key);}};
 let results=await cleanupUnusedFiles([file],deps,now);assert.equal(results[0].status,'deleted');assert.deepEqual(deleted,[file.key]);
 deleted.length=0;
 results=await cleanupUnusedFiles([file],{...deps,references:async()=>[{url:'https://files.test/brstm-files/unused.brstm',label:'private lap3'}]},now);
 assert.equal(results[0].status,'blocked');assert.equal(deleted.length,0);
 results=await cleanupUnusedFiles([file],{...deps,head:async()=>({...file,etag:'changed'})},now);
 assert.equal(results[0].status,'blocked');assert.equal(deleted.length,0);
});
test('incomplete reference checks and malformed URLs fail closed, partial results remain visible',async()=>{
 const deleted:string[]=[];const second={...file,key:'previews/second.ogg'};
 const results=await cleanupUnusedFiles([file,second],{publicBaseUrl:'https://files.test',head:async key=>({...file,key}),references:async()=>{if(deleted.length)throw Error('database unavailable');return [];},remove:async key=>{deleted.push(key);}},now);
 assert.deepEqual(deleted,[file.key]);assert.equal(results[1].status,'error');
 const bad=await cleanupUnusedFiles([file],{publicBaseUrl:'https://files.test',head:async()=>file,references:async()=>[{url:'bad-url',label:'broken'}],remove:async()=>{throw Error('must not delete');}},now);
 assert.equal(bad[0].status,'error');
});

test('list timestamps with milliseconds match HEAD HTTP timestamps at second precision',async()=>{
 const snapshot={...file,modifiedAt:'2026-11-15T12:00:00.343Z'};
 const removed:string[]=[];
 const deps={publicBaseUrl:'https://files.test',head:async()=>({...snapshot,modifiedAt:'2026-11-15T12:00:00.000Z'}),references:async()=>[],remove:async(key:string)=>{removed.push(key);}};
 const results=await cleanupUnusedFiles([snapshot],deps,now);
 assert.equal(results[0].status,'deleted');assert.deepEqual(removed,[snapshot.key]);
 removed.length=0;
 const changed=await cleanupUnusedFiles([snapshot],{...deps,head:async()=>({...snapshot,modifiedAt:'2026-11-15T12:00:01.000Z'})},now);
 assert.equal(changed[0].status,'blocked');assert.equal(removed.length,0);
 const changedContent=await cleanupUnusedFiles([snapshot],{...deps,head:async()=>({...snapshot,modifiedAt:'2026-11-15T12:00:00.000Z',etag:'different'})},now);
 assert.equal(changedContent[0].status,'blocked');assert.equal(removed.length,0);
});
