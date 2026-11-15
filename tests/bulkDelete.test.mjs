import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';
const require=createRequire(import.meta.url);
const selectedTrackRows=(tracks,ids)=>tracks.filter(row=>new Set(ids).has(row.id));
function harness(){
 const slots=[],calls=[];let index=0,reloaded=0,selected=[2];
 const hooks={useState(v){const i=index++;if(!(i in slots))slots[i]=v;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];}};
 const source=readFileSync(new URL('../components/AdminBulkDelete.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const compiled={exports:{}};
 const client={from(table){return {delete(){return {in(column,ids){calls.push({table,column,ids});return {select:async()=>({data:ids.map(id=>({id})),error:null})};}};}};}};
 vm.runInNewContext(code,{module:compiled,exports:compiled.exports,require:name=>name==='react'?hooks:name==='@/lib/supabase'?{supabase:client}:name==='@/lib/trackSelection'?{selectedTrackRows}:require(name),console});
 const tracks=[{id:1,title:'Keep',tags:'Other'},{id:2,title:'Selected',tags:'Pokemon Mystery Dungeon'},{id:3,title:'Keep too',tags:'Other'}];
 function render(){index=0;return compiled.exports.default({tracks,matches:tracks,visibleIds:[1,2,3],selectedIds:selected,onSelection:ids=>selected=ids,onDeleted:async()=>{reloaded++;},onBusyChange(){}});}
 function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(all)];}
 const find=(predicate)=>all(render()).find(predicate);
 const button=text=>find(n=>n.type==='button'&&n.props.children===text);
 return {calls,button,find,get reloaded(){return reloaded;},get selected(){return selected;}};
}
test('bulk delete never mutates when selecting, reviewing, cancelling or leaving confirmation unchecked',async()=>{
 const h=harness();assert.equal(h.calls.length,0);
 h.button('一括削除を確認').props.onClick();
 assert.ok(h.button('1曲を削除').props.disabled);
 await h.button('1曲を削除').props.onClick();assert.equal(h.calls.length,0);
 h.button('キャンセル').props.onClick();assert.equal(h.calls.length,0);
});
test('confirmed deletion only deletes the reviewed rows and retains other songs and storage files',async()=>{
 const h=harness();h.button('一括削除を確認').props.onClick();
 h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 assert.equal(h.button('1曲を削除').props.disabled,false);
 h.button('1曲を削除').props.onClick();await new Promise(setImmediate);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{table:'tracks',column:'id',ids:[2]}]);
 assert.equal(h.reloaded,1);assert.deepEqual(h.selected,[]);
});
