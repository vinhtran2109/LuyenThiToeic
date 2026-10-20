import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3001/api";
const db = new PrismaClient();
const made: string[] = [];
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
  const d = await r.json();
  assert.equal(r.status, 200, d.error);
  return d;
}
try {
  const tests = (await req("/tests")).filter(
    (t: any) => t.sourceDocumentId === "e2ac1f15-5d96-42d7-945d-301b4a9c6f97",
  );
  assert.equal(tests.length, 10);
  let total = 0;
  const uniqueImages = new Set<string>();
  for (const t of tests) {
    assert.equal(t.section, "reading");
    assert.equal(t._count.questions, 100);
    const full = await req("/tests/" + t.id);
    assert.deepEqual(
      full.questions.map((q: any) => q.number),
      Array.from({ length: 100 }, (_, i) => 101 + i),
    );
    assert.deepEqual(
      [5, 6, 7].map(
        (p) => full.questions.filter((q: any) => q.part === p).length,
      ),
      [30, 16, 54],
    );
    for (const q of full.questions) {
      assert.equal(q.confirmed, t.keyCounts?.reading === 100);
      assert.equal(q.answer, undefined);
      assert.equal(q.needsReview, false);
      assert.equal(q.options.length, 4);
      assert.ok(
        q.sourcePage >= t.sourceStartPage && q.sourcePage <= t.sourceEndPage,
      );
      assert.ok(q.sourcePages.some((p: any) => p.page === q.sourcePage));
      assert.equal(
        q.sourcePages.filter(
          (p: any) => p.page < t.sourceStartPage || p.page > t.sourceEndPage,
        ).length,
        0,
      );
      uniqueImages.add(q.image);
      for (const p of q.sourcePages) uniqueImages.add(p.url);
    }
    total += full.questions.length;
  }
  for (const url of uniqueImages) {
    const stat = await fs.stat("." + url);
    assert.ok(stat.size > 1000);
  }
  const t = tests[0];
  const a = await req("/attempts", {
    testId: t.id,
    mode: "practice",
    section: "all",
  });
  made.push(a.id);
  assert.equal(a.section, "reading");
  assert.equal(a.current, 101);
  assert.ok(
    Math.abs(new Date(a.deadline).getTime() - Date.now() - 75 * 60000) < 3000,
  );
  const state = {
    answers: { "101": "A", "131": "D", "196": "B" },
    flags: [131],
    current: 196,
  };
  await req("/attempts/" + a.id, state, "PUT");
  const restored = await req("/attempts/" + a.id);
  assert.deepEqual(restored.answers, state.answers);
  assert.deepEqual(restored.flags, [131]);
  assert.equal(restored.current, 196);
  assert.equal(restored.deadline, a.deadline);
  assert.deepEqual(
    restored.test.questions
      .find((q: any) => q.number === 196)
      .sourcePages.map((p: any) => p.page),
    [28, 29],
  );
  const submitted = await req("/attempts/" + a.id + "/submit", state);
  assert.equal(submitted.status, "completed");
  const editor = await req("/editor/" + t.id);
  const graded = editor.questions.filter((q: any) => q.confirmed && q.answer);
  assert.equal(submitted.gradable, graded.length);
  assert.equal(
    submitted.correct,
    graded.filter(
      (q: any) =>
        state.answers[q.number as keyof typeof state.answers] === q.answer,
    ).length,
  );
  assert.equal(submitted.score, null);
  const exam = await req("/attempts", {
    testId: t.id,
    mode: "exam",
    section: "reading",
  });
  made.push(exam.id);
  assert.equal(exam.phase, "reading");
  assert.ok(
    Math.abs(new Date(exam.deadline).getTime() - Date.now() - 75 * 60000) <
      3000,
  );
  await db.attempt.update({
    where: { id: exam.id },
    data: { deadline: new Date(Date.now() - 1000) },
  });
  const expired = await req(
    "/attempts/" + exam.id,
    { answers: {}, flags: [], current: 101 },
    "PUT",
  );
  assert.equal(expired.status, "completed");
  console.log(
    `PASS: ${tests.length} Reading tests, ${total} questions, ${uniqueImages.size} original page images; 30/16/54 parts; verified positions; multi-page groups; 75-minute Reading exam; save/restore/submit; no fabricated grading.`,
  );
  await fs.writeFile(
    "artifacts/reading-import/verification.json",
    JSON.stringify(
      {
        tests: tests.length,
        questions: total,
        sourceImages: uniqueImages.size,
        structuralChecks: "passed",
        attemptLifecycle: "passed",
        readingDeadline: "passed",
        confirmedAnswerKeys: t.keyCounts?.reading || 0,
        verifiedManualLocations: 36,
      },
      null,
      2,
    ),
  );
} finally {
  await db.attempt.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
}
