import {HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getR2Config,isAuthenticatedAdminRequest} from '@/lib/r2Server';
import {loadReferences} from '@/lib/r2References';
import {verifyCleanupFile,cleanupUnusedFiles} from '@/lib/r2Cleanup';
export const runtime='nodejs';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 if(!await isAuthenticatedAdminRequest(request))return Response.json({error:'Unauthorized'},{status:401,headers});
 let submitted:{key:string;proof:string}[];
 try{
  const text=await request.text();if(text.length>32768)throw Error();
  const body=JSON.parse(text);
  if(body.confirm!==true||!Array.isArray(body.files)||body.files.length<1||body.files.length>5)throw Error();
  submitted=body.files;
  if(submitted.some(row=>!row||typeof row.key!=='string'||typeof row.proof!=='string')||new Set(submitted.map(row=>row.key)).size!==submitted.length)throw Error();
 }catch{return Response.json({error:'削除対象を確認してください（1回5件まで）。'},{status:400,headers});}
 try{
  const {client,bucketName,publicBaseUrl}=getR2Config();
  let files;
  try{files=submitted.map(row=>{const file=verifyCleanupFile(row.proof,process.env.R2_SECRET_ACCESS_KEY!);if(file.key!==row.key)throw Error();return file;});}
  catch{return Response.json({error:'検査結果が期限切れか変更されています。再検査してください。'},{status:409,headers});}
  const signal=AbortSignal.timeout(20_000);
  const results=await cleanupUnusedFiles(files,{
   publicBaseUrl,
   head:async key=>{
    try{const current=await client.send(new HeadObjectCommand({Bucket:bucketName,Key:key}),{abortSignal:signal});
     if(current.ContentLength===undefined||!current.ETag||!current.LastModified)throw Error('Incomplete metadata');
     return {key,size:current.ContentLength,etag:current.ETag,modifiedAt:current.LastModified.toISOString()};
    }catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)return null;throw error;}
   },
   references:async()=>{const current=await loadReferences(request,signal);return current.references;},
   remove:async key=>{await client.send(new DeleteObjectCommand({Bucket:bucketName,Key:key}),{abortSignal:signal});},
  });
  return Response.json({results},{headers});
 }catch(error){console.error('Unused storage cleanup failed',error);return Response.json({error:'参照確認または削除を完了できませんでした。再検査してください。'},{status:503,headers});}
}
