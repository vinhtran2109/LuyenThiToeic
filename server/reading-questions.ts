/**
 * Trích câu hỏi và lựa chọn của phần Reading từ bản scan.
 *
 * Booklet in sẵn câu hỏi (Part 5–7) kèm lựa chọn (A)–(D) nên ta đọc thẳng
 * chữ thay vì bắt học sinh tự nhìn ảnh. Số câu hỏi nằm ở mép cột nên chỉ
 * nhận số nằm đúng hai dải mép — số trong lòng đoạn văn (ví dụ số đánh dấu
 * chỗ trống) không được tính là câu hỏi.
 */
import { buildLines, splitColumns } from "./listening-parser";
import type { ScannedPage, Word } from "./pdf-ocr";

const OPTION_RE =
  /^(?:\(([A-D])\)|([A-D])\)|([A-D])\.|\(([1-4])\)|([1-4])\))\s*(.*)$/;
const NUMBER_RE = /^([12]\d{2})[.,:)]$/;

/** Nhãn lựa chọn đứng riêng: “(A)”, “A)”, “A.”, “(1)”. */
const LABEL_WORD_RE = /^(?:\([A-Da-d1-4][)\].]?|[A-Da-d][).]|\([1-4]\))$/;

export type ReadingQuestionText = {
  number: number;
  prompt: string;
  options: string[];
  page: number;
};

