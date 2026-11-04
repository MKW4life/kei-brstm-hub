import test from "node:test";
import assert from "node:assert/strict";
import { isPreviewExtension, uploadContentType } from "../lib/audioFiles.ts";

test("MP3 and OGG previews are recognized regardless of case", () => {
  for (const ext of ["mp3", "ogg", "OGG", "MP3"]) assert.equal(isPreviewExtension(ext), true);
  for (const ext of ["brstm", "wav", "exe"]) assert.equal(isPreviewExtension(ext), false);
});

test("OGG upload metadata is playable even if the browser supplies an empty or generic MIME type", () => {
  assert.equal(uploadContentType("曲 __ Track [Lap3].OGG"), "audio/ogg");
  assert.equal(uploadContentType("track.ogg", "application/octet-stream"), "audio/ogg");
  assert.equal(uploadContentType("track.mp3"), "audio/mpeg");
  assert.equal(uploadContentType("track.brstm"), "application/octet-stream");
});
