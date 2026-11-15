export type PackAudioTrack = { id: number; title: string; brstm_url: string; brstm_lap3_url: string };
export function lap3OutputName(normal: string) {
  if (normal.endsWith('_n')) return normal.slice(0,-2)+'_f';
  if (normal.endsWith('_N')) return normal.slice(0,-2)+'_F';
  return '';
}
export function packFiles(track: PackAudioTrack, outputNormal: string, supportsLap3: boolean, override?: {track: PackAudioTrack; version:'normal'|'lap3'}) {
  const normal=track.brstm_url?.trim();
  if(!normal) throw new Error(`${track.title}: 通常BRSTMがありません / Normal BRSTM missing`);
  const jobs=[{url:normal,name:outputNormal+'.brstm'}];
  if(supportsLap3){
    const source=override?.track??track;
    const url=(override?.version==='normal'?source.brstm_url:source.brstm_lap3_url)?.trim();
    const name=lap3OutputName(outputNormal);
    if(!url||!name)throw new Error(`${track.title}: Lap3を指定してください / Select a Lap3 source`);
    jobs.push({url,name:name+'.brstm'});
  }
  return jobs;
}
export function validateBrstm(bytes: Uint8Array) {
  const fail=()=>{throw new Error('BRSTM音源を取得できませんでした / Invalid BRSTM audio');};
  const tag=(offset:number)=>String.fromCharCode(...bytes.slice(offset,offset+4));
  if(bytes.length<0x40||tag(0)!=='RSTM')fail();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  // Wii BRSTM 1.0: big-endian header, complete size and bounded chunk table.
  if(view.getUint16(4)!==0xfeff||view.getUint16(6)!==0x0100||view.getUint32(8)!==bytes.length)fail();
  const headerSize=view.getUint16(12),count=view.getUint16(14);
  if(count<2||count>3||headerSize<16+count*8||headerSize>bytes.length)fail();
  const chunks=new Set<string>(),ranges:{start:number;end:number}[]=[];
  for(let i=0;i<count;i++){
    const start=view.getUint32(16+i*8),size=view.getUint32(20+i*8),end=start+size;
    if(count===3&&i===1&&start===0&&size===0)continue;
    if(start<headerSize||size<8||end>bytes.length||ranges.some(r=>start<r.end&&end>r.start))fail();
    const name=tag(start);
    if(!['HEAD','ADPC','DATA'].includes(name)||chunks.has(name))fail();
    const chunkSize=view.getUint32(start+4);
    if(chunkSize<8||chunkSize>size)fail();
    chunks.add(name);ranges.push({start,end});
  }
  if(!chunks.has('HEAD')||!chunks.has('DATA'))fail();
}
