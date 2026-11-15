import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {packFiles} from '../lib/packFiles.ts';
// Exercise the slot definitions actually consumed by PackCreator, not copies.
function battleSlots(){
 const source=readFileSync(new URL('../components/PackCreator.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('const battleGroups'),source.indexOf('const optionGroups'));
 return [...block.matchAll(/id: "([^"]+)", ja: "([^"]+)", en: "[^"]+", outputNormal: "([^"]+)", supportsLap3: (true|false)/g)].map(m=>({id:m[1],title:m[2],normal:m[3],fast:m[4]==='true'}));
}
const track={id:314,title:'天国と地獄',brstm_url:'normal',brstm_lap3_url:'lap3'};
test('Delfino Pier and all ten battle stages export both normal and fast music without an override',()=>{
 const slots=battleSlots();assert.equal(slots.length,10);
 for(const slot of slots){const files=packFiles(track,slot.normal,slot.fast);assert.equal(files.length,2,slot.title);assert.equal(files[1].url,'lap3');}
 const aqua=slots.find(slot=>slot.id==='venice')!;
 assert.deepEqual(packFiles(track,aqua.normal,aqua.fast).map(f=>f.name),['n_venice_n.brstm','n_venice_f.brstm']);
});
