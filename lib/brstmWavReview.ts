import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const WAV_REVIEW_KEY = "__admin__/brstm-wav-review-v1.enc";
export type TrackFiles = { id: number; brstm_url: string | null; brstm_lap3_url: string | null };
export type WavReviewBaseline = { version: 1; capturedAt: string; tracks: Record<string, string> };

function signature(track: TrackFiles) {
  return createHash("sha256").update(JSON.stringify([track.brstm_url || "", track.brstm_lap3_url || ""])).digest("hex");
}

export function captureWavBaseline(tracks: TrackFiles[]): WavReviewBaseline {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    tracks: Object.fromEntries(tracks.filter((track) => track.brstm_url || track.brstm_lap3_url)
      .map((track) => [String(track.id), signature(track)])),
  };
}

export function pendingWavReviewIds(baseline: WavReviewBaseline, tracks: TrackFiles[]) {
  return tracks.filter((track) => (track.brstm_url || track.brstm_lap3_url) &&
    baseline.tracks[String(track.id)] === signature(track)).map((track) => track.id);
}

function encryptionKey(secret: string) {
  if (!secret) throw new Error("Storage encryption secret unavailable.");
  return createHash("sha256").update(`brstm-wav-review-v1:${secret}`).digest();
}

export function encryptBaseline(baseline: WavReviewBaseline, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(baseline), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBaseline(bytes: Uint8Array, secret: string): WavReviewBaseline {
  const buffer = Buffer.from(bytes);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  const value = JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8"));
  if (value.version !== 1 || typeof value.capturedAt !== "string" || !value.tracks ||
    typeof value.tracks !== "object" || Array.isArray(value.tracks) ||
    !Object.values(value.tracks).every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("Invalid WAV review baseline.");
  }
  return value;
}
