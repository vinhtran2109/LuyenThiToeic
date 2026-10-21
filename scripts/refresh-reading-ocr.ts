/**
 * Làm mới OCR phần Reading và vá lại nội dung câu hỏi trong DB.
 *
 * Bản scan ở 1600px hay đọc hỏng nhãn “(B)” thành “io”, “2)”. Script này OCR
 * lại ở 2400px, trích câu hỏi + lựa chọn rồi cập nhật prompt/options —
 * giữ nguyên đáp án, trạng thái chấm và ảnh trang.
 *
 * Chạy: npx tsx scripts/refresh-reading-ocr.ts [documentId]
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { scanPdf } from "../server/pdf-ocr";
import { extractReadingQuestions } from "../server/reading-questions";
import type { ScannedPage } from "../server/pdf-ocr";

const db = new PrismaClient();
const documentId =
  process.argv[2] || "e2ac1f15-5d96-42d7-945d-301b4a9c6f97";
const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
const outputDir = `uploads/import-${doc.id}`;
let last = 0;
// Bản scan có sẵn ở 1600px — phóng lên 2400px chỉ là nội suy nên không tốt
// hơn, thậm chí tesseract bỏ sót dòng. Đọc bản native, bản 2400px dùng để
// bù cho câu bị thiếu lựa chọn.
const pages = await scanPdf(
  path.resolve("." + doc.path),
  outputDir,
  (p) => {
    if (Date.now() - last > 5000) {
      last = Date.now();
      console.log(`OCR ${p.done}/${p.total} — ${p.message}`);
    }
  },
);
console.log(`OCR xong ${pages.length} trang.`);

const hiresPages: ScannedPage[] = [];
try {
  for (const file of await fs.readdir(outputDir)) {
    const m = /^page-(\d{3})@2400\.json$/.exec(file);
    if (!m) continue;
    hiresPages.push(
      JSON.parse(await fs.readFile(path.join(outputDir, file), "utf8")),
    );
  }
} catch {}
console.log(`Bản 2400px dùng để bù: ${hiresPages.length} trang.`);

const tests = await db.test.findMany({
  where: { section: "reading" },
  orderBy: { id: "asc" },
});
let fixed = 0;
let stillBroken = 0;
for (const test of tests) {
  const index = Number(test.id.split("-").pop());
  const start = test.sourceStartPage ?? index * 29 - 28;
  const end = test.sourceEndPage ?? index * 29;
  const found = extractReadingQuestions(pages, start, end);
  const hires = extractReadingQuestions(hiresPages, start, end);
  const questions = await db.question.findMany({
    where: { testId: test.id },
    orderBy: { number: "asc" },
  });
  for (const q of questions) {
    const next = found.get(q.number) ?? hires.get(q.number);
    const alt = hires.get(q.number);
    if (!next) {
      stillBroken++;
      await db.question.update({
        where: { id: q.id },
        data: { needsReview: true },
      });
      console.log(`  chưa tìm thấy: Test ${index} Q${q.number}`);
      continue;
    }
    // Bản 2400px bù cho lựa chọn bị mất ở bản native.
    const options = next.options.map((o, i) => {
      const value = o.trim();
      if (value) return value;
      return (alt?.options[i] ?? "").trim();
    });
    if (options.length !== 4 || options.some((o) => !o)) {
      stillBroken++;
      await db.question.update({
        where: { id: q.id },
        data: { needsReview: true },
      });
      console.log(
        `  thiếu lựa chọn: Test ${index} Q${q.number} -> ${options.join(" | ")}`,
      );
      continue;
    }
    const prompt =
      next.prompt.trim() ||
      alt?.prompt.trim() ||
      `Điền từ đúng vào chỗ trống ${q.number} trong bức thư/đoạn văn.`;
    await db.question.update({
      where: { id: q.id },
      data: {
        prompt,
        options: JSON.stringify(options),
        passage:
          "Câu hỏi và lựa chọn đã được trích từ bản scan. Đoạn văn, bảng biểu và hình minh hoạ vẫn nằm trong ảnh trang gốc.",
        needsReview: false,
      },
    });
    fixed++;
  }
}
console.log(`Đã cập nhật ${fixed} câu, còn ${stillBroken} câu cần xem lại.`);
await db.$disconnect();
