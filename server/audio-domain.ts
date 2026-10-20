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
  const anchors: {
    question: number;
    time: number;
    text: string;
    restart: boolean;
  }[] = [];
  for (const t of transcript) {
    const regex =
      /\b(?:questions?|number)\s+((?:\d{1,3})|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred))?))\b/gi;
    for (const m of t.text.matchAll(regex)) {
      const question = spokenNumber(m[1]);
      const g = listeningGroups.find((g) => g.questionStart === question);
      if (!g) continue;
      let time = t.start;
      const prefix = t.text
        .slice(0, m.index)
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      if (t.words?.[prefix]) time = t.words[prefix].start;
      // Không khử trùng số câu trên toàn file: “Question one” lặp lại là
      // dấu hiệu bắt đầu đề mới, không phải bản ghi trùng.
      if (
        anchors.some(
          (a) => a.question === question && Math.abs(a.time - time) < 1,
        )
      )
        continue;
      anchors.push({ question, time, text: m[0], restart: false });
    }
  }
  anchors.sort((a, b) => a.time - b.time);
  let highest = 0;
  for (const a of anchors) {
    if (a.question < highest) a.restart = true;
    highest = Math.max(highest, a.question);
  }
  return anchors;
}
export type GapKind = "micro" | "question" | "boundary";
export type ClassifiedGap = Silence & { duration: number; kind: GapKind };
export type DetectOptions = {
  questionGap?: number;
  boundaryGap?: number;
  autoBoundary?: boolean;
  window?: number | null;
};
export type WindowInfo = {
  index: number;
  start: number;
  end: number;
  candidates: { start: number; end: number }[];
  count: number;
  regular: boolean;
  note: string;
};
type Span = { start: number; end: number };
type Between = { gap: number; kind: GapKind };

/**
 * Ngưỡng phân biệt “ngừng chuyển đề/phần” với “ngừng giữa câu”.
 * Không dùng một con số cố định: khoảng ngừng giữa các câu của từng bản
 * audio rất khác nhau (2–8s), nên ngưỡng thích nghi theo trung vị của các
 * khoảng ngừng thông thường, có sàn do người dùng đặt (boundaryGap).
 */
export function boundaryThreshold(
  silences: Silence[],
  opts: DetectOptions = {},
) {
  const questionGap = opts.questionGap ?? 0.8;
  const floor = Math.max(opts.boundaryGap ?? 4, questionGap + 0.05);
  const durations = silences
    .map((s) => s.end - s.start)
    .filter((d) => d >= questionGap)
    .sort((a, b) => a - b);
  if (opts.autoBoundary === false || durations.length < 8) return floor;
  const median = durations[Math.floor(durations.length / 2)];
  return Math.min(60, Math.max(floor, median * 2.2));
}

export function classifyGaps(
  silences: Silence[],
  opts: DetectOptions = {},
): ClassifiedGap[] {
  const questionGap = opts.questionGap ?? 0.8;
  const threshold = boundaryThreshold(silences, opts);
  return silences
    .map((s) => ({ start: s.start, end: s.end, duration: s.end - s.start }))
    .map((g) => ({
      ...g,
      kind: (g.duration < questionGap
        ? "micro"
        : g.duration >= threshold
          ? "boundary"
          : "question") as GapKind,
    }));
}

export function speechCandidates(
  silences: Silence[],
  duration: number,
  minSegment = 1,
  opts: DetectOptions = {},
) {
  // Chỉ cắt ở khoảng ngừng giữa câu / chuyển đề. Khoảng ngừng ngắn trong
  // lời thoại (micro) không được cắt — đó không phải ranh giới câu hỏi.
  // Mép ứng viên bám mép khoảng lặng để đoạn không nuốt nửa khoảng nghỉ.
  const gaps = classifyGaps(silences, opts);
  const blocking = gaps
    .filter((g) => g.kind !== "micro" && g.start > 0 && g.end < duration)
    .sort((a, b) => a.start - b.start);
  const spans: Span[] = [];
  let cursor = 0;
  for (const g of blocking) {
    if (g.start > cursor) spans.push({ start: cursor, end: g.start });
    cursor = Math.max(cursor, g.end);
  }
  if (cursor < duration) spans.push({ start: cursor, end: duration });
  return spans.filter((s) => s.end - s.start >= minSegment);
}

