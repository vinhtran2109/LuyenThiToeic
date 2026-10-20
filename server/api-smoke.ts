// Run against the local development server: npx tsx server/api-smoke.ts
// Creates temporary QA data and removes only its own records in finally.
import { listeningGroups } from "./audio-domain.js";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
const db = new PrismaClient(),
  base = "http://127.0.0.1:3001/api";
const attempts: string[] = [],
  documents: { id: string; path: string }[] = [],
  mappings: string[] = [];
async function request(
  route: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
try {
  const list = await request("/tests");
  assert.equal(list.status, 200);
  assert.ok(list.data.length >= 3);
  const test = await request("/tests/sample-3");
  assert.equal(test.data.questions.length, 200);
  assert.equal(test.data.questions[100].answer, undefined);
  let exam = await request("/attempts", {
    testId: "sample-3",
    mode: "exam",
    section: "all",
  });
  assert.equal(exam.status, 400);
  const made = await request("/attempts", {
    testId: "sample-3",
    mode: "practice",
    section: "reading",
  });
  assert.equal(made.status, 200);
  const id = made.data.id;
  attempts.push(id);
  const editor = await request("/editor/sample-3");
  const answer = editor.data.questions.find(
    (q: any) => q.number === 101,
  ).answer;
  const state = { answers: { "101": answer }, flags: [101], current: 102 };
  const saved = await request("/attempts/" + id, state, "PUT");
  assert.equal(saved.data.current, 102);
  const restored = await request("/attempts/" + id);
  assert.deepEqual(restored.data.answers, state.answers);
  assert.deepEqual(restored.data.flags, [101]);
  assert.equal(restored.data.deadline, made.data.deadline);
  const bad = await request(
    "/attempts/" + id,
    { ...state, answers: { "1": "A" } },
    "PUT",
  );
  assert.equal(bad.status, 400);
  const result = await request("/attempts/" + id + "/submit", state);
  assert.equal(result.data.correct, 1);
  assert.equal(result.data.gradable, 100);
  assert.equal(result.data.status, "completed");
  const again = await request("/attempts/" + id + "/submit", {
    ...state,
    answers: {},
  });
  assert.equal(again.data.correct, 1);
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const form = new FormData();
  form.append(
    "file",
    new Blob([wav], { type: "audio/wav" }),
    "qa-only-silence.wav",
  );
  form.append("kind", "audio");
  const uploaded = await fetch(base + "/documents", {
    method: "POST",
    body: form,
  });
  assert.equal(uploaded.status, 200);
  const doc = await uploaded.json();
  documents.push(doc);
  const map = {
    testId: "sample-3",
    documentId: doc.id,
    part: 1,
    questionStart: 1,
    questionEnd: 1,
    groupId: "q-1",
    start: 0,
    end: 0.5,
    sequence: 900,
    gap: 0,
  };
  const mapping = await request("/mappings", map);
  assert.equal(mapping.status, 200);
  mappings.push(mapping.data.id);
  const duplicate = await request("/mappings", { ...map, sequence: 901 });
  assert.equal(duplicate.status, 400);
  const update = await request(
    "/mappings/" + mapping.data.id,
    { ...map, end: 0.8 },
    "PUT",
  );
  assert.equal(update.status, 200);
  assert.equal(update.data.end, 0.8);
  const invalidKey = await request("/keys/sample-3", { "7": "D" });
  assert.equal(invalidKey.status, 400);
  await db.audioMapping.deleteMany({ where: { id: { in: mappings } } });
  for (const [i, group] of listeningGroups.entries()) {
    const r = await request("/mappings", {
      ...map,
      part: group.part,
      questionStart: group.questionStart,
      questionEnd: group.questionEnd,
      start: i / 100,
      end: (i + 1) / 100,
      sequence: i + 1,
      groupId: "qa-" + i,
    });
    assert.equal(r.status, 200);
    mappings.push(r.data.id);
  }
  exam = await request("/attempts", {
    testId: "sample-3",
    mode: "exam",
    section: "all",
  });
  assert.equal(exam.status, 200);
  attempts.push(exam.data.id);
  const began = await request("/attempts/" + exam.data.id + "/begin", {});
  assert.equal(began.data.phase, "listening");
  const reading = await request(
    "/attempts/" + exam.data.id,
    { answers: {}, flags: [], current: 101, audioIndex: 4, audioPosition: 0 },
    "PUT",
  );
  assert.equal(reading.data.phase, "reading");
  assert.ok(
    Math.abs(
      new Date(reading.data.deadline).getTime() - Date.now() - 75 * 60000,
    ) < 2000,
  );
  await db.attempt.update({
    where: { id: exam.data.id },
    data: { deadline: new Date(Date.now() - 1000) },
  });
  const expired = await request(
    "/attempts/" + exam.data.id,
    { answers: { "101": answer }, flags: [], current: 101 },
    "PUT",
  );
  assert.equal(expired.data.status, "completed");
  assert.equal(expired.data.correct, 0);
  const stream = "BT /F1 18 Tf 40 700 Td (QA sample text only) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pdfForm = new FormData();
  pdfForm.append(
    "file",
    new Blob([pdf], { type: "application/pdf" }),
    "qa-only-text.pdf",
  );
  pdfForm.append("kind", "reading");
  const pdfResponse = await fetch(base + "/documents", {
    method: "POST",
    body: pdfForm,
  });
  const pdfDoc = await pdfResponse.json();
  assert.equal(pdfResponse.status, 200);
  documents.push(pdfDoc);
  assert.equal(pdfDoc.status, "review");
  assert.match(pdfDoc.text, /QA sample text only/);
  console.log(
    "API smoke passed: 200-question structure, grading/persistence, strict exam gate/begin/Reading timer/expiry, audio upload/mapping conflicts/update, PDF text extraction, invalid answer key.",
  );
} finally {
  await db.audioMapping.deleteMany({ where: { id: { in: mappings } } });
  await db.attempt.deleteMany({ where: { id: { in: attempts } } });
  await db.document.deleteMany({
    where: { id: { in: documents.map((d) => d.id) } },
  });
  for (const doc of documents) await fs.unlink("." + doc.path).catch(() => {});
  await db.$disconnect();
}
