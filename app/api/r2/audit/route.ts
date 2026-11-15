import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Config, isAuthenticatedAdminRequest } from "@/lib/r2Server";
import { auditStorage, type StoredObject } from "@/lib/r2Audit";

import {loadReferences} from "@/lib/r2References";
import {cleanupBlockedReason,signCleanupFile} from "@/lib/r2Cleanup";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    const report=auditStorage(objects,references,publicBaseUrl);
    const unused=report.unused.map(file=>{const reason=cleanupBlockedReason(file);return {...file,cleanupBlocked:reason,deleteProof:reason?undefined:signCleanupFile(file,process.env.R2_SECRET_ACCESS_KEY!)};});
    return Response.json({...report,unused,recordCounts:counts},{headers});
  } catch (error) {
    console.error("Storage audit failed:", error);
    return Response.json({ error: "ファイル検査を完了できませんでした。時間をおいて再実行してください。" }, { status: 503, headers });
  }
}
