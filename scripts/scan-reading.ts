import { scanPdf } from "../server/pdf-ocr";
import fs from "node:fs/promises";
const source = "uploads/653146ba-7fa1-4537-97f0-507f7457d09c.pdf";
const folder = "uploads/import-e2ac1f15-5d96-42d7-945d-301b4a9c6f97";
const started = Date.now();
let last = 0;
const pages = await scanPdf(source, folder, (p) => {
  if (p.done - last >= 5 || p.done === p.total) {
    last = p.done;
    console.log(`${p.message} · ${Math.round((Date.now() - started) / 1000)}s`);
  }
  void fs.writeFile(
    "artifacts/reading-import/progress.json",
    JSON.stringify({
      ...p,
      started,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
    }),
  );
});
await fs.writeFile(
  "artifacts/reading-import/scanned-pages.json",
  JSON.stringify(pages),
);
console.log("DONE", pages.length);
