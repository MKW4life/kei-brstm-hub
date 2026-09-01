import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getR2Config,
  getR2PublicUrl,
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

  const requestedContentType =
    typeof body === "object" && body !== null && "contentType" in body
      ? (body as { contentType?: unknown }).contentType
      : undefined;

  if (!isAllowedR2Key(key)) {
    return Response.json({ error: "Invalid R2 object key." }, { status: 400 });
  }

  const contentType =
    typeof requestedContentType === "string" &&
    requestedContentType.length > 0 &&
    requestedContentType.length <= 120
      ? requestedContentType
      : "application/octet-stream";

  try {
    const { client, bucketName, publicBaseUrl } = getR2Config();

    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 300 }
    );

    return Response.json({
      uploadUrl,
      publicUrl: getR2PublicUrl(publicBaseUrl, key),
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Failed to create R2 upload URL:", error);

    return Response.json(
      { error: "R2 upload URL could not be created." },
      { status: 500 }
    );
  }
}