/** Gộp count lần tại khoảng ngừng giữa hai ứng viên không phải ranh giới chuyển đề. */
function mergeWithin(list: Span[], between: Between[], count: number) {
  const spans = list.map((s) => ({ ...s }));
  const gaps = between.map((b) => ({ ...b }));
  const merges: { gap: number; at: number }[] = [];
  for (let k = 0; k < count; k++) {
    let best = -1,
      bestGap = Infinity;
    for (let i = 0; i < gaps.length; i++) {
      if (gaps[i].kind !== "boundary" && gaps[i].gap < bestGap) {
        bestGap = gaps[i].gap;
        best = i;
      }
    }
    if (best < 0) return { spans, merges, done: false };
    const a = spans[best],
      b = spans[best + 1];
    merges.push({ gap: bestGap, at: (a.end + b.start) / 2 });
    spans.splice(best, 2, { start: a.start, end: b.end });
    gaps.splice(best, 1);
  }
  return { spans, merges, done: true };
}

/** Tách count lần tại khoảng ngừng ngắn (micro) lớn nhất nằm trong ứng viên. */
function splitWithin(list: Span[], microGaps: ClassifiedGap[], count: number) {
  const spans = list.map((s) => ({ ...s }));
  const splits: { gap: number; at: number }[] = [];
  for (let k = 0; k < count; k++) {
    let best = -1,
      bestGap = -Infinity,
      bestAt = 0;
    for (let i = 0; i < spans.length; i++) {
      for (const g of microGaps) {
        if (
          g.start >= spans[i].start &&
          g.end <= spans[i].end &&
          g.duration > bestGap
        ) {
          bestGap = g.duration;
          best = i;
          bestAt = (g.start + g.end) / 2;
        }
      }
    }
    if (best < 0) return { spans, splits, done: false };
    const a = spans[best];
    spans.splice(
      best,
      1,
      { start: a.start, end: bestAt },
      { start: bestAt, end: a.end },
    );
    splits.push({ gap: bestGap, at: bestAt });
  }
  return { spans, splits, done: true };
}

/**
 * Một file audio = một đề TOEIC trọn vẹn 100 câu / 54 nhóm. Cấu trúc cố
 * định: Part 1: 6 nhóm, Part 2: 25 nhóm, Part 3: 13 nhóm × 3 câu,
 * Part 4: 10 nhóm × 3 câu. Khoảng ngừng dài là ranh giới Part/chuyển phần
 * — KHÔNG bao giờ được gộp hai ứng viên nằm hai bên ranh giới đó.
 *
 * fitGranularity chọn mức (54 nhóm hay 100 câu) cần đạt, phân bổ số nhóm
 * cho từng đoạn sao cho các ranh giới chuyển đề khớp ranh giới Part
 * (sau câu 6/31/44 hoặc 6/31/70), rồi gộp/tách trong từng đoạn.
 */
