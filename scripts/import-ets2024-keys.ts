import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { grade, inSection } from "../server/core";

// Source extraction is spatial: scripts/extract-ets2024-keys.py.
// Refuse conflicting existing keys; preserve all question/source-page mappings.
const db = new PrismaClient();
const sourceId = "e2ac1f15-5d96-42d7-945d-301b4a9c6f97";
const extracted = JSON.parse(
  await fs.readFile("artifacts/answer-keys/extracted.json", "utf8"),
);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
try {
  const source = await db.document.findUniqueOrThrow({
    where: { id: sourceId },
  });
  assert.equal(
    sha(await fs.readFile("." + source.path)),
    sha(await fs.readFile("D:/Downloads/1000 READING (1).pdf")),
    "Reading source differs",
  );
  const tests = await db.test.findMany({
    where: { sourceDocumentId: sourceId },
    include: { questions: true, attempts: true },
  });
  assert.equal(tests.length, 10);
  await fs.mkdir("uploads/answer-keys", { recursive: true });
  const documents: any[] = [];
  for (const code of ["RC", "LC"]) {
    const data = extracted[code],
      bytes = await fs.readFile(data.source);
    assert.equal(sha(bytes), data.sha256);
    const id = "ets2024-answer-source-" + code.toLowerCase(),
      path = "/uploads/answer-keys/ets2024-" + code.toLowerCase() + ".pdf";
    await fs.writeFile("." + path, bytes);
    const text = (
      await Promise.all(
        [1, 2, 3, 4].map((n) =>
          fs.readFile(`artifacts/answer-keys/${code}-${n}.txt`, "utf8"),
        ),
      )
    ).join("\n");
    documents.push({
      id,
      name: data.source.split(/[\\/]/).pop(),
      kind: "answer-key",
      path,
      mime: "application/pdf",
      size: bytes.length,
      status: "ready",
      text,
    });
    for (const [n, set] of Object.entries<any>(data.tests)) {
      assert.equal(Object.keys(set.answers).length, 100);
      await fs.writeFile(
        `uploads/answer-keys/ets2024-${code.toLowerCase()}-test-${n}.json`,
        JSON.stringify(set.answers, null, 2),
      );
    }
  }
  let regraded = 0;
  await db.$transaction(
    async (tx) => {
      for (const doc of documents)
        await tx.document.upsert({
          where: { id: doc.id },
          create: doc,
          update: doc,
        });
      for (const code of ["RC", "LC"])
        for (let n = 1; n <= 10; n++) {
          const set = extracted[code].tests[n],
            id = `ets2024-${code.toLowerCase()}-${n}`;
          const test =
            code === "RC"
              ? tests.find((t) => Number(t.id.split("-").at(-1)) === n)
              : undefined;
          if (code === "RC") {
            assert.ok(test);
            assert.equal(test.section, "reading");
            assert.equal(test.questions.length, 100);
            assert.deepEqual(
              test.questions.map((q) => q.number).sort((a, b) => a - b),
              Array.from({ length: 100 }, (_, i) => i + 101),
            );
            for (const q of test.questions) {
              const answer = set.answers[q.number];
              assert.match(answer, /^[ABCD]$/);
              if (q.confirmed && q.answer)
                assert.equal(
                  q.answer,
                  answer,
                  `Existing key conflict: Test ${n} Q${q.number}`,
                );
              await tx.question.update({
                where: { id: q.id },
                data: {
                  answer,
                  confirmed: true,
                  explanation: `Đáp án ${answer} theo bảng đáp án ETS 2024 RC, Test ${n}, trang PDF ${set.page}. Nguồn chưa có lời giải chi tiết.`,
                },
              });
            }
            await tx.test.update({
              where: { id: test.id },
              data: {
                title: `ETS 2024 · Reading Test ${String(n).padStart(2, "0")}`,
                year: 2024,
                collection: "ETS 2024",
                description:
                  "100 câu · Part 5–7 · Bản scan gốc · Đủ 100 đáp án đã đối chiếu · Chấm bài tự động",
              },
            });
            for (const attempt of test.attempts.filter(
              (a) => a.status === "completed",
            )) {
              const questions = test.questions
                .filter((q) => inSection(q.number, attempt.section))
                .map((q) => ({
                  ...q,
                  answer: set.answers[q.number],
                  confirmed: true,
                }));
              await tx.attempt.update({
                where: { id: attempt.id },
                data: {
                  ...grade(questions, JSON.parse(attempt.answers)),
                  score: null,
                },
              });
              regraded++;
            }
          }
          const row = {
            documentId: "ets2024-answer-source-" + code.toLowerCase(),
            section: code === "RC" ? "reading" : "listening",
            testNumber: n,
            sourcePage: set.page,
            sourceRegion: JSON.stringify(set.region),
            sourceSha256: extracted[code].sha256,
            answers: JSON.stringify(set.answers),
            testId: test?.id ?? null,
            status: test ? "applied" : "pending",
            appliedAt: test ? new Date() : null,
          };
          await tx.answerKeySet.upsert({
            where: { id },
            create: { id, ...row },
            update: row,
          });
        }
    },
    { timeout: 60000 },
  );
  const report = {
    readingTests: 10,
    readingKeys: 1000,
    listeningKeysStored: 1000,
    listeningSetsPending: 10,
    regradedAttempts: regraded,
    sourceHashes: { RC: extracted.RC.sha256, LC: extracted.LC.sha256 },
    mapping:
      "spatial TEST labels; 100 unique question numbers each; RC first-page questions checked across all 10 tests",
    originalReadingUnchanged: true,
  };
  await fs.writeFile(
    "artifacts/answer-keys/import-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await db.$disconnect();
}
