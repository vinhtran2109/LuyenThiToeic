export const listeningGroups = Array.from({ length: 54 }, (_, i) => {
  const slot = i + 1,
    part = slot <= 6 ? 1 : slot <= 31 ? 2 : slot <= 44 ? 3 : 4;
  const questionStart =
    part <= 2 ? slot : part === 3 ? 32 + (slot - 32) * 3 : 71 + (slot - 45) * 3;
  return {
    slot,
    part,
    questionStart,
    questionEnd: questionStart + (part >= 3 ? 2 : 0),
  };
});
export type DraftSegment = {
  slot: number;
  part: number;
  questionStart: number;
  questionEnd: number;
  start: number | null;
  end: number | null;
  confirmed: boolean;
  confidence: number;
  evidence: string;
  reason: string;
};
export type Transcript = {
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; word: string }[];
};
export type Silence = { start: number; end: number };
export function blankSegments(): DraftSegment[] {
  return listeningGroups.map((g) => ({
    ...g,
    start: null,
    end: null,
    confirmed: false,
    confidence: 0,
    evidence: "unknown",
    reason: "Chưa xác định thời gian hoặc nội dung.",
  }));
}
export function validateSegments(segments: DraftSegment[], duration: number) {
  const invalid: string[] = [],
    overlaps: { a: number; b: number }[] = [],
    duplicates: number[] = [],
    missing: number[] = [],
    unconfirmed: number[] = [];
  if (
    segments.length !== 54 ||
    new Set(segments.map((s) => s.slot)).size !== 54 ||
    segments.some((s) => s.slot < 1 || s.slot > 54)
  )
    invalid.push("Cần đủ 54 slot duy nhất (1–54).");
  const seen = new Set<number>();
  for (const s of segments) {
    const g = listeningGroups.find(
      (g) =>
        g.part === s.part &&
        g.questionStart === s.questionStart &&
        g.questionEnd === s.questionEnd,
    );
    if (!g) invalid.push(`Slot ${s.slot}: liên kết không đúng nhóm TOEIC.`);
    else {
      if (seen.has(g.slot)) duplicates.push(g.slot);
      seen.add(g.slot);
    }
    if (
      s.start !== null &&
      (!Number.isFinite(s.start) || s.start < 0 || s.start >= duration)
    )
      invalid.push(`Slot ${s.slot}: start ngoài audio.`);
    if (
      s.end !== null &&
      (!Number.isFinite(s.end) || s.end <= 0 || s.end > duration + 0.001)
    )
      invalid.push(`Slot ${s.slot}: end ngoài audio.`);
    if (s.start !== null && s.end !== null && s.end <= s.start)
      invalid.push(`Slot ${s.slot}: end phải lớn hơn start.`);
    if (!s.confirmed) unconfirmed.push(s.slot);
  }
  for (const g of listeningGroups)
    if (
      !segments.some(
        (s) =>
          s.part === g.part &&
          s.questionStart === g.questionStart &&
          s.questionEnd === g.questionEnd &&
          s.start !== null &&
          s.end !== null &&
          s.end > s.start,
      )
    )
      missing.push(g.slot);
  const timed = segments
    .filter((s) => s.start !== null && s.end !== null && s.end > s.start)
    .sort((a, b) => a.start! - b.start!);
  for (let i = 0; i < timed.length; i++)
    for (
      let j = i + 1;
      j < timed.length && timed[j].start! < timed[i].end! - 0.01;
      j++
    )
      overlaps.push({ a: timed[i].slot, b: timed[j].slot });
  const gaps: Silence[] = [];
  let cursor = 0;
  for (const s of timed) {
    if (s.start! > cursor + 0.05) gaps.push({ start: cursor, end: s.start! });
    cursor = Math.max(cursor, s.end!);
  }
  if (duration > cursor + 0.05) gaps.push({ start: cursor, end: duration });
  const chronological = segments
    .slice()
    .sort((a, b) => a.questionStart - b.questionStart)
    .filter((s) => s.start !== null);
  const outOfOrder = chronological.some(
    (s, i) => i > 0 && s.start! < chronological[i - 1].start!,
  );
  return {
    invalid,
    overlaps,
    duplicates: [...new Set(duplicates)],
    missing,
    unconfirmed,
    gaps,
    outOfOrder,
    canPublish:
      invalid.length === 0 &&
      overlaps.length === 0 &&
      duplicates.length === 0 &&
      missing.length === 0 &&
      unconfirmed.length === 0 &&
      !outOfOrder,
  };
}
const small: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
export function spokenNumber(text: string) {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim();
  if (/^\d+$/.test(clean)) return +clean;
  const words = clean.split(/[ -]+/).filter((w) => w !== "and");
  let n = 0;
  for (const w of words) {
    if (!(w in small)) break;
    if (w === "hundred") n = Math.max(1, n) * 100;
    else n += small[w];
  }
  return n;
}
export function transcriptAnchors(transcript: Transcript[]) {
  const anchors: { question: number; time: number; text: string }[] = [];
  for (const t of transcript) {
    const regex =
      /\b(?:questions?|number)\s+((?:\d{1,3})|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred))?))\b/gi;
    for (const m of t.text.matchAll(regex)) {
      const question = spokenNumber(m[1]);
      const g = listeningGroups.find((g) => g.questionStart === question);
      if (g && !anchors.some((a) => a.question === question)) {
        let time = t.start;
        const prefix = t.text
          .slice(0, m.index)
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;
        if (t.words?.[prefix]) time = t.words[prefix].start;
        anchors.push({ question, time, text: m[0] });
      }
    }
  }
  return anchors.sort((a, b) => a.time - b.time);
}
export function speechCandidates(
  silences: Silence[],
  duration: number,
  minSegment = 1,
) {
  const cuts = [
    0,
    ...silences
      .filter((s) => s.start > 0 && s.end < duration)
      .map((s) => (s.start + s.end) / 2),
    duration,
  ].sort((a, b) => a - b);
  return cuts
    .slice(0, -1)
    .map((start, i) => ({ start, end: cuts[i + 1] }))
    .filter((s) => s.end - s.start >= minSegment);
}
export function proposeSegments(
  silences: Silence[],
  duration: number,
  transcript: Transcript[],
  questionTexts: Map<number, string> = new Map(),
) {
  const segments = blankSegments(),
    anchors = transcriptAnchors(transcript),
    candidates = speechCandidates(silences, duration);
  for (const s of segments) {
    const a = anchors.find((a) => a.question === s.questionStart);
    if (a) {
      const next = listeningGroups.find((g) => g.slot === s.slot + 1),
        nextAnchor = anchors.find((a) => a.question === next?.questionStart);
      s.start = s.slot === 1 ? 0 : a.time;
      s.end = s.slot === 54 ? duration : (nextAnchor?.time ?? null);
      s.confidence = tPrecision(transcript, a.time) ? 0.78 : 0.62;
      s.evidence = "spoken-number";
      s.reason = `Transcript có mốc “${a.text}”. Timestamp cần nghe kiểm tra; chưa xác nhận khớp nội dung đề.`;
      if (s.end !== null && s.end <= s.start) {
        s.end = null;
        s.confidence = 0.2;
        s.reason += " Thứ tự mốc không hợp lệ.";
      }
      const text = questionTexts.get(s.questionStart);
      if (text && s.end !== null) {
        const snippet = transcript
          .filter((t) => t.end > s.start! && t.start < s.end!)
          .map((t) => t.text)
          .join(" ")
          .toLowerCase();
        const tokens = [
          ...new Set(text.toLowerCase().match(/[a-z]{4,}/g) || []),
        ];
        const matched = tokens.filter((w) => snippet.includes(w));
        if (matched.length >= 3)
          s.reason += ` Có ${matched.length} từ khóa chung với nội dung câu hỏi/PDF; đây chưa phải xác minh ngữ nghĩa.`;
      }
    } else {
      const source = questionTexts.get(s.questionStart);
      let proposed = false;
      if (source && transcript.length) {
        const ignored = new Set([
          "question",
          "questions",
          "following",
          "choose",
          "answer",
          "which",
          "where",
          "their",
          "they",
          "this",
          "that",
          "with",
          "from",
          "what",
          "about",
        ]);
        const tokens = [
          ...new Set(source.toLowerCase().match(/[a-z]{4,}/g) || []),
        ].filter((w) => !ignored.has(w));
        const scores = candidates
          .map((c, index) => {
            const speech = transcript
              .filter((t) => t.end > c.start && t.start < c.end)
              .map((t) => t.text.toLowerCase())
              .join(" ");
            const hits = tokens.filter((w) => speech.includes(w)).length;
            return { index, hits, score: hits / Math.max(tokens.length, 1) };
          })
          .filter((c) => c.hits >= 4 && c.score >= 0.2)
          .sort((a, b) => b.score - a.score);
        if (
          scores[0] &&
          (!scores[1] || scores[0].score - scores[1].score >= 0.1)
        ) {
          const c = candidates[scores[0].index];
          s.start = c.start;
          s.end = c.end;
          s.confidence = 0.4 + Math.min(0.2, scores[0].score * 0.2);
          s.evidence = "text-overlap";
          s.reason = `Có ${scores[0].hits} từ khóa chung giữa transcript và câu hỏi/PDF. Chưa xác minh nội dung hay ranh giới; cần nghe đối chiếu.`;
          proposed = true;
        }
      }
      if (!proposed && !anchors.length && candidates.length === 54) {
        const c = candidates[s.slot - 1];
        s.start = c.start;
        s.end = c.end;
        s.confidence = 0.15;
        s.evidence = "silence-only";
        s.reason =
          "Chỉ có 54 khoảng theo silence detection. Số lượng không chứng minh khớp câu; vị trí chưa được xác minh.";
      }
    }
  }
  return {
    segments,
    candidates,
    anchors,
    warning: anchors.length
      ? `Tìm ${anchors.length}/54 mốc số câu; tất cả cần xác nhận.`
      : `Tìm ${candidates.length} ứng viên theo khoảng lặng. Chưa có bằng chứng audio khớp câu hỏi.`,
  };
}
function tPrecision(t: Transcript[], time: number) {
  return t.some((t) => t.words?.some((w) => Math.abs(w.start - time) < 0.05));
}
