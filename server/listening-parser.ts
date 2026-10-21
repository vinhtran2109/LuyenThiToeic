import { partOf } from "./core";
import type { ScannedPage, Word } from "./pdf-ocr";

export type ListeningConfig = {
  testCount: number;
  pagesPerTest: number;
  coverPages: number;
  titlePrefix: string;
};

export type ListeningQuestion = {
  number: number;
  part: number;
  groupId: string;
  prompt: string;
  options: string[];
  page: number;
  needsReview: boolean;
  reason?: string;
};

export type ParsedListeningTest = {
  index: number;
  startPage: number;
  endPage: number;
  /** Câu 32–100 in trong booklet. */
  questions: ListeningQuestion[];
  /** Câu 32–100 không tìm thấy trong bản scan. */
  missing: number[];
  /** Các trang chứa ảnh Part 1 — nhãn số câu không đọc được bằng OCR. */
  part1Pages: number[];
};

export type ParsedListening = {
  tests: ParsedListeningTest[];
  needsReview: number;
};

const OPTION_RE = /^(?:\(([A-D])\)|([A-D])\)|([A-D])\.)\s*(.*)$/;
const NUMBER_RE = /^(\d{1,3})[.,]\s*(.*)$/;
const BLOCKING_RE = /^(directions?|listening test|part\s*\d)/i;

type Line = {
  text: string;
  x: number;
  top: number;
  bottom: number;
  words: Word[];
};

type Draft = {
  number: number;
  stem: string[];
  options: (string[] | null)[];
  page: number;
  numberX: number;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function joinWords(words: Word[]) {
  return [...words]
    .sort((a, b) => a.x - b.x)
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Gom từ thành dòng theo toạ độ dọc — tesseract đọc sai thứ tự khi trang có 2 cột. */
export function buildLines(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const tolerance = Math.max(6, median(sorted.map((w) => w.height)) * 0.8);
  const lines: Line[] = [];
  for (const w of sorted) {
    const center = w.y + w.height / 2;
    const last = lines[lines.length - 1];
    if (last) {
      const lineCenter = (last.top + last.bottom) / 2;
      if (Math.abs(center - lineCenter) <= tolerance) {
        last.words.push(w);
        last.top = Math.min(last.top, w.y);
        last.bottom = Math.max(last.bottom, w.y + w.height);
        last.x = Math.min(last.x, w.x);
        last.text = joinWords(last.words);
        continue;
      }
    }
    lines.push({
      text: w.text,
      x: w.x,
      top: w.y,
      bottom: w.y + w.height,
      words: [w],
    });
  }
  return lines;
}

/** Bỏ chân trang và mép trang — chúng không phải câu hỏi. */
function keepWord(word: Word, page: ScannedPage) {
  if (word.y + word.height > page.height * 0.9) return false; // số trang, GO ON TO THE NEXT PAGE
  if (word.x > page.width * 0.93) return false; // tab TEST ở mép phải
  return true;
}

/**
 * Xác định ranh giới cột từ vị trí các số câu — chúng luôn nằm sát mép
 * cột nên vị trí của chúng ổn định hơn mọi khoảng trống giữa các từ.
 * Ranh giới lấy theo mép trái của cột phải, không theo trung điểm, để không
 * cắt nhầm vào phần chữ dài ở cột trái.
 */
export function columnBoundary(words: Word[], pageWidth: number) {
  const numbers = words
    .filter((w) => /^\d{1,3}\.$/.test(w.text))
    .map((w) => w.x)
    .sort((a, b) => a - b);
  if (numbers.length < 4) return null;
  const clusters: number[][] = [[numbers[0]]];
  for (const x of numbers.slice(1)) {
    const last = clusters[clusters.length - 1];
    if (x - last[last.length - 1] > pageWidth * 0.08) clusters.push([x]);
    else last.push(x);
  }
  // Hình minh hoạ có thể chứa thêm số (vd “2.” trong sơ đồ) — chỉ giữ hai
  // cụm đông nhất là hai cột câu hỏi.
  const top = clusters
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .sort((a, b) => a[0] - b[0]);
  if (top.length !== 2) return null;
  const left = top[0].reduce((a, b) => a + b, 0) / top[0].length;
  const right = Math.min(...top[1]);
  if (right - left < pageWidth * 0.2) return null;
  return right - pageWidth * 0.03;
}

export function splitColumns(words: Word[], page: ScannedPage): Word[][] {
  const boundary = columnBoundary(words, page.width);
  if (boundary === null) return [words];
  const left = words.filter((w) => w.x + w.width / 2 < boundary);
  const right = words.filter((w) => w.x + w.width / 2 >= boundary);
  return [left, right].filter((c) => c.length);
}

/**
 * Nhãn lựa chọn đứng riêng ở đầu đoạn: “(A)”, “A)”, “A.”.
 * Chữ đơn không kèm ngoặc/dấu chấm không được tính — “A deadline…” là chữ
 * bắt đầu lựa chọn, không phải nhãn.
 */
const LABEL_WORD_RE = /^(?:\([A-Da-d][)\].]?|[A-Da-d][).])$/;

