import {createHmac,timingSafeEqual} from 'node:crypto';
import {auditStorage,type StoredObject,type FileReference} from './r2Audit.ts';
const HOUR=60*60_000,TTL=30*60_000;
export function cleanupBlockedReason(file:StoredObject,now=Date.now()):string|null{
 if(!file.key||file.key!==file.key.trim()||file.key.length>512||!/^((brstm-files)|(previews))\//.test(file.key)||file.key.includes('..')||file.key.includes('\\'))return '削除対象外のファイルです。';
 if(!Number.isSafeInteger(file.size)||file.size<0||!file.etag||file.etag.length>256)return 'ファイル情報を確認できません。';
 const modified=Date.parse(file.modifiedAt??'');
 if(!Number.isFinite(modified)||now-modified<HOUR)return 'アップロード・更新から1時間以内のため対象外です。';
 return null;
}
export function signCleanupFile(file:StoredObject,secret:string,now=Date.now()){
 if(!secret||cleanupBlockedReason(file,now))throw Error('削除対象を確認してください。');
 const payload=Buffer.from(JSON.stringify({purpose:'unused-cleanup',expires:now+TTL,file:{key:file.key,size:file.size,etag:file.etag,modifiedAt:file.modifiedAt}})).toString('base64url');
 return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
}
export function verifyCleanupFile(proof:unknown,secret:string,now=Date.now()):StoredObject{
 if(typeof proof!=='string'||proof.length>4096||!secret)throw Error('再検査してください。');
 const parts=proof.split('.');if(parts.length!==2)throw Error('再検査してください。');
 const expected=createHmac('sha256',secret).update(parts[0]).digest();const signature=Buffer.from(parts[1],'base64url');
 if(signature.length!==expected.length||!timingSafeEqual(expected,signature))throw Error('再検査してください。');
 const value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
 if(value.purpose!=='unused-cleanup'||!Number.isFinite(value.expires)||value.expires<=now||value.expires>now+TTL||!value.file||cleanupBlockedReason(value.file,now))throw Error('検査の有効期限が切れたか、対象が変更されました。再検査してください。');
 return value.file;
}
type Dependencies={publicBaseUrl:string;head:(key:string)=>Promise<StoredObject|null>;references:()=>Promise<FileReference[]>;remove:(key:string)=>Promise<void>};
export type CleanupResult={key:string;status:'deleted'|'blocked'|'missing'|'error';message?:string;size?:number};
export async function cleanupUnusedFiles(files:StoredObject[],deps:Dependencies,now=Date.now()):Promise<CleanupResult[]>{
 const results:CleanupResult[]=[];
 for(const file of files){
  try{
   const current=await deps.head(file.key);
   if(!current){results.push({key:file.key,status:'missing'});continue;}
   const blocked=cleanupBlockedReason(current,now);
   if(blocked||current.key!==file.key||current.size!==file.size||current.etag!==file.etag||current.modifiedAt!==file.modifiedAt){results.push({key:file.key,status:'blocked',message:blocked||'検査後にファイルが変更されています。'});continue;}
   // Re-read the complete public/private track and pack references per object.
   const report=auditStorage([current],await deps.references(),deps.publicBaseUrl);
   if(report.invalidReferences.length)throw Error('登録URLを完全に確認できません。');
   if(!report.unused.some(row=>row.key===file.key)){results.push({key:file.key,status:'blocked',message:'曲またはパックで使用中です。'});continue;}
   await deps.remove(file.key);results.push({key:file.key,status:'deleted',size:file.size});
  }catch{results.push({key:file.key,status:'error',message:'参照確認または削除に失敗しました。再検査してください。'});break;}
 }
 return results;
}
