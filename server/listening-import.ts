import { PrismaClient, type Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { scanPdf } from "./pdf-ocr";
import {
  parseListening,
  type ListeningConfig,
} from "./listening-parser";
import { spokenQuestions, type SpokenQuestion } from "./listening-transcript";

const running = new Set<string>();

type PhotoRegion = { x: number; y: number; width: number; height: number };

/**
 * Tìm các khối ảnh trong trang Part 1 bằng cách đo mật độ pixel.
 * Ảnh chiếm phần lớn bề ngang của trang, còn chữ chỉ chiếm vài phần trăm —
 * đó là cách phân biệt ảnh với nhãn số câu và dòng chữ trong ảnh.
 * Nhãn số câu nằm ngoài ảnh và OCR không đọc được, nên ảnh được đánh số
 * theo thứ tự từ trên xuống.
 */
export async function detectPhotos(pageImage: string): Promise<PhotoRegion[]> {
  const img = await loadImage(pageImage);
  const w = 400;
  const h = Math.round((img.height / img.width) * w);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const notWhite = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3 < 243;
  };
  const rowFill: number[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (notWhite(x, y)) n++;
    rowFill.push((n / w) * 100);
  }
  const bands: { from: number; to: number }[] = [];
  for (let y = 0; y < h; y++) {
    if (rowFill[y] < 15) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.to <= 2) last.to = y;
    else bands.push({ from: y, to: y });
  }
  const regions: PhotoRegion[] = [];
  for (const band of bands) {
    if (band.to - band.from < h * 0.05) continue;
    const colFill: number[] = [];
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = band.from; y <= band.to; y++) if (notWhite(x, y)) n++;
      colFill.push((n / (band.to - band.from + 1)) * 100);
    }
    const cols = colFill.map((v, x) => ({ v, x })).filter((c) => c.v > 25);
    if (!cols.length) continue;
    const minX = cols[0].x;
    const maxX = cols[cols.length - 1].x;
    if (maxX - minX < w * 0.25) continue;
    const scale = img.width / w;
    const region: PhotoRegion = {
      x: Math.round(minX * scale),
      y: Math.round(band.from * scale),
      width: Math.round((maxX - minX) * scale),
      height: Math.round((band.to - band.from) * scale),
    };
    // Nhãn số câu nằm ngay bên trái mép ảnh → dấu hiệu ảnh của câu mới.
    let hasLabel = false;
    const labelFrom = Math.max(0, minX - Math.round(w * 0.06));
    const labelTo = Math.max(labelFrom + 1, minX - Math.round(w * 0.01));
    const head = band.from + Math.round((band.to - band.from) * 0.15);
    const top = Math.max(0, band.from - Math.round(h * 0.05));
    for (let y = top; y <= head; y++)
      for (let x = labelFrom; x < labelTo; x++)
        if (notWhite(x, y)) {
          hasLabel = true;
          break;
        }
    // Ảnh có vùng trắng lớn (trời tuyết) bị tách thành nhiều dải —
    // gộp lại những dải nằm sát nhau và chồng theo chiều ngang.
    const last = regions[regions.length - 1];
    if (last && !hasLabel) {
      const lastRight = last.x + last.width;
      const right = region.x + region.width;
      const overlap = Math.min(lastRight, right) - Math.max(last.x, region.x);
      const gap = region.y - (last.y + last.height);
      const narrow = Math.min(last.width, region.width);
      if (overlap > narrow * 0.5 && gap < h * scale * 0.08) {
        const bottom = Math.max(last.y + last.height, region.y + region.height);
        last.x = Math.min(last.x, region.x);
        last.width = Math.max(lastRight, right) - last.x;
        last.height = bottom - last.y;
        continue;
      }
    }
    regions.push(region);
  }
  return regions;
}

