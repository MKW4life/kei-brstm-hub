import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function loader(fetch){const compiled={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/r2References.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,URL,fetch,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://db.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test'}}});return compiled.exports.loadReferences;}
const request=new Request('https://test.invalid',{headers:{authorization:'Bearer fake'}});
test('reference pagination must not skip live rows when earlier records disappear between pages',async()=>{
 let rows=Array.from({length:1001},(_,i)=>({id:i+1,title:'Track',brstm_url:'https://files.test/brstm-files/'+(i+1)})),pages=0;
 const load=loader(async(url,options)=>{
  if(url.pathname.endsWith('music_packs'))return Response.json([],{headers:{'content-range':'*/0'}});
  let filtered=rows;const cursor=url.searchParams.get('id');if(cursor)filtered=rows.filter(row=>row.id>Number(cursor.slice(3)));
  const [start,end]=options.headers.Range.split('-').map(Number),total=filtered.length;
  const result=filtered.slice(start,end+1);pages++;if(pages===1)rows=rows.slice(1);
  return Response.json(result,{headers:{'content-range':`${start}-${start+result.length-1}/${total}`}});
 });
 const result=await load(request,AbortSignal.timeout(1000));assert.ok(result.references.some(row=>row.url.endsWith('/501')));assert.equal(result.references.length,1001);
});

test('reference listing fails closed when unread records change during pagination',async()=>{
 let page=0;const load=loader(async()=>{page++;const rows=Array.from({length:500},(_,i)=>({id:i+1,title:'Track'}));return Response.json(page===1?rows:[],{headers:{'content-range':page===1?'0-499/501':'*/0'}});});
 await assert.rejects(()=>load(request,AbortSignal.timeout(1000)),/Database changed/);
});
