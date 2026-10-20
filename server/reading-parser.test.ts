import { test } from "node:test";
import assert from "node:assert/strict";
import { numberAnchors, parseReading, referenceGroups } from "./reading-parser";
import type { ScannedPage, Word } from "./pdf-ocr";
function word(text: string, x = 100, y = 300): Word {
  return { text, x, y, width: 30, height: 20, confidence: 95 };
}
function page(n: number, words: Word[] = [], text = ""): ScannedPage {
  return {
    page: n,
    width: 1000,
    height: 1400,
    image: `page-${n}.jpg`,
    text,
    words,
    confidence: 95,
  };
}
test("OCR anchors exclude numbers in passages, footer and unpunctuated prices", () => {
  assert.deepEqual(
    numberAnchors(
      page(2, [
        word("101."),
        word("200", 100, 300),
        word("150.", 300, 200),
        word("120.", 100, 1350),
        word("99."),
      ]),
    ).map((a) => a.number),
    [101],
  );
});
test("Reading import preserves 30/16/54 parts and marks missing locations for review", () => {
  const parsed = parseReading([page(2, [word("101."), word("102.")])], {
    testCount: 1,
    pagesPerTest: 29,
    coverPages: 1,
    titlePrefix: "Test",
  })[0];
  assert.equal(parsed.locations.length, 100);
  assert.deepEqual(
    [5, 6, 7].map((p) => parsed.locations.filter((q) => q.part === p).length),
    [30, 16, 54],
  );
  assert.equal(parsed.locations[0].needsReview, false);
  assert.equal(parsed.locations[2].needsReview, true);
  assert.equal(parsed.startPage, 2);
  assert.equal(parsed.endPage, 29);
});
test("Multiple-passage groups include source pages and question page together", () => {
  const pages = [
    page(
      28,
      [],
      "Questions 196–200 refer to the following invoice and e-mail.",
    ),
    page(
      29,
      [196, 197, 198, 199, 200].map((n, i) =>
        word(n + ".", 100, 400 + i * 100),
      ),
    ),
  ];
  assert.deepEqual(referenceGroups(pages[0]), [
    { start: 196, end: 200, page: 28 },
  ]);
  const q = parseReading(pages, {
    testCount: 1,
    pagesPerTest: 29,
    coverPages: 1,
    titlePrefix: "Test",
  })[0].locations.find((q) => q.number === 196)!;
  assert.equal(q.page, 29);
  assert.deepEqual(q.sourcePages, [28, 29]);
  assert.equal(q.groupId, "r1-196-200");
});
test("Verified manual page mapping resolves an OCR miss without inventing text or answers", () => {
  const q = parseReading(
    [page(2, [word("101.")])],
    { testCount: 1, pagesPerTest: 29, coverPages: 1, titlePrefix: "Test" },
    { "1": { "102": 2 } },
  )[0].locations[1];
  assert.equal(q.page, 2);
  assert.equal(q.raw, "manual");
  assert.equal(q.needsReview, false);
});