/** Cắt riêng ảnh Part 1 từ trang gốc — câu hỏi của Part 1 chính là hình ảnh. */
async function cropPhoto(
  pageImage: string,
  outFile: string,
  region: PhotoRegion,
) {
  const img = await loadImage(pageImage);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const crop = createCanvas(region.width, region.height);
  crop.getContext("2d").drawImage(
    canvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  await fs.writeFile(outFile, crop.toBuffer("image/jpeg", 86));
  return true;
}

/** Suy ra số đề từ tên file audio, ví dụ “TEST 01.mp3” → đề 01. */
function testIndexFromTitle(title: string) {
  const m = /test\s*0?(\d{1,2})/i.exec(title);
  if (!m) return null;
  const n = +m[1];
  return n >= 1 && n <= 99 ? n : null;
}

export async function runListeningImport(
  db: PrismaClient,
  jobId: string,
  config: ListeningConfig,
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
    );
    const parsed = parseListening(pages, config);
    // Part 1 và Part 2 không in trong booklet — lấy nội dung từ transcript audio.
    const projects = await db.audioProject.findMany({
      select: { id: true, title: true, transcript: true, testId: true },
    });
    const spokenByTest = new Map<number, Map<number, SpokenQuestion>>();
    const audioNotes: string[] = [];
    for (const project of projects) {
      const index = testIndexFromTitle(project.title);
      if (!index) continue;
      const transcript = JSON.parse(project.transcript || "[]") as {
        start: number;
        end: number;
        text: string;
      }[];
      if (!transcript.length) continue;
      const spoken = spokenQuestions(transcript, [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
        22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
      ]);
      if (!spoken.size) continue;
      spokenByTest.set(index, spoken);
      audioNotes.push(
        `Đề ${String(index).padStart(2, "0")}: lấy nội dung Part 1–2 từ transcript ${project.title}.`,
      );
    }
    const result = [];
    for (const item of parsed.tests) {
      const testId = `listening-${doc.id}-${item.index}`;
      const existing = await db.test.findUnique({
        where: { id: testId },
        include: { _count: { select: { attempts: true } } },
      });
      if (existing?._count.attempts)
        throw Error("Đề đã có bài làm. Không ghi đè nội dung để giữ lịch sử.");
      const spoken = spokenByTest.get(item.index) ?? null;
      // Ảnh Part 1: dò theo pixel rồi đánh số theo thứ tự trong đề.
      const photos = new Map<number, string>();
      let photoNumber = 0;
      for (const pageNumber of item.part1Pages) {
        const page = pages.find((p) => p.page === pageNumber);
        if (!page) continue;
        for (const region of await detectPhotos(page.image)) {
          photoNumber++;
          if (photoNumber > 6) break;
          const file = path.join(
            outputDir,
            `part1-q${photoNumber}-t${item.index}.jpg`,
          );
          await cropPhoto(page.image, file, region);
          photos.set(photoNumber, `/uploads/import-${doc.id}/part1-q${photoNumber}-t${item.index}.jpg`);
        }
      }
      const questions: Prisma.QuestionCreateManyInput[] = [];
      for (let number = 1; number <= 100; number++) {
        const parsedQ = item.questions.find((q) => q.number === number);
        const part = number <= 6 ? 1 : number <= 31 ? 2 : number <= 70 ? 3 : 4;
        const groupId =
          part === 3
            ? `p3-${Math.floor((number - 32) / 3)}`
            : part === 4
              ? `p4-${Math.floor((number - 71) / 3)}`
              : `q-${number}`;
        const audioQ = spoken?.get(number) ?? null;
        let image: string | null = null;
        let sourcePage: number | null = null;
        if (part === 1) {
          image = photos.get(number) ?? null;
          if (!image) {
            const page = item.part1Pages[0] ?? item.startPage;
            image = `/uploads/import-${doc.id}/page-${String(page).padStart(3, "0")}.jpg`;
            sourcePage = page;
          }
        } else {
          const page = parsedQ?.page ?? item.startPage;
          image = `/uploads/import-${doc.id}/page-${String(page).padStart(3, "0")}.jpg`;
          sourcePage = page;
        }
        // Part 1: lựa chọn nằm trong audio. Part 2: cả câu hỏi lẫn lựa chọn.
        const hasFour = audioQ && audioQ.options.filter(Boolean).length === 4;
        const hasThree = audioQ && audioQ.options.filter(Boolean).length === 3;
        const wanted = part === 2 ? 3 : 4;
        const raw =
          part === 1
            ? hasFour
              ? audioQ!.options
              : ["A", "B", "C", "D"]
            : part === 2
              ? hasThree
                ? audioQ!.options.slice(0, 3)
                : ["A", "B", "C"]
              : (parsedQ?.options ?? []);
        // Luôn đủ số lựa chọn để bài thi trả lời được; chỗ chưa đọc được
        // thì đánh dấu để người dùng sửa trong tab Biên tập câu hỏi.
        const options = Array.from({ length: wanted }, (_, i) =>
          (raw[i] ?? "").trim() || "Chưa đọc được từ bản scan",
        );
        const needsReview =
          part === 1
            ? !image
            : part === 2
              ? !hasThree
              : (parsedQ?.needsReview ?? true);
        const prompt =
          part === 1
            ? hasFour
              ? "Nhìn hình và chọn phát biểu mô tả đúng nhất."
              : "Nhìn hình và chọn phát biểu mô tả đúng nhất. Các phát biểu được đọc trong audio."
            : part === 2
              ? audioQ?.prompt ||
                "Câu hỏi và các lựa chọn được đọc trong audio của đề."
              : (parsedQ?.prompt ??
                `Câu ${number}. Nội dung chưa nhận dạng được từ bản scan.`);
        questions.push({
          id: `${testId}-q${number}`,
          testId,
          number,
          part,
          groupId,
          prompt,
          options: JSON.stringify(options),
          passage:
            part === 1
              ? "Part 1: lựa chọn được đọc trong audio."
              : "Nội dung hội thoại hoặc bài nói nằm trong audio của đề.",
          image,
          sourcePage,
          sourcePages: sourcePage
            ? JSON.stringify([
                {
                  page: sourcePage,
                  url: `/uploads/import-${doc.id}/page-${String(sourcePage).padStart(3, "0")}.jpg`,
                },
              ])
            : "[]",
          needsReview,
          answer: null,
          confirmed: false,
          explanation:
            "Chưa có đáp án xác nhận. Bạn có thể áp answer key trong Quản lý tài liệu.",
        });
      }
      const data = {
        title: `${config.titlePrefix} · Test ${String(item.index).padStart(2, "0")}`,
        year: 0,
        collection: config.titlePrefix,
        description:
          "Listening từ PDF của bạn · 100 câu · Bản scan gốc · Chưa có đáp án xác nhận",
        section: "listening",
        sourceDocumentId: doc.id,
        sourceStartPage: item.startPage,
        sourceEndPage: item.endPage,
        published: false,
      };
      await db.$transaction(async (tx) => {
        await tx.test.upsert({
          where: { id: testId },
          create: { id: testId, ...data },
          update: data,
        });
        await tx.question.deleteMany({ where: { testId } });
        await tx.question.createMany({ data: questions });
      });
      result.push({
        testId,
        index: item.index,
        startPage: item.startPage,
        endPage: item.endPage,
        questionCount: questions.length,
        missing: item.missing,
        needsReview: questions.filter((q) => q.needsReview).length,
        fromAudio: !!spokenByTest.get(item.index),
      });
    }
    await fs.writeFile(
      path.join(outputDir, "listening-mapping-report.json"),
      JSON.stringify(parsed, null, 2),
    );
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: "review",
        done: pages.length,
        total: pages.length,
        message:
          "OCR hoàn tất. Kiểm tra nội dung câu hỏi trước khi đưa vào luyện tập.",
        result: JSON.stringify({
          config,
          section: "listening",
          tests: result,
          needsReview: result.reduce((n, t) => n + t.needsReview, 0),
          audioNotes,
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