type Segment = {
  text: string;
  x: number;
  words: Word[];
};

/**
 * Tesseract đôi khi gộp nhãn lựa chọn vào giữa dòng (ví dụ câu hỏi bị dính
 * “A) Overtime pay…” ở cuối). Tách dòng theo từng nhãn để không bỏ sót lựa chọn.
 */
function splitByLabels(line: Line): Segment[] {
  const words = [...line.words].sort((a, b) => a.x - b.x);
  const segments: Segment[] = [];
  let current: Word[] = [];
  for (const w of words) {
    const isLabel = LABEL_WORD_RE.test(w.text) && current.length > 0;
    if (isLabel) {
      segments.push({
        text: joinWords(current),
        x: Math.min(...current.map((c) => c.x)),
        words: current,
      });
      current = [w];
      continue;
    }
    current.push(w);
  }
  if (current.length)
    segments.push({
      text: joinWords(current),
      x: Math.min(...current.map((c) => c.x)),
      words: current,
    });
  return segments;
}

/** Toạ độ bắt đầu phần chữ của lựa chọn (bỏ qua nhãn ở đầu). */
function textStartX(words: Word[]) {
  const rest = words.slice(1);
  return rest.length ? Math.min(...rest.map((w) => w.x)) : words[0].x;
}

/** Đọc một cột: số câu, thân câu, các lựa chọn (A)–(D). */
function parseColumn(words: Word[], page: ScannedPage, firstNumber: number) {
  const lines = buildLines(words);
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let lastOption = -1;
  let lastNumber = firstNumber - 1;
  // Toạ độ chữ của từng lựa chọn — dùng để đoán lựa chọn tiếp theo khi
  // OCR đọc hỏng nhãn (ví dụ “(B)” thành “2)”).
  const optionTextX: number[] = [];
  for (const line of lines) {
    for (const segment of splitByLabels(line)) {
      const text = segment.text;
      if (BLOCKING_RE.test(text)) {
        current = null;
        lastOption = -1;
        continue;
      }
      const numbered = NUMBER_RE.exec(text);
      let number = numbered ? +numbered[1] : 0;
      let rest = numbered ? numbered[2].trim() : "";
      // OCR đôi khi rơi mất số câu, chỉ còn lại dấu chấm đầu dòng —
      // khôi phục bằng số câu liền kề trong cột.
      if (!numbered) {
        const orphan = /^\.\s*(\S.*)$/.exec(text);
        if (orphan && lastNumber + 1 >= 32 && lastNumber + 1 <= 100) {
          number = lastNumber + 1;
          rest = orphan[1].trim();
        }
      }
      if (number >= 32 && number <= 100) {
        lastNumber = number;
        current = {
          number,
          stem: rest ? [rest] : [],
          options: [null, null, null, null],
          page: page.page,
          numberX: segment.x,
        };
        drafts.push(current);
        lastOption = -1;
        optionTextX.length = 0;
        continue;
      }
      const option = OPTION_RE.exec(text);
      if (option && current) {
        const index = (option[1] || option[2] || option[3])
          .toUpperCase()
          .charCodeAt(0) - 65;
        const body = option[4].trim();
        current.options[index] = body ? [body] : [];
        lastOption = index;
        optionTextX[index] = textStartX(segment.words);
        continue;
      }
      if (!current) continue;
      // Nhãn lựa chọn bị OCR đọc hỏng: dòng bắt đầu ở bên trái vùng chữ của
      // lựa chọn trước thì đây là lựa chọn kế tiếp, không phải dòng nối.
      if (lastOption >= 0 && lastOption < 3 && !current.options[lastOption + 1]) {
        const prevTextX = optionTextX[lastOption] ?? segment.x;
        if (segment.x < prevTextX - 4) {
          const index = lastOption + 1;
          // Nhãn hỏng (“2)”, “io”) nằm ở đầu đoạn — bỏ đi, chỉ giữ chữ.
          const stripped = text.trim().replace(/^[^\p{L}]+\s*/u, "");
          const body =
            stripped.length >= 3 && /\p{L}{3}/u.test(stripped) ? stripped : text.trim();
          current.options[index] = [body];
          lastOption = index;
          optionTextX[index] = textStartX(segment.words);
          continue;
        }
      }
      // Chữ nằm rất xa số câu (ví dụ nhãn trong hình minh hoạ) không thuộc câu hỏi.
      if (Math.abs(segment.x - current.numberX) > page.width * 0.22) continue;
      const target = lastOption >= 0 ? current.options[lastOption] : current.stem;
      if (target) target.push(text.trim());
    }
  }
  return { drafts, next: lastNumber + 1 };
}

