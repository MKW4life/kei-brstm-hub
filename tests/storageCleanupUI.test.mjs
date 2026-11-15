import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';
const require=createRequire(import.meta.url);
function harness(){
 const slots=[],calls=[];let index=0,refreshed=0;
 const hooks={useState(v){const i=index++;if(!(i in slots))slots[i]=v;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];}};
 const row={key:'brstm-files/unused.brstm',size:100,deleteProof:'test-proof',references:[]};
 const report={unused:[row],unusedCount:1,unusedBytes:100,duplicateGroups:0,duplicateExtraBytes:0,reclaimableCandidateBytes:100,recordCounts:{tracks:1,music_packs:0},objectCount:2,measuredAt:new Date().toISOString(),categories:[],fingerprintUncheckedCount:0,missing:[],invalidReferences:[],duplicates:[]};
 const code=ts.transpileModule(readFileSync(new URL('../components/AdminStorageAudit.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const compiled={exports:{}};
 vm.runInNewContext(code,{module:compiled,exports:compiled.exports,require:name=>name==='react'?hooks:name==='@/lib/supabase'?{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fake'}}})}}}:name.endsWith('.css')?{default:{}}:require(name),fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('audit')?report:{results:[{key:row.key,status:'deleted'}]}};},console,setTimeout,URL,Blob});
 function render(){index=0;return compiled.exports.default({onChanged:()=>refreshed++});}
 function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(all)];}
 const find=predicate=>all(render()).find(predicate);
 const button=text=>find(n=>n.type==='button'&&[n.props.children].flat(Infinity).join('')===text);
 const tick=()=>new Promise(setImmediate);
 return {calls,find,button,tick,get refreshed(){return refreshed;}};
}
test('unused cleanup requires review and explicit confirmation, then refreshes audit and usage',async()=>{
 const h=harness();h.button('重複・未使用ファイルを調べる').props.onClick();await h.tick();
 h.button('未使用候補をすべて選択（1件）').props.onClick();h.button('選択したファイルの削除を確認').props.onClick();
 assert.equal(h.button('1件を削除').props.disabled,true);h.button('1件を削除').props.onClick();await h.tick();
 assert.equal(h.calls.filter(x=>x.url.endsWith('cleanup')).length,0);
 h.button('キャンセル').props.onClick();assert.equal(h.calls.length,1);
 h.button('選択したファイルの削除を確認').props.onClick();
 h.find(n=>n.type==='input'&&n.props.checked===false&&!n.props.disabled).props.onChange({target:{checked:true}});
 assert.equal(h.button('1件を削除').props.disabled,false);h.button('1件を削除').props.onClick();await h.tick();await h.tick();
 const deletes=h.calls.filter(x=>x.url.endsWith('cleanup'));assert.equal(deletes.length,1);
 assert.deepEqual(JSON.parse(deletes[0].options.body),{confirm:true,files:[{key:'brstm-files/unused.brstm',proof:'test-proof'}]});
 assert.equal(h.calls.filter(x=>x.url.endsWith('audit')).length,2);assert.equal(h.refreshed,1);
});
