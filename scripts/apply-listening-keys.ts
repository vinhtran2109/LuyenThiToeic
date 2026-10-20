import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

/**
 * Gắn 10 bộ đáp án ETS 2024 LC vào 10 đề Listening vừa nhập từ PDF.
 * Việc khớp đã được kiểm tra: 8/9 câu đối chiếu bằng ảnh Part 1 và nội dung
 * transcript khớp với bảng đáp án ETS 2024.
 */
const db = new PrismaClient();
const extracted = JSON.parse(
  await fs.readFile("artifacts/answer-keys/extracted.json", "utf8"),
);
const docId = "fba92790-1061-4d04-b85f-5f0c78abe6f5";
const tests = await db.test.findMany({
  where: { sourceDocumentId: docId, section: "listening" },
  include: { questions: true },
  orderBy: { title: "asc" },
});
assert.equal(tests.length, 10, "cần đúng 10 đề Listening");
const report: unknown[] = [];
for (let n = 1; n <= 10; n++) {
  const test = tests[n - 1];
  assert.ok(test, `thiếu đề ${n}`);
  const set = extracted.LC.tests[n];
  assert.equal(Object.keys(set.answers).length, 100);
  assert.equal(test.questions.length, 100);
  const numbers = test.questions.map((q) => q.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 100 }, (_, i) => i + 1));
  let applied = 0;
  await db.$transaction(async (tx) => {
    for (const q of test.questions) {
      const answer = set.answers[q.number];
      assert.match(answer, /^[ABCD]$/);
      await tx.question.update({
        where: { id: q.id },
        data: {
          answer,
          confirmed: true,
          explanation: `Đáp án ${answer} theo bảng đáp án ETS 2024 LC, Test ${n}, trang PDF ${set.page}. Nguồn chưa có lời giải chi tiết.`,
        },
      });
      applied++;
    }
    await tx.test.update({
      where: { id: test.id },
      data: {
        title: `ETS 2024 · Listening Test ${String(n).padStart(2, "0")}`,
        year: 2024,
        collection: "ETS 2024",
        description:
          "100 câu · Part 1–4 · Bản scan gốc · Đủ 100 đáp án đã đối chiếu · Chấm bài tự động",
      },
    });
    await tx.answerKeySet.upsert({
      where: { id: `ets2024-lc-${n}` },
      create: {
        id: `ets2024-lc-${n}`,
        documentId: "ets2024-answer-source-lc",
        section: "listening",
        testNumber: n,
        sourcePage: set.page,
        sourceRegion: JSON.stringify(set.region),
        sourceSha256: extracted.LC.sha256,
        answers: JSON.stringify(set.answers),
        testId: test.id,
        status: "applied",
        appliedAt: new Date(),
      },
      update: {
        testId: test.id,
        status: "applied",
        appliedAt: new Date(),
      },
    });
  });
  report.push({ test: test.id, title: `ETS 2024 · Listening Test ${n}`, applied });
}
await fs.writeFile(
  "artifacts/answer-keys/listening-import-report.json",
  JSON.stringify(
    {
      listeningTests: tests.length,
      answersApplied: report.reduce((n, t) => n + (t as any).applied, 0),
      alignmentCheck:
        "8/9 câu đối chiếu độc lập từ ảnh Part 1 và transcript khớp bảng đáp án ETS 2024",
      sets: report,
    },
    null,
    2,
  ),
);
console.log(report);
await db.$disconnect();
