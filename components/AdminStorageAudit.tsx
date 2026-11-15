"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { auditStorage } from "@/lib/r2Audit";
import styles from "./AdminStorageUsage.module.css";

type Audit = ReturnType<typeof auditStorage>;
type CleanupRow=Audit['unused'][number]&{deleteProof?:string;cleanupBlocked?:string|null};
type Report = Omit<Audit,'unused'>&{unused:CleanupRow[];recordCounts: Record<string, number>};
const bytes = (value: number) => value >= 1_000_000_000
  ? `${(value / 1_000_000_000).toFixed(2)} GB`
  : `${(value / 1_000_000).toFixed(2)} MB`;

export default function AdminStorageAudit({onChanged}:{onChanged?:()=>void}={}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [review,setReview]=useState<CleanupRow[]|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [notice,setNotice]=useState('');
  const eligible=report?.unused.filter(file=>file.deleteProof)??[];
  const selected=eligible.filter(file=>selectedKeys.includes(file.key));

  async function inspect() {
    setLoading(true);
    setError("");
    setNotice('');setSelectedKeys([]);setReview(null);setConfirmed(false);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("再ログインしてください。");
      const response = await fetch("/api/r2/audit", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "検査できませんでした。");
      setReport(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "検査できませんでした。");
    } finally { setLoading(false); }
  }

  async function removeSelected(){
    if(!review?.length||!confirmed||deleting)return;
    setDeleting(true);setNotice('');
    const results:{key:string;status:string}[]=[];let failure='';
    try{
      const {data,error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!data.session)throw Error('再ログインしてください。');
      for(let i=0;i<review.length;i+=5){
        setNotice(`再確認・削除中 ${Math.min(i+5,review.length)}/${review.length}`);
        const response=await fetch('/api/r2/cleanup',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({confirm:true,files:review.slice(i,i+5).map(file=>({key:file.key,proof:file.deleteProof}))})});
        const value=await response.json();
        if(!response.ok||!Array.isArray(value.results))throw Error(value.error||'削除結果を確認できませんでした。再検査してください。');
        results.push(...value.results);
        if(value.results.some((row:{status:string})=>row.status==='error')){failure='確認できない項目があったため停止しました。';break;}
      }
    }catch(cause){failure=cause instanceof Error?cause.message:'削除結果を確認できませんでした。';}
    setReport(null);setSelectedKeys([]);setReview(null);setConfirmed(false);
    await inspect();onChanged?.();
    const deleted=results.filter(row=>row.status==='deleted').length;
    const blocked=results.filter(row=>row.status==='blocked').length;
    const missing=results.filter(row=>row.status==='missing').length;
    setNotice(`${deleted}件削除${blocked?` · ${blocked}件は使用中・変更ありのため保持`:''}${missing?` · ${missing}件は既にありません`:''}${failure?' · '+failure:''}`);
    setDeleting(false);
  }

  function downloadReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `brstm-storage-audit-${report.measuredAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className={styles.audit}>
    <div className={styles.heading}>
      <button type="button" className="primaryButton" disabled={loading||deleting} onClick={() => void inspect()}>
        {loading ? "検査中…" : "重複・未使用ファイルを調べる"}
      </button>
      {report && <button type="button" className="primaryButton" disabled={deleting} onClick={downloadReport}>検査結果を保存</button>}
    </div>
    {error && <p role="alert" className={styles.warning}>{error}{report ? " 表示値は前回検査時のものです。" : ""}</p>}
    {notice&&<p role="status" className={styles.note}>{notice}</p>}
    {report && <div aria-label="ストレージ検査結果" role="region">
      <div className={styles.figures}>
        <div><span>未使用候補</span><b>{report.unusedCount} ファイル · {bytes(report.unusedBytes)}</b></div>
        <div><span>重複候補（ETag・サイズ一致）</span><b>{report.duplicateGroups} 組 · 余分 {bytes(report.duplicateExtraBytes)}</b></div>
        <div><span>整理できる容量の目安（重複計上なし）</span><b>{bytes(report.reclaimableCandidateBytes)}</b></div>
      </div>
      <p className={styles.note}>{report.recordCounts.tracks} 曲・{report.recordCounts.music_packs} パックと {report.objectCount} ファイルを照合 · {new Date(report.measuredAt).toLocaleString("ja-JP")}</p>
      <p className={styles.note}>{report.categories.map((category) => `${category.prefix === "previews/" ? "プレビュー" : "BRSTM"}: ${bytes(category.bytes)}`).join(" / ")}</p>
      <p className={styles.note}>未使用候補はサイトの登録データから参照されていないファイルです。更新後1時間以内のものは削除対象外です。使用中の重複ファイルは削除しません。</p>
      {report.fingerprintUncheckedCount > 0 && <p className={styles.note}>ETagで比較できなかったファイル: {report.fingerprintUncheckedCount} 件</p>}
      {report.missing.length > 0 && <p className={styles.warning}>参照先のファイルが見つからない項目: {report.missing.length} 件</p>}
      {report.invalidReferences.length > 0 && <p className={styles.warning}>形式を確認できないURL: {report.invalidReferences.length} 件</p>}
      <div className={styles.cleanupTools}>
        <button type="button" className="primaryButton" disabled={deleting||loading||!eligible.length} onClick={()=>setSelectedKeys(eligible.map(file=>file.key))}>未使用候補をすべて選択（{eligible.length}件）</button>
        <button type="button" className="primaryButton" disabled={deleting||!selected.length} onClick={()=>setSelectedKeys([])}>選択解除</button>
        <span>{selected.length}件 · {bytes(selected.reduce((sum,file)=>sum+file.size,0))}</span>
        <button type="button" className="primaryButton" disabled={deleting||loading||!selected.length} onClick={()=>{setReview(selected);setConfirmed(false);}}>選択したファイルの削除を確認</button>
      </div>
      <details className={styles.auditDetails}><summary>候補の一覧</summary>
        <h3>未使用候補</h3>
        {report.unused.length === 0 ? <p>なし</p> : <ul>{report.unused.map((file) => <li key={file.key}><label className={styles.cleanupFile}><input type="checkbox" checked={selectedKeys.includes(file.key)} disabled={deleting||!file.deleteProof} onChange={event=>setSelectedKeys(current=>event.target.checked?[...new Set([...current,file.key])]:current.filter(key=>key!==file.key))}/><span>{file.key} · {bytes(file.size)}{file.cleanupBlocked&&<small>{file.cleanupBlocked}</small>}</span></label></li>)}</ul>}
        <h3>重複候補</h3>
        {report.duplicates.length === 0 ? <p>なし</p> : report.duplicates.map((group, index) => <div key={index}>
          <p>余分 {bytes(group.redundantBytes)}</p>
          <ul>{group.files.map((file) => <li key={file.key}>{file.key} · {file.references.length ? file.references.join(" / ") : "参照なし"}</li>)}</ul>
        </div>)}
      </details>
      <details className={styles.auditDetails}><summary>検査データ（JSON）</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
    </div>}
    {review&&<div className="bulkDeleteBackdrop"><section className="bulkDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="unused-delete-title">
      <h2 id="unused-delete-title">未使用ファイル {review.length}件を削除</h2>
      <p>{bytes(review.reduce((sum,file)=>sum+file.size,0))} · 削除は元に戻せません。外部共有中のファイルは残してください。</p>
      <ul>{review.map(file=><li key={file.key}>{file.key}<small>{bytes(file.size)}</small></li>)}</ul>
      <label className="checkboxLabel"><input type="checkbox" checked={confirmed} disabled={deleting} onChange={event=>setConfirmed(event.target.checked)}/>削除対象を確認し、アップロード・編集作業が終了しています</label>
      <div className="adminActions"><button type="button" className="secondaryButton" disabled={deleting} onClick={()=>setReview(null)}>キャンセル</button><button type="button" className="primaryButton" disabled={deleting||!confirmed} onClick={()=>void removeSelected()}>{deleting?'再確認・削除中…':`${review.length}件を削除`}</button></div>
    </section></div>}
  </div>;
}
