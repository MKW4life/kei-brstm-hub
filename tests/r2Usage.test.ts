import assert from "node:assert/strict";
import test from "node:test";
import { measureR2Usage, FREE_STORAGE_BYTES } from "../lib/r2Usage.ts";

test("counts every page, including previews and unregistered objects", async () => {
  const inputs: unknown[] = [];
  const result = await measureR2Usage(async (command) => {
    inputs.push(command.input);
    return inputs.length === 1
      ? { $metadata: {}, Contents: [{ Key: "brstm-files/a", Size: 100 }, { Key: "previews/b", Size: 200 }], IsTruncated: true, NextContinuationToken: "page2" }
      : { $metadata: {}, Contents: [{ Key: "unregistered", Size: 300 }] };
  }, "music");
  assert.equal(result.usedBytes, 600);
  assert.equal(result.objectCount, 3);
  assert.equal(result.remainingBytes, FREE_STORAGE_BYTES - 600);
  assert.equal(result.overageBytes, 0);
  assert.deepEqual(inputs, [
    { Bucket: "music", MaxKeys: 1000, ContinuationToken: undefined },
    { Bucket: "music", MaxKeys: 1000, ContinuationToken: "page2" },
  ]);
});

test("empty buckets have the full reference allowance", async () => {
  const result = await measureR2Usage(async () => ({ $metadata: {} }), "music");
  assert.equal(result.usedBytes, 0);
  assert.equal(result.objectCount, 0);
  assert.equal(result.remainingBytes, FREE_STORAGE_BYTES);
});

test("overage is reported without a negative remaining capacity", async () => {
  const result = await measureR2Usage(async () => ({ $metadata: {}, Contents: [{ Size: FREE_STORAGE_BYTES + 45 }] }), "music");
  assert.equal(result.remainingBytes, 0);
  assert.equal(result.overageBytes, 45);
});

test("failed or incomplete listings never return misleading partial totals", async () => {
  await assert.rejects(measureR2Usage(async () => { throw new Error("AccessDenied"); }, "music"), /AccessDenied/);
  await assert.rejects(measureR2Usage(async () => ({ $metadata: {}, IsTruncated: true }), "music"), /Incomplete/);
  await assert.rejects(measureR2Usage(async () => ({ $metadata: {}, IsTruncated: true, NextContinuationToken: "same" }), "music"), /Incomplete/);
});
