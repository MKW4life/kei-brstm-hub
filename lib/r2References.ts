import type { FileReference } from "./r2Audit";

export async function loadReferences(request: Request, signal: AbortSignal) {
  const references: FileReference[] = [];
  const counts: Record<string, number> = {};
  for (const [table, fields] of [
    ["tracks", ["brstm_url", "preview_url", "brstm_lap3_url", "preview_lap3_url"]],
    ["music_packs", ["zip_url"]],
  ] as const) {
    let offset = 0;
    let total = 0;
    let cursor = 0;
    do {
      const url = new URL(`/rest/v1/${table}`, process.env.NEXT_PUBLIC_SUPABASE_URL);
      url.searchParams.set("select", ["id", "title", ...fields].join(","));
      url.searchParams.set("order", "id.asc");
      if (cursor) url.searchParams.set("id", `gt.${cursor}`);
      const response = await fetch(url, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          Authorization: request.headers.get("authorization")!,
          Range: "0-499",
          Prefer: "count=exact",
        },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`Cannot read ${table}: ${response.status}`);
      const countText = response.headers.get("content-range")?.split("/")[1];
      if (!countText || !/^\d+$/.test(countText)) throw new Error("Database count unavailable.");
      const remaining = Number(countText);
      if (offset === 0) total = remaining;
      else if (remaining !== total - offset) throw new Error("Database changed during audit. Retry.");
      const rows = await response.json() as Record<string, unknown>[];
      if (!Array.isArray(rows) || (rows.length === 0 && offset < total)) throw new Error("Incomplete database listing.");
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || Number(row.id) <= cursor) throw new Error("Invalid database ordering.");
        cursor = Number(row.id);
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
