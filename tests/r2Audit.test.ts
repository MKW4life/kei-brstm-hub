import test from "node:test";
import assert from "node:assert/strict";
import { auditStorage } from "../lib/r2Audit.ts";

const hash = "a".repeat(32);
const object = (key: string, size = 100, etag = hash) => ({ key, size, etag, modifiedAt: null });
const base = "https://files.example.test/music";

test("private administration state is not an unused or duplicate audio candidate", () => {
  const report = auditStorage([object("__admin__/brstm-wav-review-v1.enc")], [], base);
  assert.equal(report.unusedCount, 0);
  assert.equal(report.duplicateGroups, 0);
  assert.equal(report.usedBytes, 100);
});

test("private/normal/lap3 references protect files, URL-encoded names resolve, external same-key URLs do not", () => {
  const report = auditStorage([object("brstm-files/a b"), object("previews/lap3"), object("previews/orphan")], [
    { url: `${base}/brstm-files/a%20b?download=1`, label: "private normal" },
    { url: `${base}/previews/lap3`, label: "private lap3" },
    { url: "https://other.test/music/previews/orphan", label: "external" },
  ], base);
  assert.deepEqual(report.unused.map((file) => file.key), ["previews/orphan"]);
  assert.equal(report.externalReferences, 1);
  assert.equal(report.reclaimableCandidateBytes, 200);
});

test("shared URLs are not duplicate stored files; same size alone and multipart tags do not prove duplicates", () => {
  const report = auditStorage([object("a"), object("b", 100, "b".repeat(32)), object("c", 100, `${hash}-2`)], [
    { url: `${base}/a`, label: "normal" }, { url: `${base}/a`, label: "lap3" },
  ], base);
  assert.equal(report.duplicateGroups, 0);
  assert.equal(report.sharedObjects.length, 1);
  assert.equal(report.fingerprintUncheckedCount, 1);
});

test("unused and duplicate candidates are combined without double counting", () => {
  const report = auditStorage([object("a"), object("b"), object("c"), object("d", 50, "c".repeat(32))], [
    { url: `${base}/a`, label: "normal" }, { url: `${base}/b`, label: "lap3" },
    { url: `${base}/missing`, label: "missing" }, { url: "bad-url", label: "invalid" },
  ], base);
  assert.equal(report.unusedBytes, 150);
  assert.equal(report.duplicateExtraBytes, 200);
  assert.equal(report.reclaimableCandidateBytes, 250);
  assert.equal(report.missing.length, 1);
  assert.equal(report.invalidReferences.length, 1);
});
