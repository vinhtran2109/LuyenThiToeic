import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
export async function pdfReference(db: PrismaClient, id: string) {
  const doc = await db.document.findUniqueOrThrow({ where: { id } });
  if (!doc.path.endsWith(".pdf")) throw Error("Nguồn đối chiếu phải là PDF.");
  let text = doc.text.replace(/--- Trang \d+ ---/g, "").trim();
  if (!text) {
    const folder = path.join("uploads", `import-${doc.id}`);
    try {
      for (const file of (await fs.readdir(folder))
        .filter((f) => /^page-\d+\.json$/.test(f))
        .sort()) {
        const page = JSON.parse(
          await fs.readFile(path.join(folder, file), "utf8"),
        );
        text += "\n" + (page.text || "");
      }
    } catch {}
  }
  const snippets = new Map<number, string>();
  for (let n = 1; n <= 100; n++) {
    const match = new RegExp(
      `(?:^|\\s)(?:Question\\s+)?${n}[.)]\\s+`,
      "i",
    ).exec(text);
    if (match) {
      const remaining = text.slice(match.index + match[0].length);
      const next = new RegExp(
        `(?:^|\\s)(?:Question\\s+)?${n + 1}[.)]\\s+`,
        "i",
      ).exec(remaining);
      snippets.set(
        n,
        remaining.slice(0, next ? Math.min(next.index, 1400) : 1000),
      );
    }
  }
  return {
    snippets,
    evidence: {
      documentId: doc.id,
      name: doc.name,
      usableTextCharacters: text.length,
      questionSnippets: snippets.size,
      note: "So khớp từ khóa chỉ là gợi ý; chưa xác nhận audio khớp PDF.",
    },
  };
}
