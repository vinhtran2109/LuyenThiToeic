/**
 * Làm mới OCR phần Listening và vá lại nội dung câu hỏi trong DB.
 *
 * OCR lần đầu chạy ở 1600px nên hay đọc hỏng nhãn “(A)” thành “io”, “2)”
 * khiến một số câu mất lựa chọn. Script này OCR lại ở 2400px, parse lại
 * rồi cập nhật prompt/options — giữ nguyên đáp án, trạng thái chấm và ảnh.
 *
 * Chạy: npx tsx scripts/refresh-listening-ocr.ts [documentId]
 */
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { scanPdf } from "../server/pdf-ocr";
import { parseListening } from "../server/listening-parser";

const db = new PrismaClient();
const documentId =
  process.argv[2] || "fba92790-1061-4d04-b85f-5f0c78abe6f5";
const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
const outputDir = `uploads/import-${doc.id}`;
let last = 0;
const pages = await scanPdf(
  path.resolve("." + doc.path),
  outputDir,
  (p) => {
    if (Date.now() - last > 5000) {
      last = Date.now();
      console.log(`OCR ${p.done}/${p.total} — ${p.message}`);
    }
  },
  undefined,
  2400,
);
console.log(`OCR xong ${pages.length} trang.`);

const parsed = parseListening(pages, {
  testCount: 10,
  pagesPerTest: 13,
  coverPages: 1,
  titlePrefix: "ETS 2024",
});

let fixed = 0;
let stillBroken = 0;
for (const item of parsed.tests) {
  const testId = `listening-${doc.id}-${item.index}`;
  const questions = await db.question.findMany({
    where: { testId },
    orderBy: { number: "asc" },
  });
  for (const q of questions) {
    if (q.part < 3) continue; // Part 1–2 lấy từ transcript audio
    const next = item.questions.find((p) => p.number === q.number);
    const nextOptions = next?.options ?? [];
    const complete =
      !!next &&
      nextOptions.length === 4 &&
      nextOptions.every((o) => o.trim()) &&
      next.prompt.trim().length > 3;
    const current = JSON.parse(q.options) as string[];
    const currentComplete =
      current.length === 4 && current.every((o) => o.trim() && o !== "Chưa đọc được từ bản scan");
    if (complete) {
      const optionsChanged = JSON.stringify(nextOptions) !== JSON.stringify(current);
      const promptChanged = next!.prompt.trim() !== q.prompt.trim();
      if (optionsChanged || promptChanged || q.needsReview) {
        await db.question.update({
          where: { id: q.id },
          data: {
            options: JSON.stringify(nextOptions),
            prompt: next!.prompt.trim(),
            needsReview: false,
          },
        });
        fixed++;
      }
    } else if (!currentComplete) {
      stillBroken++;
      await db.question.update({
        where: { id: q.id },
        data: { needsReview: true },
      });
      console.log(
        `  còn thiếu: Test ${item.index} Q${q.number} (trang ${next?.page ?? "?"})`,
      );
    }
  }
}
console.log(`Đã vá ${fixed} câu, còn thiếu ${stillBroken} câu.`);
await db.$disconnect();
