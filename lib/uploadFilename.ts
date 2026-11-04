export type UploadFilenameMetadata = { title: string; titleEn: string; isLap3: boolean };

/** Explicit opt-in format: Japanese title __ English Title [Lap3].extension. */
export function parseUploadFilename(fileName: string): UploadFilenameMetadata | null {
  const stem = fileName.replace(/\.(?:brstm|mp3|ogg|wav|flac|m4a)$/i, "").trim();
  const isLap3 = /\s*\[lap\s*3\]\s*$/i.test(stem);
  const withoutLap = stem.replace(/\s*\[lap\s*3\]\s*$/i, "").trim();
  const parts = withoutLap.split(/\s+__\s+/);
  if (parts.length !== 2) return null;
  const [title, titleEn] = parts.map((part) => part.trim());
  if (!title || !titleEn) return null;
  return { title, titleEn, isLap3 };
}