function fitGranularity(
  cands: Span[],
  between: Between[],
  microGaps: ClassifiedGap[],
  target: 54 | 100,
) {
  const n = cands.length;
  if (!n) return null;
  // Chia đoạn theo khoảng ngừng chuyển đề/phần.
  const blocks: Span[][] = [];
  const blockGaps: Between[][] = [];
  let cur: Span[] = [cands[0]],
    curGaps: Between[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (between[i].kind === "boundary") {
      blocks.push(cur);
      blockGaps.push(curGaps);
      cur = [cands[i + 1]];
      curGaps = [];
    } else {
      curGaps.push(between[i]);
      cur.push(cands[i + 1]);
    }
  }
  blocks.push(cur);
  blockGaps.push(curGaps);
  const m = blocks.length;
  const counts = blocks.map((b) => b.length);
  const capacity = blocks.map((b) => {
    const start = b[0].start,
      end = b[b.length - 1].end;
    return microGaps.filter((g) => g.start >= start && g.end <= end).length;
  });
  const align = target === 54 ? [6, 31, 44] : [6, 31, 70];
  // DP: phân bổ s_b nhóm cho từng đoạn, tổng = target.
  const size = target + 1;
  const score: number[][] = Array.from({ length: m }, () =>
    Array(size).fill(-Infinity),
  );
  const pick: number[][] = Array.from({ length: m }, () => Array(size).fill(0));
  for (let s = 1; s <= counts[0] + capacity[0] && s < size; s++) {
    score[0][s] =
      (m > 1 && align.includes(s) ? 2 : 0) -
      0.1 * Math.max(0, counts[0] - s) -
      0.2 * Math.max(0, s - counts[0]);
    pick[0][s] = s;
  }
  for (let b = 1; b < m; b++) {
    for (let g = 0; g < size; g++) {
      if (!Number.isFinite(score[b - 1][g])) continue;
      for (let s = 1; s <= counts[b] + capacity[b] && g + s < size; s++) {
        const value =
          score[b - 1][g] -
          0.1 * Math.max(0, counts[b] - s) -
          0.2 * Math.max(0, s - counts[b]) +
          (b < m - 1 && align.includes(g + s) ? 2 : 0);
        if (value > score[b][g + s]) {
          score[b][g + s] = value;
          pick[b][g + s] = s;
        }
      }
    }
  }
  const final = score[m - 1][target];
  if (!Number.isFinite(final)) return null;
  const perBlock: number[] = Array(m).fill(0);
  let g = target;
  for (let b = m - 1; b >= 0; b--) {
    perBlock[b] = pick[b][g];
    g -= perBlock[b];
  }
  // Gộp/tách trong từng đoạn về số nhóm đã chọn.
  const units: Span[] = [];
  let merges = 0,
    splits = 0;
  const mergeList: { gap: number; at: number }[] = [],
    splitList: { gap: number; at: number }[] = [];
  for (let b = 0; b < m; b++) {
    let list = blocks[b],
      gaps = blockGaps[b];
    const need = perBlock[b];
    if (need < list.length) {
      const r = mergeWithin(list, gaps, list.length - need);
      if (!r.done) return null;
      list = r.spans;
      merges += r.merges.length;
      mergeList.push(...r.merges);
    } else if (need > list.length) {
      const r = splitWithin(
        list,
        microGaps.filter((g) => g.start >= blocks[b][0].start && g.end <= blocks[b][blocks[b].length - 1].end),
        need - list.length,
      );
      if (!r.done) return null;
      list = r.spans;
      splits += r.splits.length;
      splitList.push(...r.splits);
    }
    units.push(...list);
  }
  if (units.length !== target) return null;
  // Ghép mức câu (100) vào 54 nhóm: Part 3–4 mỗi nhóm 3 câu.
  const slots: (Span | null)[] = Array(54).fill(null);
  if (target === 54) {
    for (let i = 0; i < 54; i++) slots[i] = units[i];
  } else {
    for (const group of listeningGroups) {
      const i = group.questionStart - 1,
        count = group.questionEnd - group.questionStart + 1;
      slots[group.slot - 1] = {
        start: units[i].start,
        end: units[i + count - 1].end,
      };
    }
  }
  let aligned = 0,
    cumulative = 0;
  for (let b = 0; b < m - 1; b++) {
    cumulative += perBlock[b];
    if (align.includes(cumulative)) aligned++;
  }
  const notes: string[] = [];
  if (m > 1)
    notes.push(
      `File chia thành ${m} đoạn theo khoảng ngừng chuyển đề/phần; ${aligned}/${m - 1} ranh giới khớp ranh giới Part (sau câu ${align.join("/")}).`,
    );
  if (target === 100)
    notes.push(
      "100 ứng viên khớp số câu Listening; đã gộp 3 câu/nhóm ở Parts 3–4 theo cấu trúc TOEIC.",
    );
  if (merges)
    notes.push(
      `Đã gộp ${merges} khoảng ngừng ngắn nhất trong cùng đoạn (không gộp qua ranh giới chuyển đề).`,
    );
  if (splits)
    notes.push(`Đã tách ${splits} vị trí dính liền theo khoảng ngừng ngắn.`);
  if (!merges && !splits && target === 54)
    notes.push("54 ứng viên khớp đúng 54 nhóm TOEIC.");
  return {
    slots,
    merges,
    splits,
    score: final,
    evidence:
      merges && splits
        ? "silence-merged"
        : merges
          ? "silence-merged"
          : splits
            ? "silence-split"
            : target === 100
              ? "silence-structure"
              : "silence-only",
    confidence: merges || splits ? 0.1 : 0.15,
    notes,
    feasible: true,
  };
}

