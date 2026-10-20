import test from "node:test";
import assert from "node:assert/strict";
import { parseListening, buildLines } from "./listening-parser";
import { spokenQuestions } from "./listening-transcript";
import type { ScannedPage, Word } from "./pdf-ocr";

/** Dựng trang giả từ các dòng chữ, mỗi dòng một cột tại x cho trước. */
function fakePage(
  page: number,
  columns: { x: number; lines: string[] }[],
): ScannedPage {
  const words: Word[] = [];
  let y = 100;
  for (const column of columns) {
    for (const line of column.lines) {
      let x = column.x;
      for (const token of line.split(" ")) {
        words.push({
          text: token,
          confidence: 90,
          x,
          y,
          width: token.length * 10,
          height: 20,
        });
        x += token.length * 10 + 8;
      }
      y += 34;
    }
  }
  return { page, width: 1600, height: 2200, image: "", text: "", confidence: 90, words };
}

const config = { testCount: 1, pagesPerTest: 13, coverPages: 1, titlePrefix: "1000 Listening" };

test("hai cột được tách và câu hỏi ghép đúng lựa chọn", () => {
  const page = fakePage(2, [
    {
      x: 150,
      lines: [
        "32. What event does the woman mention?",
        "(A) A job fair",
        "(B) A cooking class",
        "(C) A fund-raiser",
        "(D) A company picnic",
        "33. What does the woman ask for?",
        "(A) A guest list",
        "(B) A dessert recipe",
        "(C) A business card",
        "(D) A promotional code",
      ],
    },
    {
      x: 850,
      lines: [
        "34. What does the man recommend doing?",
        "(A) Returning some merchandise",
        "(B) Watching a video",
        "(C) Creating an account",
        "(D) Reading a review",
        "35. What department do the speakers most likely",
        "work in?",
        "(A) Accounting",
        "(B) Research and development",
        "(C) Maintenance",
        "(D) Marketing",
      ],
    },
  ]);
  const parsed = parseListening([page], config);
  const questions = parsed.tests[0].questions;
  assert.equal(questions.length, 4);
  const q32 = questions.find((q) => q.number === 32)!;
  assert.equal(q32.prompt, "What event does the woman mention?");
  assert.deepEqual(q32.options, [
    "A job fair",
    "A cooking class",
    "A fund-raiser",
    "A company picnic",
  ]);
  assert.equal(q32.part, 3);
  assert.equal(q32.groupId, "p3-0");
  const q35 = questions.find((q) => q.number === 35)!;
  assert.equal(q35.prompt, "What department do the speakers most likely work in?");
  assert.deepEqual(q35.options, [
    "Accounting",
    "Research and development",
    "Maintenance",
    "Marketing",
  ]);
});

test("số câu bị rơi trong OCR được khôi phục theo thứ tự", () => {
  const page = fakePage(2, [
    {
      x: 150,
      lines: [
        "44. What does the man ask about?",
        "(A) One thing",
        "(B) Two things",
        "(C) Three things",
        "(D) Four things",
        ". Where does the woman most likely work?",
        "(A) At a university",
        "(B) At a publishing company",
        "(C) At an electronics store",
        "(D) At a grocery store",
      ],
    },
  ]);
  const parsed = parseListening([page], config);
  const q = parsed.tests[0].questions.find((x) => x.number === 45)!;
  assert.ok(q, "câu 45 phải được khôi phục");
  assert.equal(q.prompt, "Where does the woman most likely work?");
  assert.deepEqual(q.options, [
    "At a university",
    "At a publishing company",
    "At an electronics store",
    "At a grocery store",
  ]);
});

test("chỉ lấy câu in sẵn, Part 1 và Part 2 nằm trong audio", () => {
  const page = fakePage(2, [
    {
      x: 150,
      lines: [
        "1. Look at the picture marked number 1 in your test book.",
        "2. Look at the picture marked number 2 in your test book.",
        "7. Mark your answer on your answer sheet.",
      ],
    },
  ]);
  const parsed = parseListening([page], config);
  assert.equal(parsed.tests[0].questions.length, 0);
});

test("mốc số câu trong transcript lấy được lựa chọn Part 1", () => {
  const spoken = spokenQuestions(
    [
      { start: 0, end: 1, text: "Number 1. Look at the picture marked number 1 in your test book." },
      { start: 1, end: 2, text: "A. She's eating in a picnic area." },
      { start: 2, end: 3, text: "B. She's waiting in line at a food truck." },
      { start: 3, end: 4, text: "C. She's wiping off a bench." },
      { start: 4, end: 5, text: "D. She's throwing away a plate." },
    ],
    [1],
  );
  assert.deepEqual(spoken.get(1)?.options, [
    "She's eating in a picnic area.",
    "She's waiting in line at a food truck.",
    "She's wiping off a bench.",
    "She's throwing away a plate.",
  ]);
  assert.equal(spoken.get(1)?.prompt, "");
});

test("câu Part 2 lấy được thân câu và ba lựa chọn", () => {
  const spoken = spokenQuestions(
    [
      { start: 0, end: 1, text: "Number 18." },
      { start: 1, end: 2, text: "How often do you travel for your job?" },
      { start: 2, end: 3, text: "A." },
      { start: 3, end: 4, text: "It turned out well." },
      { start: 4, end: 5, text: "B. Yes, I did find one." },
      { start: 5, end: 6, text: "C. About once a month." },
    ],
    [18],
  );
  const q = spoken.get(18)!;
  assert.equal(q.prompt, "How often do you travel for your job?");
  assert.deepEqual(q.options, [
    "It turned out well.",
    "Yes, I did find one.",
    "About once a month.",
    "",
  ]);
});

test("dòng chuyển phần trong audio không lẫn vào lựa chọn", () => {
  const spoken = spokenQuestions(
    [
      { start: 0, end: 1, text: "Number 31." },
      { start: 1, end: 2, text: "What type of job are you looking for?" },
      { start: 2, end: 3, text: "A. No, at 10 a.m." },
      { start: 3, end: 4, text: "B. I really like working with computers." },
      { start: 4, end: 5, text: "C. Just a resume is needed." },
      { start: 5, end: 6, text: "Part 3. Directions. You will hear some conversations." },
    ],
    [31],
  );
  assert.deepEqual(spoken.get(31)?.options, [
    "No, at 10 a.m.",
    "I really like working with computers.",
    "Just a resume is needed.",
    "",
  ]);
});

test("dòng được gom theo toạ độ dọc", () => {
  const words: Word[] = [
    { text: "32.", confidence: 90, x: 150, y: 100, width: 30, height: 20 },
    { text: "What", confidence: 90, x: 200, y: 101, width: 40, height: 20 },
    { text: "event?", confidence: 90, x: 250, y: 102, width: 50, height: 20 },
    { text: "(A)", confidence: 90, x: 200, y: 140, width: 30, height: 20 },
  ];
  const lines = buildLines(words);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "32. What event?");
  assert.equal(lines[1].text, "(A)");
});