export function groupIdOf(number: number) {
  const part = partOf(number);
  if (part === 3) return `p3-${Math.floor((number - 32) / 3)}`;
  if (part === 4) return `p4-${Math.floor((number - 71) / 3)}`;
  return `q-${number}`;
}

export function parseListening(
  pages: ScannedPage[],
  config: ListeningConfig,
): ParsedListening {
  const tests: ParsedListeningTest[] = [];
  let needsReview = 0;
  for (let index = 1; index <= config.testCount; index++) {
    const startPage = (index - 1) * config.pagesPerTest + 1 + config.coverPages;
    const endPage = index * config.pagesPerTest;
    const testPages = pages.filter(
      (p) => p.page >= startPage && p.page <= endPage,
    );
    const drafts: Draft[] = [];
    // Số câu tăng dần suốt đề nên bộ đếm chạy xuyên trang và cột.
    let expected = 32;
    for (const page of testPages) {
      const words = page.words.filter((w) => keepWord(w, page));
      for (const column of splitColumns(words, page)) {
        const parsed = parseColumn(column, page, expected);
        drafts.push(...parsed.drafts);
        expected = Math.max(expected, parsed.next);
      }
    }
    // Trang ảnh Part 1 nằm giữa trang hướng dẫn “PART 1” và trang “PART 2”.
    const part1Page = testPages.find((p) => /part\s*1/i.test(p.text))?.page;
    const part2Page = testPages.find((p) => /part\s*2/i.test(p.text))?.page;
    const part1Pages =
      part1Page && part2Page
        ? testPages
            .filter((p) => p.page > part1Page && p.page < part2Page)
            .map((p) => p.page)
        : [];
    const questions: ListeningQuestion[] = [];
    const seen = new Set<number>();
    for (const draft of drafts.sort((a, b) => a.number - b.number)) {
      if (seen.has(draft.number)) continue;
      seen.add(draft.number);
      const part = partOf(draft.number);
      const options = draft.options.map((o) => (o ? o.join(" ").trim() : ""));
      const missingOptions = options.filter((o) => !o).length;
      const question: ListeningQuestion = {
        number: draft.number,
        part,
        groupId: groupIdOf(draft.number),
        prompt: draft.stem.join(" ").trim(),
        options,
        page: draft.page,
        needsReview: missingOptions > 0 || !draft.stem.join(" ").trim(),
        reason: missingOptions > 0 ? `OCR thiếu ${missingOptions} lựa chọn.` : undefined,
      };
      questions.push(question);
      if (question.needsReview) needsReview++;
    }
    const missing: number[] = [];
    for (let n = 32; n <= 100; n++) if (!seen.has(n)) missing.push(n);
    tests.push({ index, startPage, endPage, questions, missing, part1Pages });
  }
  return { tests, needsReview };
}
