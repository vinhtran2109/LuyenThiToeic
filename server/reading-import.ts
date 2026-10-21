import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { scanPdf } from "./pdf-ocr";
import { parseReading, type ReadingConfig } from "./reading-parser";
import { extractReadingQuestions } from "./reading-questions";
const running = new Set<string>();
export async function runReadingImport(
  db: PrismaClient,
  jobId: string,
  config: ReadingConfig,
) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const doc = await db.document.findUniqueOrThrow({
      where: { id: job.documentId },
    });
    const outputDir = `uploads/import-${doc.id}`;
    let last = 0;
    const pages = await scanPdf(
      path.resolve("." + doc.path),
      outputDir,
      (p) => {
        if (Date.now() - last > 700 || p.done === p.total) {
          last = Date.now();
          void db.importJob
            .update({
              where: { id: jobId },
              data: {
                status: "ocr",
                done: p.done,
                total: p.total,
                message: p.message,
              },
            })
            .catch(() => {});
        }
      },
      undefined,
      // Bản scan cần độ phân giải cao: ở 1600px tesseract hay đọc hỏng
      // nhãn “(A)” thành “io”, “2)” và làm mất lựa chọn.
      2400,
    );
    if (pages.length !== config.testCount * config.pagesPerTest)
      throw Error(
        `PDF có ${pages.length} trang, cấu hình cần ${config.testCount * config.pagesPerTest} trang. Hãy kiểm tra lại ranh giới đề.`,
      );
    let overrides = {};
    try {
      overrides = JSON.parse(
        await fs.readFile(path.join(outputDir, "overrides.json"), "utf8"),
      );
    } catch {}
    const parsed = parseReading(pages, config, overrides);
    const result = [];
    for (const item of parsed) {
      const testId = `reading-${doc.id}-${item.index}`;
      const existing = await db.test.findUnique({
        where: { id: testId },
        include: { _count: { select: { attempts: true } } },
      });
      if (existing?._count.attempts)
        throw Error("Đề đã có bài làm. Không ghi đè nội dung để giữ lịch sử.");
      const data = {
        title: `${config.titlePrefix} · Test ${String(item.index).padStart(2, "0")}`,
        year: 0,
        collection: config.titlePrefix,
        description:
          "Reading từ PDF của bạn · 100 câu · Bản scan gốc · Chưa có đáp án xác nhận",
        section: "reading",
        sourceDocumentId: doc.id,
        sourceStartPage: item.startPage,
        sourceEndPage: item.endPage,
        published: false,
      };
      // Câu hỏi và lựa chọn có sẵn trong bản scan — dùng chữ thật, chỉ khi
      // đọc đủ 4 lựa chọn mới thay bản mặc định.
      const extracted = extractReadingQuestions(pages, item.startPage, item.endPage);
      await db.$transaction(async (tx) => {
        await tx.test.upsert({
          where: { id: testId },
          create: { id: testId, ...data },
          update: data,
        });
        await tx.question.deleteMany({ where: { testId } });
        await tx.question.createMany({
          data: item.locations.map((q) => {
            const found = extracted.get(q.number);
            const options =
              found && found.options.length === 4 && found.options.every((o) => o)
                ? found.options
                : ["A — theo bản gốc", "B — theo bản gốc", "C — theo bản gốc", "D — theo bản gốc"];
            const prompt =
              found && found.prompt.trim()
                ? found.prompt.trim()
                : q.part === 6
                  ? `Điền từ đúng vào chỗ trống ${q.number} trong bức thư/đoạn văn.`
                  : `Câu ${q.number}. Đọc câu hỏi và các lựa chọn trong bản scan gốc.`;
            return {
            id: `${testId}-q${q.number}`,
            testId,
            number: q.number,
            part: q.part,
            groupId: q.groupId,
            prompt,
            options: JSON.stringify(options),
            passage:
              "Nội dung và lựa chọn được giữ trong ảnh trang gốc để bảo toàn bảng biểu và bố cục. Chưa có đáp án xác nhận; bài làm sẽ được lưu nhưng chưa chấm đúng/sai.",
            image: `/uploads/import-${doc.id}/page-${String(q.page).padStart(3, "0")}.jpg`,
            sourcePage: q.page,
            sourcePages: JSON.stringify(
              q.sourcePages.map((n) => ({
                page: n,
                url: `/uploads/import-${doc.id}/page-${String(n).padStart(3, "0")}.jpg`,
              })),
            ),
            needsReview:
              q.needsReview ||
              !(
                found &&
                found.options.length === 4 &&
                found.options.every((o) => o)
              ),
            answer: null,
            confirmed: false,
            explanation:
              "Chưa có đáp án xác nhận từ tài liệu. Bạn có thể nhập answer key trong Quản lý tài liệu.",
            };
          }),
        });
      });
      result.push({
        testId,
        index: item.index,
        startPage: item.startPage,
        endPage: item.endPage,
        questionCount: 100,
        missing: item.missing,
        anchors: item.anchors,
      });
    }
    await fs.writeFile(
      path.join(outputDir, "mapping-report.json"),
      JSON.stringify(parsed, null, 2),
    );
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: "review",
        done: pages.length,
        total: pages.length,
        message:
          "OCR hoàn tất. Kiểm tra vị trí câu hỏi trước khi đưa vào luyện tập.",
        result: JSON.stringify({
          config,
          tests: result,
          needsReview: result.reduce((n, t) => n + t.missing.length, 0),
        }),
      },
    });
  } catch (e: any) {
    await db.importJob.update({
      where: { id: jobId },
      data: { status: "error", message: e.message },
    });
  } finally {
    running.delete(jobId);
  }
}
