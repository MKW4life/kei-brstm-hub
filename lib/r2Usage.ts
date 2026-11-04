import { ListObjectsV2Command, type ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";

export const FREE_STORAGE_BYTES = 10_000_000_000;

export async function measureR2Usage(
  list: (command: ListObjectsV2Command) => Promise<ListObjectsV2CommandOutput>,
  bucketName: string,
) {
  let usedBytes = 0;
  let objectCount = 0;
  let continuationToken: string | undefined;
  const seenTokens = new Set<string>();

  do {
    const page = await list(new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      usedBytes += object.Size ?? 0;
      objectCount++;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!continuationToken || seenTokens.has(continuationToken))) {
      throw new Error("Incomplete storage listing.");
    }
    if (continuationToken) seenTokens.add(continuationToken);
  } while (continuationToken);

  return {
    usedBytes,
    objectCount,
    referenceBytes: FREE_STORAGE_BYTES,
    remainingBytes: Math.max(0, FREE_STORAGE_BYTES - usedBytes),
    overageBytes: Math.max(0, usedBytes - FREE_STORAGE_BYTES),
    measuredAt: new Date().toISOString(),
  };
}
