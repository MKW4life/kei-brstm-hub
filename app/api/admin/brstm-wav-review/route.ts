import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { getR2Config, isAuthenticatedAdminRequest } from "@/lib/r2Server";
import {
  WAV_REVIEW_KEY, captureWavBaseline, pendingWavReviewIds, encryptBaseline, decryptBaseline,
  type TrackFiles, type WavReviewBaseline,
} from "@/lib/brstmWavReview";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST captures the existing tracks once. Subsequent requests only compare
// against that immutable baseline, so uploads never silently join the batch.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await isAuthenticatedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: request.headers.get("authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const tracks: TrackFiles[] = [];
    let total = 0;
    do {
      const { data, count, error } = await db.from("tracks")
        .select("id, brstm_url, brstm_lap3_url", { count: "exact" })
        .order("id", { ascending: true }).range(tracks.length, tracks.length + 499);
      if (error || count === null || !data || (data.length === 0 && tracks.length < count)) {
        throw new Error("Could not read the complete track list.");
      }
      total = count;
      tracks.push(...data);
    } while (tracks.length < total);
    if (tracks.length !== total) throw new Error("Track list changed. Retry.");

    const { client, bucketName } = getR2Config();
    const secret = process.env.R2_SECRET_ACCESS_KEY!;
    const signal = AbortSignal.timeout(20_000);
    const readBaseline = async (): Promise<WavReviewBaseline> => {
      const object = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: WAV_REVIEW_KEY }), { abortSignal: signal });
      if (!object.Body) throw new Error("Empty review baseline.");
      return decryptBaseline(await object.Body.transformToByteArray(), secret);
    };
    let baseline: WavReviewBaseline;
    try {
      baseline = await readBaseline();
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
      baseline = captureWavBaseline(tracks);
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucketName, Key: WAV_REVIEW_KEY,
          Body: encryptBaseline(baseline, secret),
          ContentType: "application/octet-stream", CacheControl: "no-store",
          IfNoneMatch: "*",
        }), { abortSignal: signal });
      } catch (writeError) {
        // Two admin tabs opening together must not reset the original batch.
        if ((writeError as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw writeError;
        baseline = await readBaseline();
      }
    }
    return Response.json({
      pendingIds: pendingWavReviewIds(baseline, tracks),
      capturedAt: baseline.capturedAt,
      initialCount: Object.keys(baseline.tracks).length,
    }, { headers });
  } catch (error) {
    console.error("BRSTM WAV review status unavailable:", error);
    return Response.json({ error: "WAV未変換の識別を取得できませんでした。再読み込みしてください。" }, { status: 503, headers });
  }
}
