export function isPreviewExtension(extension: string) {
  return extension.toLowerCase() === "mp3" || extension.toLowerCase() === "ogg";
}

export function uploadContentType(fileName: string, browserType = "") {
  if (/\.ogg$/i.test(fileName)) return "audio/ogg";
  if (/\.mp3$/i.test(fileName)) return "audio/mpeg";
  return browserType || "application/octet-stream";
}
