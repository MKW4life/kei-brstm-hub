import test from "node:test";
import assert from "node:assert/strict";
import { parseUploadFilename } from "../lib/uploadFilename.ts";

test("explicit bilingual names populate both fields and recognize bracketed Lap3 across formats", () => {
  assert.deepEqual(parseUploadFilename("時の歯車 __ Time Gear.brstm"), { title: "時の歯車", titleEn: "Time Gear", isLap3: false });
  for (const extension of ["brstm", "mp3", "ogg", "wav"]) {
    assert.deepEqual(parseUploadFilename(`時の歯車 __ Time Gear [Lap3].${extension}`), { title: "時の歯車", titleEn: "Time Gear", isLap3: true });
  }
});

test("numbers, 'Final' and punctuation inside titles are not interpreted as lap markers", () => {
  assert.deepEqual(parseUploadFilename("最終峠3 __ Final Pass 3 (Part 1-2).brstm"), { title: "最終峠3", titleEn: "Final Pass 3 (Part 1-2)", isLap3: false });
  assert.deepEqual(parseUploadFilename("名_前 __ Mr. Mime - Theme [lap 3].BRSTM"), { title: "名_前", titleEn: "Mr. Mime - Theme", isLap3: true });
});

test("legacy, ambiguous and incomplete names stay on the existing parser", () => {
  for (const file of ["Song lap3.brstm", "曲名 - English.brstm", "a__b.brstm", "a __ b __ c.brstm", "a __ .brstm"]) {
    assert.equal(parseUploadFilename(file), null);
  }
});
