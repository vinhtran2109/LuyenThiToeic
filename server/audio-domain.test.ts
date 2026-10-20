import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listeningGroups,
  blankSegments,
  validateSegments,
  proposeSegments,
  transcriptAnchors,
  spokenNumber,
} from "./audio-domain";
test("54 TOEIC groups cover 100 questions with 6/25/13/10 group structure", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((p) => listeningGroups.filter((g) => g.part === p).length),
    [6, 25, 13, 10],
  );
  assert.deepEqual(
    listeningGroups.flatMap((g) =>
      Array.from(
        { length: g.questionEnd - g.questionStart + 1 },
        (_, i) => g.questionStart + i,
      ),
    ),
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
});
test("54 silence regions never prove semantic correctness or become confirmed", () => {
  const silences = Array.from({ length: 53 }, (_, i) => ({
    start: (i + 1) * 10 - 0.5,
    end: (i + 1) * 10 + 0.5,
  }));
  const result = proposeSegments(silences, 540, []);
  assert.equal(result.candidates.length, 54);
  assert.equal(result.segments.filter((s) => s.start !== null).length, 54);
  assert.ok(
    result.segments.every(
      (s) =>
        !s.confirmed && s.confidence <= 0.15 && s.evidence === "silence-only",
    ),
  );
  assert.equal(validateSegments(result.segments, 540).canPublish, false);
});
test("wrong silence count leaves unidentified groups, not guessed first 54 assignments", () => {
  const r = proposeSegments([{ start: 5, end: 7 }], 15, []);
  assert.equal(r.candidates.length, 2);
  assert.ok(r.segments.every((s) => s.start === null && s.end === null));
});
test("timestamped spoken group markers can propose boundaries, but never confirm", () => {
  const r = proposeSegments([], 100, [
    { start: 4, end: 6, text: "Question one." },
    { start: 10, end: 12, text: "Number two." },
    { start: 20, end: 22, text: "Questions thirty-two through thirty-four." },
  ]);
  assert.equal(r.segments[0].start, 0);
  assert.equal(r.segments[0].end, 10);
  assert.equal(r.segments[31].start, 20);
  assert.equal(r.segments[31].end, null);
  assert.ok(r.segments.every((s) => !s.confirmed));
  assert.equal(spokenNumber("one hundred"), 100);
  assert.equal(spokenNumber("ninety-eight"), 98);
});
test("mapping validator catches missing, overlap, duplicate groups, bad bounds and order", () => {
  const s = blankSegments().map((s, i) => ({
    ...s,
    start: i * 10,
    end: (i + 1) * 10,
    confirmed: true,
  }));
  assert.equal(validateSegments(s, 540).canPublish, true);
  assert.equal(
    validateSegments(
      s.map((x, i) => (i === 1 ? { ...x, start: 5 } : x)),
      540,
    ).overlaps.length,
    1,
  );
  assert.ok(
    validateSegments(
      s.map((x, i) =>
        i === 1 ? { ...x, part: 1, questionStart: 1, questionEnd: 1 } : x,
      ),
      540,
    ).duplicates.includes(1),
  );
  assert.ok(
    validateSegments(
      s.map((x, i) => (i === 0 ? { ...x, start: -1 } : x)),
      540,
    ).invalid.length,
  );
  assert.equal(
    validateSegments(
      s.map((x, i) => (i === 0 ? { ...x, confirmed: false } : x)),
      540,
    ).canPublish,
    false,
  );
  assert.equal(validateSegments(blankSegments(), 540).missing.length, 54);
});
test("transcript anchors use word timestamp when available", () => {
  assert.equal(
    transcriptAnchors([
      {
        start: 0,
        end: 10,
        text: "Now question one.",
        words: [
          { start: 0, end: 1, word: "Now" },
          { start: 3, end: 4, word: "question" },
          { start: 4, end: 5, word: "one" },
        ],
      },
    ])[0].time,
    3,
  );
});
