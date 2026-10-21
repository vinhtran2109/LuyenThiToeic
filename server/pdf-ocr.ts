import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, PSM } from "tesseract.js";

export type Word = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ScannedPage = {
  page: number;
  width: number;
  height: number;
  image: string;
  text: string;
  confidence: number;
  words: Word[];
};
export type ScanProgress = {
  phase: string;
  done: number;
  total: number;
  message: string;
};
export async function scanPdf(
  pdfPath: string,
  outputDir: string,
  onProgress: (p: ScanProgress) => void = () => {},
  onlyPages?: number[],
  /** Bề rộng ảnh dùng để OCR. Bản scan nhỏ dễ đọc hỏng nhãn “(A)” nên đề Listening dùng 2400. */
  scale = 1600,
) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.resolve("uploads/.ocr-cache"), { recursive: true });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: new Uint8Array(await fs.readFile(pdfPath)),
    useSystemFonts: true,
  }).promise;
  const total = onlyPages?.length || pdf.numPages;
  let done = 0;
  const pages: ScannedPage[] = [];
  const workers = await Promise.all(
    [0, 1].map(() =>
      createWorker("eng", 1, { cachePath: path.resolve("uploads/.ocr-cache") }),
    ),
  );
  try {
    await Promise.all(
      workers.map((w) =>
        w.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: PSM.AUTO,
        }),
      ),
    );
    const queue =
      onlyPages || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    let cursor = 0;
    await Promise.all(
      workers.map(async (worker) => {
        while (cursor < queue.length) {
          const pageNumber = queue[cursor++];
          const suffix = scale === 1600 ? "" : `@${scale}`;
          const file = path.join(
            outputDir,
            `page-${String(pageNumber).padStart(3, "0")}${suffix}.json`,
          );
          let cached: ScannedPage | undefined;
          try {
            cached = JSON.parse(await fs.readFile(file, "utf8"));
          } catch {}
          if (cached) {
            pages.push(cached);
            done++;
            onProgress({
              phase: "ocr",
              done,
              total,
              message: `Đã khôi phục trang ${pageNumber}`,
            });
            continue;
          }
          const page = await pdf.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: scale / base.width });
          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          await page.render({
            canvasContext: canvas.getContext("2d") as any,
            viewport,
          }).promise;
          const imagePath = path.join(
            outputDir,
            `page-${String(pageNumber).padStart(3, "0")}.jpg`,
          );
          await fs.writeFile(imagePath, canvas.toBuffer("image/jpeg", 88));
          page.cleanup();
          const { data } = await worker.recognize(
            imagePath,
            {},
            { text: true, tsv: true },
          );
          const words: Word[] = (data.tsv || "")
            .split("\n")
            .slice(1)
            .map((line) => line.split("\t"))
            .filter((v) => v[0] === "5" && v[11]?.trim())
            .map((v) => ({
              text: v.slice(11).join("\t").trim(),
              confidence: +v[10],
              x: +v[6],
              y: +v[7],
              width: +v[8],
              height: +v[9],
            }));
          const result: ScannedPage = {
            page: pageNumber,
            width: canvas.width,
            height: canvas.height,
            image: imagePath.replaceAll("\\", "/"),
            text: data.text,
            confidence: data.confidence,
            words,
          };
          await fs.writeFile(file, JSON.stringify(result));
          pages.push(result);
          done++;
          onProgress({
            phase: "ocr",
            done,
            total,
            message: `Đã nhận dạng trang ${pageNumber}/${pdf.numPages}`,
          });
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
    await pdf.destroy();
  }
  return pages.sort((a, b) => a.page - b.page);
}
