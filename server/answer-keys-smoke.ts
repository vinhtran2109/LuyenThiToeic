import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PrismaClient(),
  made: string[] = [],
  base = "http://127.0.0.1:3001/api";
async function req(
  route: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const r = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, 200, data.error);
  return data;
}
try {
  const source = JSON.parse(
    await fs.readFile("artifacts/answer-keys/extracted.json", "utf8"),
  );
  const sets = await req("/answer-keys");
  assert.equal(sets.length, 20);
  for (const code of ["RC", "LC"])
    for (let n = 1; n <= 10; n++) {
      const row = await db.answerKeySet.findUniqueOrThrow({
        where: { id: `ets2024-${code.toLowerCase()}-${n}` },
      });
      assert.deepEqual(JSON.parse(row.answers), source[code].tests[n].answers);
      assert.equal(row.sourcePage, source[code].tests[n].page);
      assert.equal(row.sourceSha256, source[code].sha256);
      const download = await req(`/answer-keys/${row.id}.json`);
      assert.deepEqual(download, source[code].tests[n].answers);
      if (code === "LC") {
        assert.equal(row.status, "pending");
        assert.equal(row.testId, null);
        continue;
      }
      assert.equal(row.status, "applied");
      assert.ok(row.testId);
      const expected = source.RC.tests[n].answers;
      const questions = await db.question.findMany({
        where: { testId: row.testId },
      });
      assert.equal(questions.length, 100);
      assert.ok(
        questions.every((q) => q.confirmed && q.answer === expected[q.number]),
      );
      const publicTest = await req("/tests/" + row.testId);
      assert.ok(
        publicTest.questions.every(
          (q: any) => q.answer === undefined && q.explanation === undefined,
        ),
      );
      const attempt = await req("/attempts", {
        testId: row.testId,
        mode: "practice",
        section: "reading",
      });
      made.push(attempt.id);
      const active = await req("/attempts/" + attempt.id);
      assert.ok(active.test.questions.every((q: any) => !("answer" in q)));
      const result = await req("/attempts/" + attempt.id + "/submit", {
        answers: expected,
        flags: [],
        current: 200,
      });
      assert.equal(result.correct, 100);
      assert.equal(result.gradable, 100);
      assert.equal(result.score, null);
      const review = await req("/attempts/" + attempt.id);
      assert.ok(
        review.test.questions.every(
          (q: any) => q.answer === expected[q.number],
        ),
      );
    }
  const first = await db.answerKeySet.findUniqueOrThrow({
    where: { id: "ets2024-rc-1" },
  });
  const answers = JSON.parse(first.answers);
  answers["101"] = answers["101"] === "A" ? "B" : "A";
  delete answers["102"];
  const a = await req("/attempts", {
    testId: first.testId,
    mode: "practice",
    section: "reading",
  });
  made.push(a.id);
  const result = await req("/attempts/" + a.id + "/submit", {
    answers,
    flags: [101, 102],
    current: 200,
  });
  assert.equal(result.correct, 98);
  assert.equal(result.gradable, 100);
  const b = await req("/attempts", {
    testId: first.testId,
    mode: "practice",
    section: "reading",
  });
  made.push(b.id);
  const blank = await req("/attempts/" + b.id + "/submit", {
    answers: {},
    flags: [],
    current: 101,
  });
  assert.equal(blank.correct, 0);
  assert.equal(blank.gradable, 100);
  const report = {
    status: "passed",
    rcTests: 10,
    rcAnswers: 1000,
    lcSetsPending: 10,
    lcAnswers: 1000,
    perfectScores: "10 x 100/100",
    wrongAndBlank: "98/100",
    blank: "0/100",
    answersHiddenUntilSubmission: true,
    sourceExtraction: "text layer + spatial TEST labels (not OCR)",
    officialScaledScoreInvented: false,
  };
  await fs.writeFile(
    "artifacts/answer-keys/verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await db.attempt.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
}
