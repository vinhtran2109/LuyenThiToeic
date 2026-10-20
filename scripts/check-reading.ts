import fs from "node:fs";
import { parseReading } from "../server/reading-parser";
const dir = "uploads/import-e2ac1f15-5d96-42d7-945d-301b4a9c6f97";
const pages = fs
  .readdirSync(dir)
  .filter((f) => /^page-\d+.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")));
const result = parseReading(pages, {
  testCount: 10,
  pagesPerTest: 29,
  coverPages: 1,
  titlePrefix: "1000 Reading",
});
console.log(
  result
    .filter((r) => pages.some((p) => p.page === r.endPage))
    .map((r) => ({
      test: r.index,
      anchors: r.anchors,
      missing: r.missing,
      groups: r.groups.map((g) => `${g.start}-${g.end}@${g.page}`),
    })),
);
fs.writeFileSync(
  "artifacts/reading-import/mapping-diagnostic.json",
  JSON.stringify(result, null, 2),
);