function fitBest(cands: Span[], between: Between[], microGaps: ClassifiedGap[]) {
  const options = [54, 100] as const;
  let best: ReturnType<typeof fitGranularity> = null;
  for (const target of options) {
    const r = fitGranularity(cands, between, microGaps, target);
    if (!r) continue;
    if (!best || r.score > best.score) best = r;
  }
  return best;
}

/**
 * Cửa sổ “đề”: một file = một đề (theo yêu cầu 100 câu/file). Chỉ khi
 * transcript lặp lại “Question one” (đánh số bắt đầu lại) mới tách nhiều
 * đề trong cùng file — bằng chứng dương, không đoán theo khoảng lặng.
 */
export function detectWindows(
  gaps: ClassifiedGap[],
  duration: number,
  candidates: Span[],
  anchors: { question: number; time: number; restart?: boolean }[] = [],
): WindowInfo[] {
  const restarts = anchors
    .filter((a) => a.restart && a.time > 0.5 && a.time < duration - 0.5)
    .map((a) => a.time)
    .sort((a, b) => a - b);
  const build = (bounds: number[]): Span[][] => {
    const parts: Span[][] = bounds.slice(0, -1).map(() => [] as Span[]);
    for (const c of candidates) {
      let segs = [c];
      for (const t of bounds.slice(1, -1)) {
        const next: Span[] = [];
        for (const s of segs)
          if (t > s.start + 0.05 && t < s.end - 0.05)
            next.push({ start: s.start, end: t }, { start: t, end: s.end });
          else next.push(s);
        segs = next;
      }
      for (const s of segs) {
        let index = 0;
        for (let i = 0; i < bounds.length - 1; i++)
          if (s.start >= bounds[i] - 0.01) index = i;
        parts[index].push(s);
      }
    }
    return parts.filter((p) => p.length);
  };
  const groups = build([0, ...restarts, duration]);
  const blocks: ClassifiedGap[] = gaps.filter(
    (g) => g.kind === "boundary" && g.start > 0 && g.end < duration,
  );
  return groups.map((list, index) => ({
    index,
    start: list[0].start,
    end: list[list.length - 1].end,
    candidates: list,
    count: list.length,
    regular: list.length === 54 || list.length === 100,
    note:
      (restarts.length
        ? `Đề ${index + 1}/${groups.length} theo mốc số câu bắt đầu lại. `
        : "") +
      (blocks.length
        ? `Có ${blocks.length} khoảng ngừng chuyển đề/phần trong đề; `
        : "") +
      (list.length === 54
        ? "khớp 54 nhóm TOEIC (Part 1:6, Part 2:25, Part 3:13, Part 4:10)."
        : list.length === 100
          ? "khớp 100 câu Listening; Parts 3–4 gộp 3 câu/nhóm."
          : `${list.length} ứng viên — sẽ gộp/tách về 54 nhóm hay 100 câu nếu đủ khoảng ngừng.`),
  }));
}