type Draft = {
  number: number;
  stem: string[];
  options: (string[] | null)[];
  page: number;
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

/** Số câu hỏi chỉ nằm ở hai dải mép cột. */
export function isQuestionAnchor(word: Word, page: ScannedPage) {
  const match = NUMBER_RE.exec(word.text);
  if (!match) return false;
  const n = +match[1];
  if (n < 101 || n > 200) return false;
  const x = word.x / page.width;
  return (x >= 0.04 && x <= 0.2) || (x >= 0.44 && x <= 0.6);
}

/**
 * Tách dòng thành các nhóm, mỗi nhóm bắt đầu bằng một số câu hỏi.
 * Trang hai cột đôi khi gộp câu của cột phải vào dòng của cột trái.
 */
function splitByAnchors(words: Word[], page: ScannedPage) {
  const sorted = [...words].sort((a, b) => a.x - b.x);
  const groups: Word[][] = [];
  let current: Word[] = [];
  for (const w of sorted) {
    if (current.length && isQuestionAnchor(w, page)) {
      groups.push(current);
      current = [w];
      continue;
    }
    current.push(w);
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Tách dòng theo nhãn lựa chọn nằm dính giữa dòng. */
function splitByLabels(words: Word[]) {
  const sorted = [...words].sort((a, b) => a.x - b.x);
  const segments: Word[][] = [];
  let current: Word[] = [];
  for (const w of sorted) {
    if (current.length && LABEL_WORD_RE.test(w.text)) {
      segments.push(current);
      current = [w];
      continue;
    }
    current.push(w);
  }
  if (current.length) segments.push(current);
  return segments;
}

function textStartX(words: Word[]) {
  const rest = words.slice(1);
  return rest.length ? Math.min(...rest.map((w) => w.x)) : words[0].x;
}

/** Đọc một cột trang: số câu hỏi, thân câu và các lựa chọn. */
function readColumn(words: Word[], page: ScannedPage) {
  const lines = buildLines(words);
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let lastOption = -1;
  let lastNumber = 0;
  const optionTextX: number[] = [];
  for (const line of lines) {
    for (const group of splitByAnchors(line.words, page)) {
      for (const segment of splitByLabels(group)) {
        const words = segment;
        const text = joinWords(words);
        if (!text) continue;
        const anchor = words.find((w) => isQuestionAnchor(w, page));
        if (anchor) {
          const number = +NUMBER_RE.exec(anchor.text)![1];
          lastNumber = number;
          // Phần thân câu nằm sau số câu trên cùng dòng.
          const afterAnchor = words.slice(words.indexOf(anchor) + 1);
          const rest = joinWords(afterAnchor);
          current = {
            number,
            stem: rest ? [rest] : [],
            options: [null, null, null, null],
            page: page.page,
          };
          drafts.push(current);
          lastOption = -1;
          optionTextX.length = 0;
          continue;
        }
        if (!current) {
          // Số câu bị OCR bỏ hẳn ở đầu cột — vẫn giữ thân câu, số sẽ
          // suy luận sau khi biết số câu đầu tiên có số thật trong cột.
          current = {
            number: 0,
            stem: [text],
            options: [null, null, null, null],
            page: page.page,
          };
          drafts.push(current);
          lastOption = -1;
          optionTextX.length = 0;
          continue;
        }
        const option = OPTION_RE.exec(text);
        if (option) {
          // Câu chèn câu (Part 7) dùng nhãn 1–4 thay cho A–D.
          const digit = option[4] || option[5];
          const index = digit
            ? +digit - 1
            : (option[1] || option[2] || option[3]).toUpperCase().charCodeAt(0) - 65;
          const body = option[6].trim();
          current.options[index] = body ? [body] : [];
          lastOption = index;
          optionTextX[index] = textStartX(words);
          continue;
        }
        // Nhãn lựa chọn bị OCR đọc hỏng — dòng lùi sang trái vùng chữ của
        // lựa chọn trước nghĩa là đây là lựa chọn kế tiếp.
        if (
          lastOption >= 0 &&
          lastOption < 3 &&
          !current.options[lastOption + 1]
        ) {
          const prevTextX = optionTextX[lastOption] ?? words[0].x;
          if (words[0].x < prevTextX - 4) {
            const index = lastOption + 1;
            const stripped = text.replace(/^[^\p{L}]+\s*/u, "");
            current.options[index] = [
              stripped.length >= 3 && /\p{L}{3}/u.test(stripped)
                ? stripped
                : text,
            ];
            lastOption = index;
            optionTextX[index] = textStartX(words);
            continue;
          }
        }
        // Số câu bị OCR bỏ hẳn: ở Part 5 mỗi câu đều là thân câu + bốn
        // lựa chọn và không có đoạn văn xen kẽ, nên câu mới bắt đầu ngay sau
        // khi câu trước đã đủ bốn lựa chọn — suy luận theo số câu liền kề.
        if (
          lastOption >= 0 &&
          current.number >= 101 &&
          current.number <= 130 &&
          current.options.every((o) => o && o.length) &&
          lastNumber + 1 <= 130
        ) {
          lastNumber = lastNumber + 1;
          current = {
            number: lastNumber,
            stem: [text],
            options: [null, null, null, null],
            page: page.page,
          };
          drafts.push(current);
          lastOption = -1;
          optionTextX.length = 0;
          continue;
        }
        const target =
          lastOption >= 0 ? current.options[lastOption] : current.stem;
        if (target) target.push(text);
      }
    }
  }
  // Các câu mở đầu cột bị mất số: đánh số lại theo câu có số thật đầu tiên
  // trong cột (các câu Part 5 đi liên tiếp, không có đoạn văn xen kẽ).
  const firstKnown = drafts.findIndex((d) => d.number > 0);
  if (firstKnown > 0) {
    const head = drafts.slice(0, firstKnown);
    const looksLikeQuestions = head.every((d) =>
      d.options.filter((o) => o && o.length).length >= 3,
    );
    if (looksLikeQuestions) {
      const start = drafts[firstKnown].number - head.length;
      head.forEach((d, i) => (d.number = start + i));
    }
  }
  return drafts;
}

/**
 * Dựng hai cột câu hỏi từ chính vị trí số câu — ổn định hơn khe trống giữa
 * các từ (một số trang chỉ có vài câu nên tesseract không tách được cột).
 */
function pageBands(words: Word[], page: ScannedPage) {
  const anchors = words.filter((w) => isQuestionAnchor(w, page));
  if (anchors.length < 2) return [words];
  const xs = anchors.map((w) => w.x).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1] <= page.width * 0.08) last.push(x);
    else clusters.push([x]);
  }
  const top = clusters
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .sort((a, b) => a[0] - b[0]);
  if (top.length !== 2) return [words];
  const boundary = top[1][0] - 6;
  if (boundary <= 0) return [words];
  return [
    words.filter((w) => w.x < boundary),
    words.filter((w) => w.x >= boundary),
  ];
}

export function pageBandsForDebug(words: Word[], page: ScannedPage) {
  return pageBands(words, page);
}

/**
 * Trích câu hỏi trong một đề (theo khoảng trang), trả về map số câu → nội dung.
 */
export function extractReadingQuestions(
  pages: ScannedPage[],
  startPage: number,
  endPage: number,
) {
  const result = new Map<number, ReadingQuestionText>();
  for (const page of pages) {
    if (page.page < startPage || page.page > endPage) continue;
    const kept = page.words.filter(
      (w) =>
        !(w.y + w.height > page.height * 0.92) && w.x < page.width * 0.95,
    );
    for (const band of pageBands(kept, page)) {
      for (const draft of readColumn(band, page)) {
        if (!draft.number) continue; // đoạn văn không phải câu hỏi
        const options = draft.options.map((o) => (o ? o.join(" ").trim() : ""));
        const prompt = draft.stem.join(" ").trim();
        if (result.has(draft.number)) continue;
        result.set(draft.number, {
          number: draft.number,
          prompt,
          options,
          page: draft.page,
        });
      }
    }
  }
  return result;
}
