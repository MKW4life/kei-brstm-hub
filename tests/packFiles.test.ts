import test from 'node:test';
import assert from 'node:assert/strict';
import {packFiles,validateBrstm} from '../lib/packFiles.ts';
import {createStoredZip} from '../lib/simpleZip.ts';
function audio(){
 const bytes=new Uint8Array(160),view=new DataView(bytes.buffer),tag=(offset:number,s:string)=>bytes.set(new TextEncoder().encode(s),offset);
 tag(0,'RSTM');view.setUint16(4,0xfeff);view.setUint16(6,0x0100);view.setUint32(8,160);view.setUint16(12,64);view.setUint16(14,2);
 view.setUint32(16,64);view.setUint32(20,32);view.setUint32(24,96);view.setUint32(28,64);
 tag(64,'HEAD');view.setUint32(68,32);tag(96,'DATA');view.setUint32(100,64);return bytes;
}
const track={id:1,title:'アクアリゾート',brstm_url:'https://example.com/normal.brstm',brstm_lap3_url:'https://example.com/lap3.brstm'};
test('Aqua Resort exports distinct normal and final-lap sources, preserving slot case',()=>{
 assert.deepEqual(packFiles(track,'STRM_N_WATER_N',true),[{url:track.brstm_url,name:'STRM_N_WATER_N.brstm'},{url:track.brstm_lap3_url,name:'STRM_N_WATER_F.brstm'}]);
 assert.equal(packFiles(track,'n_farm_n',true)[1].name,'n_farm_f.brstm');
});
test('missing Lap3 blocks export; explicitly selected normal music is allowed for Lap3',()=>{
 const normalOnly={...track,brstm_lap3_url:''};
 assert.throws(()=>packFiles(normalOnly,'n_farm_n',true),/Lap3/);
 assert.equal(packFiles(normalOnly,'n_farm_n',true,{track:normalOnly,version:'normal'})[1].url,track.brstm_url);
 assert.equal(packFiles(normalOnly,'o_FanfareGP1_32',false).length,1);
 assert.throws(()=>packFiles(track,'bad_name',true),/Lap3/);
});
test('empty or broken final-lap sources never silently produce a playable-looking ZIP',()=>{
 assert.throws(()=>packFiles({...track,brstm_lap3_url:'  '},'n_farm_n',true),/Lap3/);
 assert.throws(()=>validateBrstm(new TextEncoder().encode('<!DOCTYPE html>')),/BRSTM/);
 assert.doesNotThrow(()=>validateBrstm(audio()));
 assert.throws(()=>validateBrstm(audio().slice(0,150)),/BRSTM/);
 const broken=audio();new DataView(broken.buffer).setUint32(24,150);assert.throws(()=>validateBrstm(broken),/BRSTM/);
 const fake=new Uint8Array(20);fake.set(new TextEncoder().encode('RSTM'));assert.throws(()=>validateBrstm(fake),/BRSTM/);
});
test('the generated archive contains both normal and Lap3 bytes under their final output filenames',async()=>{
 const jobs=packFiles(track,'n_farm_n',true),one=audio(),two=audio();one[159]=1;two[159]=2;
 const blob=createStoredZip(jobs.map((job,i)=>({name:job.name,data:i?two:one})));
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);let offset=0;const entries=[];
 while(view.getUint32(offset,true)===0x04034b50){const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);const start=offset+30+nameLength+extra;entries.push({name:new TextDecoder().decode(bytes.slice(offset+30,offset+30+nameLength)),last:bytes[start+size-1]});offset=start+size;}
 assert.deepEqual(entries,[{name:'n_farm_n.brstm',last:1},{name:'n_farm_f.brstm',last:2}]);
});
