import { test } from "node:test";
import assert from "node:assert/strict";
import { partOf, grade, mappingConflict, inSection } from "./core";
test("TOEIC has exactly 6,25,39,30,30,16,54 questions per part", () => {
  const ns = Array.from({ length: 200 }, (_, i) => i + 1);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((p) => ns.filter((n) => partOf(n) === p).length),
    [6, 25, 39, 30, 30, 16, 54],
  );
  assert.equal(partOf(201), 0);
});
test("only confirmed answer keys are graded, unanswered confirmed questions count as wrong", () => {
  assert.deepEqual(
    grade(
      [
        { number: 1, answer: null, confirmed: false },
        { number: 2, answer: "A", confirmed: false },
        { number: 3, answer: "B", confirmed: true },
        { number: 4, answer: "C", confirmed: true },
      ],
      { "1": "A", "2": "A", "3": "B" },
    ),
    { gradable: 2, correct: 1 },
  );
});
test("mapping rejects duplicate question ranges and overlapping audio, accepts adjacent segments", () => {
  const a = {
    questionStart: 1,
    questionEnd: 3,
    documentId: "audio",
    start: 0,
    end: 10,
  };
  assert.equal(mappingConflict(a, { ...a, documentId: "other" }), true);
  assert.equal(
    mappingConflict(a, {
      ...a,
      questionStart: 4,
      questionEnd: 6,
      start: 9,
      end: 20,
    }),
    true,
  );
  assert.equal(
    mappingConflict(a, {
      ...a,
      questionStart: 4,
      questionEnd: 6,
      start: 10,
      end: 20,
    }),
    false,
  );
});
test("section boundaries preserve exactly 100 questions", () => {
  const ns = Array.from({ length: 200 }, (_, i) => i + 1);
  assert.equal(ns.filter((n) => inSection(n, "reading")).length, 100);
  assert.equal(inSection(100, "listening"), true);
  assert.equal(inSection(101, "listening"), false);
});
