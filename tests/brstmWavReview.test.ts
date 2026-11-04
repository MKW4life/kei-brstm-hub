import test from "node:test";
import assert from "node:assert/strict";
import { captureWavBaseline, pendingWavReviewIds, encryptBaseline, decryptBaseline } from "../lib/brstmWavReview.ts";

const originals = [
  { id: 1, brstm_url: "https://files/normal.brstm", brstm_lap3_url: "https://files/lap3.brstm" },
  { id: 2, brstm_url: "https://files/other.brstm", brstm_lap3_url: null },
  { id: 3, brstm_url: null, brstm_lap3_url: null },
];

test("all existing tracks with BRSTM are marked, newly added tracks are not", () => {
  const baseline = captureWavBaseline(originals);
  assert.deepEqual(pendingWavReviewIds(baseline, [...originals, { id: 4, brstm_url: "new", brstm_lap3_url: null }]), [1, 2]);
});

test("replacing either BRSTM clears the song marker; unrelated edits keep it", () => {
  const baseline = captureWavBaseline(originals);
  for (const column of ["brstm_url", "brstm_lap3_url"] as const) {
    assert.deepEqual(pendingWavReviewIds(baseline, [{ ...originals[0], [column]: "new-url" }, originals[1]]), [2]);
  }
  const metadataOnlyEdit = { ...originals[0], title: "renamed", preview_url: "new-preview.mp3" };
  assert.deepEqual(pendingWavReviewIds(baseline, [metadataOnlyEdit]), [1]);
  assert.deepEqual(pendingWavReviewIds(baseline, []), []);
});

test("persisted review data is encrypted and fails closed for corruption or a wrong secret", () => {
  const baseline = captureWavBaseline(originals);
  const bytes = encryptBaseline(baseline, "test-only-secret");
  assert.deepEqual(decryptBaseline(bytes, "test-only-secret"), baseline);
  assert.ok(!bytes.includes(Buffer.from(baseline.tracks["1"])));
  assert.throws(() => decryptBaseline(bytes, "wrong-secret"));
  const corrupted = Buffer.from(bytes);
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => decryptBaseline(corrupted, "test-only-secret"));
});
