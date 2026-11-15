import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';
import * as cleanup from '../lib/r2Cleanup.ts';
const require=createRequire(import.meta.url),secret='test-only-secret';
const file={key:'brstm-files/old.brstm',size:100,etag:'"test"',modifiedAt:'2026-01-01T00:00:00.000Z'};
function harness({authenticated=true,referenced=false,changed=false}={}){
 const calls=[];class HeadObjectCommand{constructor(input){this.input=input;this.kind='head';}}class DeleteObjectCommand{constructor(input){this.input=input;this.kind='delete';}}
 const source=ts.transpileModule(readFileSync(new URL('../app/api/r2/cleanup/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiled={exports:{}};
 vm.runInNewContext(source,{module:compiled,exports:compiled.exports,require:name=>name==='@aws-sdk/client-s3'?{HeadObjectCommand,DeleteObjectCommand}:name==='@/lib/r2Cleanup'?cleanup:name==='@/lib/r2Server'?{isAuthenticatedAdminRequest:async()=>authenticated,getR2Config:()=>({bucketName:'fake',publicBaseUrl:'https://files.test',client:{send:async command=>{calls.push(command.kind);return command.kind==='head'?{ContentLength:100,ETag:changed?'changed':file.etag,LastModified:new Date(file.modifiedAt)}:{};}}})}:name==='@/lib/r2References'?{loadReferences:async()=>{calls.push('references');return {references:referenced?[{url:'https://files.test/'+file.key,label:'private lap3'}]:[]};}}:require(name),Request,Response,AbortSignal,process:{env:{R2_SECRET_ACCESS_KEY:secret}},console});
 return {calls,post:body=>compiled.exports.POST(new Request('https://test.invalid/api/r2/cleanup',{method:'POST',body:JSON.stringify(body)}))};
}
const valid=()=>({confirm:true,files:[{key:file.key,proof:cleanup.signCleanupFile(file,secret)}]});
test('cleanup API rejects unauthenticated, unconfirmed, duplicate and forged requests before touching files',async()=>{
 const denied=harness({authenticated:false});assert.equal((await denied.post(valid())).status,401);assert.equal(denied.calls.length,0);
 const h=harness();assert.equal((await h.post({...valid(),confirm:false})).status,400);
 const duplicate=valid();duplicate.files.push(duplicate.files[0]);assert.equal((await h.post(duplicate)).status,400);
 assert.equal((await h.post({confirm:true,files:[{key:file.key,proof:'forged'}]})).status,409);assert.equal(h.calls.length,0);
});
test('cleanup API rechecks metadata and references before deletion',async()=>{
 const h=harness();const response=await h.post(valid());assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'deleted');assert.deepEqual(h.calls,['head','references','delete']);
 for(const options of [{referenced:true},{changed:true}]){const safe=harness(options);const result=await safe.post(valid());assert.equal((await result.json()).results[0].status,'blocked');assert.ok(!safe.calls.includes('delete'));}
});
