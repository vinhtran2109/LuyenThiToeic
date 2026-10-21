import test from "node:test";
import assert from "node:assert/strict";
import { extractReadingQuestions } from "./reading-questions";
import type { ScannedPage, Word } from "./pdf-ocr";

/** Dựng trang giả từ các từ có toạ độ. */
function page(items: { text: string; x: number; y: number }[]): ScannedPage {
  const words: Word[] = items.map((i) => ({
    text: i.text,
    confidence: 90,
    x: i.x,
    y: i.y,
    width: Math.max(20, i.text.length * 9),
    height: 20,
  }));
  return {
    page: 2,
    width: 1600,
    height: 2200,
    image: "",
    text: "",
    confidence: 90,
    words,
  };
}

/** Trang một cột: câu hỏi + lựa chọn xếp dọc. */
function singleColumn(lines: string[], x = 150): ScannedPage {
  const items: { text: string; x: number; y: number }[] = [];
  let y = 100;
  for (const line of lines) {
    let cx = x;
    for (const token of line.split(" ")) {
      items.push({ text: token, x: cx, y });
      cx += token.length * 9 + 8;
    }
    y += 34;
  }
  return page(items);
}

test("trích được câu hỏi và lựa chọn của Part 5", () => {
  const p = singleColumn([
    "101. Former Sendai Company CEO Ken Nakata spoke about",
    "------ career experiences.",
    "(A) he",
    "(B) his",
    "(C) him",
    "(D) himself",
  ]);
  const found = extractReadingQuestions([p], 1, 5);
  const q = found.get(101)!;
  assert.ok(q);
  assert.equal(
    q.prompt,
    "Former Sendai Company CEO Ken Nakata spoke about ------ career experiences.",
  );
  assert.deepEqual(q.options, ["he", "his", "him", "himself"]);
});

test("tách hai cột câu hỏi trên cùng trang", () => {
  const items: { text: string; x: number; y: number }[] = [];
  const push = (line: string, x: number, y: number) => {
    let cx = x;
    for (const token of line.split(" ")) {
      items.push({ text: token, x: cx, y });
      cx += token.length * 9 + 8;
    }
  };
  push("147. Where is the information most likely found?", 140, 900);
  push("(A) On a door", 210, 940);
  push("(B) On a receipt", 210, 974);
  push("(C) In a box", 210, 1008);
  push("(D) On a Web site", 210, 1042);
  push("148. What kind of item is most likely discussed?", 800, 900);
  push("(A) A desktop computer", 870, 940);
  push("(B) A piece of furniture", 870, 974);
  push("(C) A household appliance", 870, 1008);
  push("(D) A power tool", 870, 1042);
  const found = extractReadingQuestions([page(items)], 1, 5);
  assert.deepEqual(found.get(147)?.options, [
    "On a door",
    "On a receipt",
    "In a box",
    "On a Web site",
  ]);
  assert.deepEqual(found.get(148)?.options, [
    "A desktop computer",
    "A piece of furniture",
    "A household appliance",
    "A power tool",
  ]);
});

test("số trong lòng đoạn văn không bị tính là câu hỏi", () => {
  const p = singleColumn([
    "Dear Mr. Dombo,",
    "Thank you for your ----- support in helping me to plan",
    "the gala for Tokyo's fashion week.",
    "135. (A) amazed",
    "(B) amazement",
    "(C) amazing",
    "(D) amazingly",
  ]);
  const found = extractReadingQuestions([p], 1, 5);
  assert.equal(found.size, 1);
  assert.deepEqual(found.get(135)?.options, [
    "amazed",
    "amazement",
    "amazing",
    "amazingly",
  ]);
});
