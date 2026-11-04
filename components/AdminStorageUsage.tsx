"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./AdminStorageUsage.module.css";

type Usage = {
  usedBytes: number;
  objectCount: number;
  referenceBytes: number;
  remainingBytes: number;
  overageBytes: number;
  measuredAt: string;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 GB";
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 2 })} GB`
    : `${(bytes / 1_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 2 })} MB`;
}

async function requestUsage(): Promise<Usage> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("再ログインしてください。");
  const response = await fetch("/api/r2/usage", {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "容量を取得できませんでした。");
  return result;
}

export default function AdminStorageUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsage = useCallback(() => {
    return requestUsage()
      .then((result) => { setUsage(result); setError(""); })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "容量を取得できませんでした。");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void loadUsage(); }, [loadUsage]);

  function refresh() {
    setLoading(true);
    setError("");
    void loadUsage();
  }

  return (
    <section className={styles.panel} aria-label="ストレージ容量" aria-busy={loading}>
      <div className={styles.heading}>
        <h2>ストレージ容量 <span>Cloudflare R2</span></h2>
        <button className="primaryButton" type="button" disabled={loading} onClick={refresh}>
          {loading ? "取得中…" : "更新"}
        </button>
      </div>
      {usage && <>
        <div className={styles.figures}>
          <div><span>無料枠までの残り（目安）</span><strong>{formatBytes(usage.remainingBytes)}</strong></div>
          <div><span>使用量 / 基準</span><b>{formatBytes(usage.usedBytes)} / {formatBytes(usage.referenceBytes)}</b></div>
          <div><span>ファイル数</span><b>{usage.objectCount.toLocaleString("ja-JP")}</b></div>
        </div>
        <progress className={styles.meter} max={usage.referenceBytes} value={Math.min(usage.usedBytes, usage.referenceBytes)} aria-label="ストレージ使用量" />
        {usage.overageBytes > 0 && <p className={styles.warning}>基準を {formatBytes(usage.overageBytes)} 超えています。</p>}
        <p className={styles.note}>このサイトのバケット全体 · {new Date(usage.measuredAt).toLocaleString("ja-JP")} 時点</p>
      </>}
      {error && <p role="alert" className={styles.warning}>{error}{usage ? " 表示値は前回取得時のものです。" : ""}</p>}
      <p className={styles.note}>10 GBは無料枠の目安で、保存容量の上限ではありません。実際の無料枠はアカウント全体の月平均使用量で計算されます。</p>
    </section>
  );
}
