"use client";
import {useState} from 'react';
import {supabase} from '@/lib/supabase';
import {selectedTrackRows} from '@/lib/trackSelection';
type Row={id:number;title:string;tags:string};
export default function AdminBulkDelete({tracks,matches,visibleIds,selectedIds,onSelection,onDeleted,onBusyChange}:{
  tracks:Row[];matches:Row[];visibleIds:number[];selectedIds:number[];onSelection:(ids:number[])=>void;onDeleted:()=>Promise<void>;onBusyChange:(busy:boolean)=>void;
}){
 const [review,setReview]=useState<Row[]|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const selected=selectedTrackRows(tracks,selectedIds);
 function openReview(){setConfirmed(false);setMessage('');setReview(selected.map(row=>({...row})));}
 async function remove(){
  if(!review?.length||!confirmed||busy)return;
  const ids=review.map(row=>row.id);setBusy(true);onBusyChange(true);setMessage('');
  try{
   const {data,error}=await supabase.from('tracks').delete().in('id',ids).select('id');
   if(error)throw error;
   const removed=new Set<number>((data??[]).map(row=>row.id));
   onSelection(selectedIds.filter(id=>!removed.has(id)));
   setReview(null);setConfirmed(false);
   setMessage(`${removed.size}曲を削除しました。${removed.size!==ids.length?'未削除の曲は選択したままです。':''}`);
   await onDeleted();
  }catch{setMessage('削除に失敗しました。選択した曲を確認して再実行してください。');}
  finally{setBusy(false);onBusyChange(false);}
 }
 return <div className="bulkDeleteTools">
  <strong>{selected.length}曲選択</strong>
  <button type="button" className="secondaryButton" disabled={busy||!visibleIds.length} onClick={()=>onSelection([...new Set([...selectedIds,...visibleIds])])}>表示中を選択</button>
  <button type="button" className="secondaryButton" disabled={busy||!matches.length||matches.length>1000} onClick={()=>onSelection(matches.map(row=>row.id))}>検索結果をすべて選択（{matches.length}曲）</button>
  <button type="button" className="secondaryButton" disabled={busy||!selected.length} onClick={()=>onSelection([])}>選択解除</button>
  <button type="button" className="secondaryButton" disabled={busy||!selected.length||selected.length>1000} onClick={openReview}>一括削除を確認</button>
  {message&&<p role="status">{message}</p>}
  {review&&<div className="bulkDeleteBackdrop"><section className="bulkDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
   <h2 id="bulk-delete-title">{review.length}曲の一括削除</h2>
   <p>曲の登録情報を削除します。音源ファイルと作成済みパックは保持します。</p>
   <ul>{review.map(row=><li key={row.id}><strong>{row.title}</strong><small>#{row.id} · {row.tags}</small></li>)}</ul>
   <label className="checkboxLabel"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>削除対象を確認しました</label>
   <div className="adminActions"><button type="button" className="secondaryButton" disabled={busy} onClick={()=>setReview(null)}>キャンセル</button><button type="button" className="primaryButton" disabled={!confirmed||busy} onClick={()=>void remove()}>{busy?'削除中…':`${review.length}曲を削除`}</button></div>
  </section></div>}
 </div>;
}
