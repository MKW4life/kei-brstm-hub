import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Config, isAuthenticatedAdminRequest } from "@/lib/r2Server";
import { auditStorage, type StoredObject, type FileReference } from "@/lib/r2Audit";

export const runtime = "nodejs";
export const maxDuration = 30;

async function loadReferences(request: Request, signal: AbortSignal) {
  const references: FileReference[] = [];
  const counts: Record<string, number> = {};
  for (const [table, fields] of [
    ["tracks", ["brstm_url", "preview_url", "brstm_lap3_url", "preview_lap3_url"]],
    ["music_packs", ["zip_url"]],
  ] as const) {
    let offset = 0;
    let total = 0;
    do {
      const url = new URL(`/rest/v1/${table}`, process.env.NEXT_PUBLIC_SUPABASE_URL);
      url.searchParams.set("select", ["id", "title", ...fields].join(","));
      url.searchParams.set("order", "id.asc");
      const response = await fetch(url, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          Authorization: request.headers.get("authorization")!,
          Range: `${offset}-${offset + 499}`,
          Prefer: "count=exact",
        },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`Cannot read ${table}: ${response.status}`);
      const countText = response.headers.get("content-range")?.split("/")[1];
      if (!countText || !/^\d+$/.test(countText)) throw new Error("Database count unavailable.");
      total = Number(countText);
      const rows = await response.json() as Record<string, unknown>[];
      if (!Array.isArray(rows) || (rows.length === 0 && offset < total)) throw new Error("Incomplete database listing.");
      for (const row of rows) {
        for (const field of fields) {
          if (typeof row[field] === "string" && row[field]) {
            references.push({ url: row[field] as string, label: `${table} #${row.id} ${row.title} · ${field}` });
          }
        }
      }
      offset += rows.length;
    } while (offset < total);
    if (offset !== total) throw new Error("Database changed during audit. Retry.");
    counts[table] = offset;
  }
  return { references, counts };
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await isAuthenticatedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const { client, bucketName, publicBaseUrl } = getR2Config();
    const signal = AbortSignal.timeout(20_000);
    const { references, counts } = await loadReferences(request, signal);
    const objects: StoredObject[] = [];
    let token: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucketName, MaxKeys: 1000, ContinuationToken: token,
      }), { abortSignal: signal });
      for (const file of page.Contents ?? []) {
        if (!file.Key || file.Size === undefined) throw new Error("Incomplete object metadata.");
        objects.push({ key: file.Key, size: file.Size, etag: file.ETag ?? "", modifiedAt: file.LastModified?.toISOString() ?? null });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && (!token || seen.has(token))) throw new Error("Incomplete storage listing.");
      if (token) seen.add(token);
    } while (token);
    return Response.json({ ...auditStorage(objects, references, publicBaseUrl), recordCounts: counts }, { headers });
  } catch (error) {
    console.error("Storage audit failed:", error);
    return Response.json({ error: "ファイル検査を完了できませんでした。時間をおいて再実行してください。" }, { status: 503, headers });
  }
}
