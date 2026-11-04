import { getR2Config, isAuthenticatedAdminRequest } from "@/lib/r2Server";
import { measureR2Usage } from "@/lib/r2Usage";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await isAuthenticatedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const { client, bucketName } = getR2Config();
    const signal = AbortSignal.timeout(20_000);
    const usage = await measureR2Usage(
      (command) => client.send(command, { abortSignal: signal }),
      bucketName,
    );
    return Response.json(usage, { headers });
  } catch (error) {
    console.error("Failed to measure R2 storage usage:", error);
    return Response.json(
      { error: "ストレージ容量を取得できませんでした。時間をおいて再度更新してください。" },
      { status: 503, headers },
    );
  }
}