function bestWindow(windows: WindowInfo[]) {
  let best = 0,
    bestScore = -Infinity;
  windows.forEach((w, i) => {
    const score =
      (w.count === 54 ? 300 : w.count === 100 ? 200 : w.regular ? 100 : 0) - i;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function proposeSegments(
  silences: Silence[],
  duration: number,
  transcript: Transcript[],
  questionTexts: Map<number, string> = new Map(),
  options: DetectOptions = {},
) {
  const gaps = classifyGaps(silences, options),
    threshold = boundaryThreshold(silences, options),
    candidates = speechCandidates(silences, duration, 1, options),
    anchors = transcriptAnchors(transcript),
    windows = detectWindows(gaps, duration, candidates, anchors),
    selectedWindow =
      options.window !== null &&
      options.window !== undefined &&
      windows[options.window]
        ? options.window
        : bestWindow(windows),
    win = windows[selectedWindow],
    microGaps = gaps.filter((g) => g.kind === "micro"),
    gapStats = { micro: 0, question: 0, boundary: 0 };
  for (const g of gaps) gapStats[g.kind]++;
  const segments = blankSegments();
  // Ứng viên của đề đang chọn + loại khoảng ngừng giữa các ứng viên đó.
  const winGaps = gaps.filter(
    (g) =>
      g.kind !== "micro" &&
      g.start >= win.start - 0.01 &&
      g.end <= win.end + 0.01,
  );
  const between: Between[] = win.candidates.slice(0, -1).map((c, i) => {
    const next = win.candidates[i + 1];
    const g = winGaps.find((g) => g.start >= c.end - 0.05 && g.end <= next.start + 0.05);
    return { gap: next.start - c.end, kind: g ? g.kind : "question" };
  });
  // Lớp 1: cấu trúc TOEIC 54 nhóm / 100 câu theo phân loại khoảng ngừng.
  const base = fitBest(win.candidates, between, microGaps);
  if (base)
    for (let i = 0; i < segments.length; i++) {
      const b = base.slots[i];
      if (!b) continue;
      segments[i].start = b.start;
      segments[i].end = b.end;
      segments[i].confidence = base.confidence;
      segments[i].evidence = base.evidence;
      segments[i].reason =
        base.notes.join(" ") +
        " Chỉ là đề xuất theo khoảng lặng; cần nghe kiểm tra và xác nhận thủ công.";
    }
  const inWindow = (t: number) => t >= win.start - 0.05 && t < win.end - 0.001;
  // Lớp 2: mốc số câu nói trong transcript (trong phạm vi đề đang chọn).
  for (const s of segments) {
    const a = anchors.find(
      (a) => a.question === s.questionStart && inWindow(a.time),
    );
    if (!a) continue;
    const next = listeningGroups.find((g) => g.slot === s.slot + 1),
      nextAnchor = anchors.find(
        (a) => a.question === next?.questionStart && inWindow(a.time),
      );
    s.start = s.slot === 1 ? win.start : a.time;
    s.end = s.slot === 54 ? win.end : (nextAnchor?.time ?? null);
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
      const tokens = [...new Set(text.toLowerCase().match(/[a-z]{4,}/g) || [])];
      const matched = tokens.filter((w) => snippet.includes(w));
      if (matched.length >= 3)
        s.reason += ` Có ${matched.length} từ khóa chung với nội dung câu hỏi/PDF; đây chưa phải xác minh ngữ nghĩa.`;
    }
  }
  // Lớp 3: khớp từ khóa transcript ↔ nội dung câu hỏi cho slot chưa có mốc.
  for (const s of segments) {
    if (anchors.some((a) => a.question === s.questionStart && inWindow(a.time)))
      continue;
    const source = questionTexts.get(s.questionStart);
    if (!source || !transcript.length) continue;
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
    const scores = win.candidates
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
    if (scores[0] && (!scores[1] || scores[0].score - scores[1].score >= 0.1)) {
      const c = win.candidates[scores[0].index];
      s.start = c.start;
      s.end = c.end;
      s.confidence = 0.4 + Math.min(0.2, scores[0].score * 0.2);
      s.evidence = "text-overlap";
      s.reason = `Có ${scores[0].hits} từ khóa chung giữa transcript và câu hỏi/PDF. Chưa xác minh nội dung hay ranh giới; cần nghe đối chiếu.`;
    }
  }
  const parts: string[] = [];
  if (windows.length > 1)
    parts.push(
      `Phát hiện ${windows.length} đề trong file theo mốc số câu bắt đầu lại (${windows
        .map((w) => `đề ${w.index + 1}: ${w.count} ứng viên`)
        .join(", ")}). Đang ánh xạ đề ${selectedWindow + 1}; chọn lại đề nếu sai.`,
    );
  parts.push(
    `Phân loại khoảng lặng: ${gapStats.micro} khoảng ngừng ngắn trong lời thoại (không cắt), ${gapStats.question} khoảng ngừng giữa câu, ${gapStats.boundary} khoảng ngừng chuyển đề/phần (ngưỡng ${threshold.toFixed(1)}s).`,
  );
  if (!base)
    parts.push(
      `Ứng viên theo khoảng lặng (${win.count}) chưa đủ cơ sở ghép về 54 nhóm/100 câu; các slot chưa có mốc sẽ để trống.`,
    );
  parts.push(
    "Mỗi file ánh xạ trọn một đề 100 câu. Mọi đề xuất đều chưa xác minh nội dung; cần nghe kiểm tra và xác nhận từng nhóm.",
  );
  return {
    segments,
    candidates,
    anchors,
    windows,
    gapStats,
    boundaryThreshold: threshold,
    selectedWindow,
    warning: parts.join(" "),
  };
}
function tPrecision(t: Transcript[], time: number) {
  return t.some((t) => t.words?.some((w) => Math.abs(w.start - time) < 0.05));
}
