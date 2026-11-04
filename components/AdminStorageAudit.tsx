"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { auditStorage } from "@/lib/r2Audit";
import styles from "./AdminStorageUsage.module.css";

type Report = ReturnType<typeof auditStorage> & { recordCounts: Record<string, number> };
const bytes = (value: number) => value >= 1_000_000_000
  ? `${(value / 1_000_000_000).toFixed(2)} GB`
  : `${(value / 1_000_000).toFixed(2)} MB`;

export default function AdminStorageAudit() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function inspect() {
    setLoading(true);
    setError("");
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
      <button type="button" className="primaryButton" disabled={loading} onClick={() => void inspect()}>
        {loading ? "検査中…" : "重複・未使用ファイルを調べる"}
      </button>
      {report && <button type="button" className="primaryButton" onClick={downloadReport}>検査結果を保存</button>}
    </div>
    {error && <p role="alert" className={styles.warning}>{error}{report ? " 表示値は前回検査時のものです。" : ""}</p>}
    {report && <div aria-label="ストレージ検査結果" role="region">
      <div className={styles.figures}>
        <div><span>未使用候補</span><b>{report.unusedCount} ファイル · {bytes(report.unusedBytes)}</b></div>
        <div><span>重複候補（ETag・サイズ一致）</span><b>{report.duplicateGroups} 組 · 余分 {bytes(report.duplicateExtraBytes)}</b></div>
        <div><span>整理できる容量の目安（重複計上なし）</span><b>{bytes(report.reclaimableCandidateBytes)}</b></div>
      </div>
      <p className={styles.note}>{report.recordCounts.tracks} 曲・{report.recordCounts.music_packs} パックと {report.objectCount} ファイルを照合 · {new Date(report.measuredAt).toLocaleString("ja-JP")}</p>
      <p className={styles.note}>{report.categories.map((category) => `${category.prefix === "previews/" ? "プレビュー" : "BRSTM"}: ${bytes(category.bytes)}`).join(" / ")}</p>
      <p className={styles.note}>未使用はサイトの登録データから参照されていない候補です。外部で共有中・アップロード中のファイルは含まれる場合があります。重複の統合には参照先の変更が必要です。ファイルの変更・削除は行いません。</p>
      {report.fingerprintUncheckedCount > 0 && <p className={styles.note}>ETagで比較できなかったファイル: {report.fingerprintUncheckedCount} 件</p>}
      {report.missing.length > 0 && <p className={styles.warning}>参照先のファイルが見つからない項目: {report.missing.length} 件</p>}
      {report.invalidReferences.length > 0 && <p className={styles.warning}>形式を確認できないURL: {report.invalidReferences.length} 件</p>}
      <details className={styles.auditDetails}><summary>候補の一覧</summary>
        <h3>未使用候補</h3>
        {report.unused.length === 0 ? <p>なし</p> : <ul>{report.unused.map((file) => <li key={file.key}>{file.key} · {bytes(file.size)}</li>)}</ul>}
        <h3>重複候補</h3>
        {report.duplicates.length === 0 ? <p>なし</p> : report.duplicates.map((group, index) => <div key={index}>
          <p>余分 {bytes(group.redundantBytes)}</p>
          <ul>{group.files.map((file) => <li key={file.key}>{file.key} · {file.references.length ? file.references.join(" / ") : "参照なし"}</li>)}</ul>
        </div>)}
      </details>
      <details className={styles.auditDetails}><summary>検査データ（JSON）</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
    </div>}
  </div>;
}
