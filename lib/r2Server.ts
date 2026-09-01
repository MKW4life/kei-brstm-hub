import { S3Client } from "@aws-sdk/client-s3";

const ALLOWED_PREFIXES = ["brstm-files/", "previews/"];

export type R2Config = {
  client: S3Client;
  bucketName: string;
  publicBaseUrl: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getR2Config(): R2Config {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = requiredEnv("R2_BUCKET_NAME");
  const publicBaseUrl = requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return {
    client,
    bucketName,
    publicBaseUrl,
  };
}

export function isAllowedR2Key(key: unknown): key is string {
  if (typeof key !== "string") return false;

  const normalized = key.trim();

  if (
    !normalized ||
    normalized.length > 512 ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.includes("\\")
  ) {
    return false;
  }

  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function getR2PublicUrl(publicBaseUrl: string, key: string) {
  return `${publicBaseUrl}/${key}`;
}

export async function isAuthenticatedAdminRequest(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase environment variables are not configured.");
    return false;
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: authorization,
        },
        cache: "no-store",
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Failed to validate Supabase session:", error);
    return false;
  }
}
