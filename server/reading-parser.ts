import type { ScannedPage, Word } from "./pdf-ocr";
export type ReadingConfig = {
  testCount: number;
  pagesPerTest: number;
  coverPages: number;
  titlePrefix: string;
};
export type Location = {
  number: number;
  page: number;
  part: number;
  groupId: string;
  sourcePages: number[];
  needsReview: boolean;
  raw: string;
};
export function numberAnchors(page: ScannedPage) {
  return page.words.flatMap((w) => {
    const x = w.x / page.width,
      y = w.y / page.height;
    // Printed question numbers sit in the two question-number margins. Prices,
    // passage blanks and footer numbers must not become question anchors.
    if (
      y < 0.025 ||
      y > 0.91 ||
      !((x >= 0.065 && x <= 0.14) || (x >= 0.485 && x <= 0.57))
    )
      return [];
    const match = w.text.match(/^([12]\d{2})[.,:)]$/);
    if (!match) return [];
    const n = Number(match[1]);
    return n >= 101 && n <= 200 ? [{ number: n, word: w }] : [];
  });
}
export function referenceGroups(page: ScannedPage) {
  const text = page.text.replace(/[—–−]/g, "-");
  return [...text.matchAll(/Questions?\s+(1\d{2}|200)\s*[-~]\s*(1\d{2}|200)/gi)]
    .map((m) => ({ start: +m[1], end: +m[2], page: page.page }))
    .filter(
      (g) =>
        g.start >= 131 &&
        g.end <= 200 &&
        g.end >= g.start &&
        g.end - g.start <= 5,
    );
}
export function parseReading(
  pages: ScannedPage[],
  config: ReadingConfig,
  overrides: Record<string, Record<string, number>> = {},
) {
  return Array.from({ length: config.testCount }, (_, index) => {
    const start = index * config.pagesPerTest + 1,
      end = (index + 1) * config.pagesPerTest;
    const content = pages.filter(
      (p) => p.page >= start + config.coverPages && p.page <= end,
    );
    const anchors = new Map<number, { page: number; word: Word }>();
    const duplicate: number[] = [];
    for (const p of content)
      for (const a of numberAnchors(p)) {
        if (anchors.has(a.number)) duplicate.push(a.number);
        else anchors.set(a.number, { page: p.page, word: a.word });
      }
    const groups = content.flatMap(referenceGroups);
    const locations: Location[] = Array.from({ length: 100 }, (_, i) => {
      const number = i + 101,
        part = number <= 130 ? 5 : number <= 146 ? 6 : 7;
      const override = overrides[index + 1]?.[number];
      const anchor = anchors.get(number);
      const before = [...anchors.entries()]
        .filter(([n]) => n < number)
        .sort((a, b) => b[0] - a[0])[0];
      const after = [...anchors.entries()]
        .filter(([n]) => n > number)
        .sort((a, b) => a[0] - b[0])[0];
      const page =
        override ||
        anchor?.page ||
        before?.[1].page ||
        after?.[1].page ||
        start + config.coverPages;
      const group = groups.find((g) => g.start <= number && g.end >= number);
      const part6Start = 131 + Math.floor((number - 131) / 4) * 4;
      const gstart = group?.start || (part === 6 ? part6Start : number),
        gend = group?.end || (part === 6 ? part6Start + 3 : number);
      const groupPages = [...anchors.entries()]
        .filter(([n]) => n >= gstart && n <= gend)
        .map(([, a]) => a.page);
      const first =
        part === 5
          ? page
          : group?.page ||
            Math.max(
              start + config.coverPages,
              Math.min(...groupPages, page) - (part === 7 ? 1 : 0),
            );
      const last = Math.max(page, ...groupPages);
      return {
        number,
        page,
        part,
        groupId: `r${index + 1}-${part === 5 ? number : `${gstart}-${gend}`}`,
        sourcePages: Array.from(
          { length: last - first + 1 },
          (_, i) => first + i,
        ),
        needsReview: !override && (!anchor || duplicate.includes(number)),
        raw: override ? "manual" : anchor?.word.text || "missing",
      };
    });
    // Reading question numbers must never move backwards through the source.
    for (let i = 1; i < locations.length; i++)
      if (locations[i].page < locations[i - 1].page) {
        locations[i].needsReview = true;
        locations[i - 1].needsReview = true;
      }
    return {
      index: index + 1,
      startPage: start + config.coverPages,
      endPage: end,
      locations,
      missing: locations.filter((q) => q.needsReview).map((q) => q.number),
      anchors: anchors.size,
      groups,
    };
  });
}
