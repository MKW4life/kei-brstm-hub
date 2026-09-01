import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  getR2Config,
  isAllowedR2Key,
  isAuthenticatedAdminRequest,
} from "@/lib/r2Server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAuthenticatedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key =
    typeof body === "object" && body !== null && "key" in body
      ? (body as { key?: unknown }).key
      : undefined;

  if (!isAllowedR2Key(key)) {
    return Response.json({ error: "Invalid R2 object key." }, { status: 400 });
  }

  try {
    const { client, bucketName } = getR2Config();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete R2 object:", error);

    return Response.json(
      { error: "R2 object could not be deleted." },
      { status: 500 }
    );
  }
}
