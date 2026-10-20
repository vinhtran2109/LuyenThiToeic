/**
 * Part 1 và Part 2 không in trong booklet: lựa chọn và câu hỏi được đọc
 * trong audio. Lấy từ transcript — mỗi câu bắt đầu bằng mốc “Number N.”,
 * sau đó là thân câu (nếu có) rồi tới các dòng “A. …”, “B. …”, “C. …”, “D. …”.
 */
export type TranscriptLine = { start: number; end: number; text: string };

export type SpokenQuestion = {
  number: number;
  prompt: string;
  options: string[];
};

const MARKER_RE = /^number\s+(\d{1,3})\b/i;
/** “A. …”, “(A) …” hoặc chỉ “A.” rồi nội dung nằm ở dòng kế tiếp. */
const OPTION_RE = /^(?:([A-D])\.\s*(.*)|([A-D])\s*$)/i;
/** Dấu hiệu chuyển phần trong audio — kết thúc câu đang lấy. */
const BREAK_RE = /^(part\s*\d|directions?|questions?\s+\d+\s*through|listening test)/i;

/**
 * @param numbers  các số câu cần lấy (ví dụ 1–6 cho Part 1, 7–31 cho Part 2)
 */
export function spokenQuestions(
  transcript: TranscriptLine[],
  numbers: number[],
): Map<number, SpokenQuestion> {
  const wanted = new Set(numbers);
  const result = new Map<number, SpokenQuestion>();
  let current: number | null = null;
  let prompt: string[] = [];
  let options: (string | null)[] = [null, null, null, null];
  let lastOption = -1;
  const finish = () => {
    if (current === null) return;
    const text = prompt.join(" ").replace(/\s+/g, " ").trim();
    result.set(current, {
      number: current,
      // Part 1: câu hỏi là hình ảnh, phần “Number 1. Look at the picture…” là hướng dẫn.
      prompt: current <= 6 ? "" : text,
      options: options.map((o) => (o ?? "").trim()),
    });
  };
  for (const line of transcript) {
    const text = String(line.text || "").trim();
    const marker = MARKER_RE.exec(text);
    if (marker) {
      finish();
      const n = +marker[1];
      current = wanted.has(n) ? n : null;
      prompt = [];
      options = [null, null, null, null];
      continue;
    }
    if (current === null) continue;
    if (BREAK_RE.test(text)) {
      finish();
      current = null;
      continue;
    }
    const option = OPTION_RE.exec(text);
    if (option) {
      const letter = (option[1] ?? option[2] ?? "").toUpperCase();
      const index = letter.charCodeAt(0) - 65;
      if (index >= 0 && index <= 3) {
        options[index] = (option[2] ?? "").trim();
        lastOption = index;
      }
      continue;
    }
    if (lastOption >= 0 && options[lastOption] !== null) {
      // Dòng nối tiếp của một lựa chọn.
      options[lastOption] = `${options[lastOption]} ${text}`.trim();
      continue;
    }
    prompt.push(text);
  }
  finish();
  return result;
}

/** Lựa chọn của Part 1 (4 phát biểu) theo số câu. */
export function part1OptionsFromTranscript(
  transcript: TranscriptLine[],
  numbers: number[],
): (string[] | null)[] | null {
  const spoken = spokenQuestions(transcript, numbers);
  if (!spoken.size) return null;
  return numbers.map((n) => {
    const q = spoken.get(n);
    if (!q || q.options.filter(Boolean).length !== 4) return null;
    return q.options;
  });
}
