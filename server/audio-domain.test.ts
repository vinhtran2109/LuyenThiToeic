import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listeningGroups,
  blankSegments,
  validateSegments,
  proposeSegments,
  transcriptAnchors,
  transcriptMarkers,
  spokenNumber,
  classifyGaps,
  type Silence,
} from "./audio-domain";
test("54 TOEIC groups cover 100 questions with 6/25/13/10 group structure", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((p) => listeningGroups.filter((g) => g.part === p).length),
    [6, 25, 13, 10],
  );
  assert.deepEqual(
    listeningGroups.flatMap((g) =>
      Array.from(
        { length: g.questionEnd - g.questionStart + 1 },
        (_, i) => g.questionStart + i,
      ),
    ),
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
});
test("54 silence regions never prove semantic correctness or become confirmed", () => {
  const silences = Array.from({ length: 53 }, (_, i) => ({
    start: (i + 1) * 10 - 0.5,
    end: (i + 1) * 10 + 0.5,
  }));
  const result = proposeSegments(silences, 540, []);
  assert.equal(result.candidates.length, 54);
  assert.equal(result.segments.filter((s) => s.start !== null).length, 54);
  assert.ok(
    result.segments.every(
      (s) =>
        !s.confirmed && s.confidence <= 0.15 && s.evidence === "silence-only",
    ),
  );
  assert.equal(validateSegments(result.segments, 540).canPublish, false);
});
test("wrong silence count leaves unidentified groups, not guessed first 54 assignments", () => {
  const r = proposeSegments([{ start: 5, end: 7 }], 15, []);
  assert.equal(r.candidates.length, 2);
  assert.ok(r.segments.every((s) => s.start === null && s.end === null));
});
test("timestamped spoken group markers can propose boundaries, but never confirm", () => {
  const r = proposeSegments([], 100, [
    { start: 4, end: 6, text: "Question one." },
    { start: 10, end: 12, text: "Number two." },
    { start: 20, end: 22, text: "Questions thirty-two through thirty-four." },
  ]);
  // Nhóm 1 bắt đầu đúng tại mốc “Question one”, không nuốt phần đầu file.
  assert.equal(r.segments[0].start, 4);
  assert.equal(r.segments[0].end, 10);
  assert.equal(r.segments[31].start, 20);
  assert.equal(r.segments[31].end, null);
  assert.ok(r.segments.every((s) => !s.confirmed));
  assert.equal(spokenNumber("one hundred"), 100);
  assert.equal(spokenNumber("ninety-eight"), 98);
});
test("mapping validator catches missing, overlap, duplicate groups, bad bounds and order", () => {
  const s = blankSegments().map((s, i) => ({
    ...s,
    start: i * 10,
    end: (i + 1) * 10,
    confirmed: true,
  }));
  assert.equal(validateSegments(s, 540).canPublish, true);
  assert.equal(
    validateSegments(
      s.map((x, i) => (i === 1 ? { ...x, start: 5 } : x)),
      540,
    ).overlaps.length,
    1,
  );
  assert.ok(
    validateSegments(
      s.map((x, i) =>
        i === 1 ? { ...x, part: 1, questionStart: 1, questionEnd: 1 } : x,
      ),
      540,
    ).duplicates.includes(1),
  );
  assert.ok(
    validateSegments(
      s.map((x, i) => (i === 0 ? { ...x, start: -1 } : x)),
      540,
    ).invalid.length,
  );
  assert.equal(
    validateSegments(
      s.map((x, i) => (i === 0 ? { ...x, confirmed: false } : x)),
      540,
    ).canPublish,
    false,
  );
  assert.equal(validateSegments(blankSegments(), 540).missing.length, 54);
});
test("transcript anchors use word timestamp when available", () => {
  assert.equal(
    transcriptAnchors([
      {
        start: 0,
        end: 10,
        text: "Now. Question one.",
        words: [
          { start: 0, end: 1, word: "Now." },
          { start: 3, end: 4, word: "question" },
          { start: 4, end: 5, word: "one" },
        ],
      },
    ])[0].time,
    3,
  );
});
test("numbers spoken inside the dialogue are not question markers", () => {
  // “van number five” nằm giữa câu: không phải mốc câu hỏi.
  const markers = transcriptMarkers([
    { start: 0, end: 6, text: "We were about to pack van number five for the show." },
    { start: 8, end: 12, text: "We can use van number three instead." },
    { start: 20, end: 22, text: "Number 32." },
  ]);
  assert.deepEqual(
    markers.map((m) => m.question),
    [32],
  );
  const anchors = transcriptAnchors([
    { start: 0, end: 6, text: "We were about to pack van number five for the show." },
    { start: 20, end: 22, text: "Number 32." },
  ]);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].question, 32);
});
test("a count in the dialogue never splits a file into several tests", () => {
  // Mốc giả “number three” làm file bị chia thành 3 đề và chỉ map được
  // nửa đầu file — đúng lỗi đã gặp trên audio TOEIC thật.
  const transcript = [
    { start: 0, end: 4, text: "Number 1. Look at the picture marked number 1." },
    { start: 20, end: 24, text: "Number 2. Look at the picture marked number 2." },
    { start: 40, end: 46, text: "We were about to pack van number five for the show." },
    { start: 60, end: 66, text: "We can use van number three instead." },
    { start: 80, end: 84, text: "Number 3. Look at the picture marked number 3." },
  ];
  const r = proposeSegments([], 120, transcript);
  assert.equal(r.windows.length, 1);
  assert.equal(r.anchors.filter((a) => a.restart).length, 0);
  assert.equal(r.segments[0].start, 0);
  assert.equal(r.segments[1].start, 20);
  assert.equal(r.segments[2].start, 80);
});
test("a full TOEIC transcript maps all 54 groups in order", () => {
  // Transcript kiểu audio ETS: Part 1–2 công bố “Number N.”, Part 3–4
  // công bố “Questions X through Y…”, xen một số đếm nói trong lời thoại.
  const transcript: { start: number; end: number; text: string }[] = [];
  let t = 0;
  const push = (text: string) => {
    transcript.push({ start: t, end: t + 1, text });
    t += 25;
  };
  for (let q = 1; q <= 6; q++) push(`Number ${q}. Look at the picture.`);
  for (let q = 7; q <= 31; q++) push(`Number ${q}.`);
  push("We were about to pack van number five for the show.");
  for (const g of listeningGroups.filter((g) => g.part === 3))
    push(`Questions ${g.questionStart} through ${g.questionEnd} refer to the following conversation.`);
  push("We can use van number three instead.");
  for (const g of listeningGroups.filter((g) => g.part === 4))
    push(`Questions ${g.questionStart} through ${g.questionEnd} refer to the following talk.`);
  const duration = t + 10;
  const r = proposeSegments([], duration, transcript);
  assert.equal(r.windows.length, 1);
  assert.equal(r.segments.filter((s) => s.start !== null && s.end !== null).length, 54);
  assert.equal(r.segments[0].start, 0); // mốc “Number 1”
  assert.equal(r.segments[31].start, 800); // “Questions 32 through 34”
  const v = validateSegments(r.segments, duration);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.overlaps, []);
  assert.equal(v.outOfOrder, false);
  for (let i = 1; i < 54; i++)
    assert.ok(
      r.segments[i].start! >= r.segments[i - 1].end!,
      `slot ${i + 1} chồng lấn slot ${i}`,
    );
  assert.equal(r.segments[53].end, duration);
});
test("gap classification separates mid-speech pauses, question gaps and test-transition gaps", () => {
  const silences: Silence[] = [
    ...Array.from({ length: 20 }, (_, i) => ({
      start: i * 10 + 6,
      end: i * 10 + 6.5,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      start: i * 10 + 8,
      end: i * 10 + 9,
    })),
    { start: 210, end: 230 },
    ...Array.from({ length: 10 }, (_, i) => ({
      start: 240 + i * 10 + 8,
      end: 240 + i * 10 + 9,
    })),
  ];
  const gaps = classifyGaps(silences);
  assert.equal(gaps.filter((g) => g.kind === "micro").length, 20);
  assert.equal(gaps.filter((g) => g.kind === "question").length, 30);
  assert.equal(gaps.filter((g) => g.kind === "boundary").length, 1);
  assert.equal(gaps.find((g) => g.kind === "boundary")!.start, 210);
  assert.equal(
    classifyGaps(silences, { autoBoundary: false, boundaryGap: 25 }).filter(
      (g) => g.kind === "boundary",
    ).length,
    0,
  );
});
test("part-transition pauses are not question gaps: one file maps a full 100-question test", () => {
  // 4 đoạn theo Part: 6/25/39/30 câu, mỗi câu 3s, giữa câu nghỉ 1s,
  // chuyển Part nghỉ 8s. Ứng viên phải ghép đúng 54 nhóm trùm đủ 100 câu.
  const silences: Silence[] = [];
  const parts = [6, 25, 39, 30];
  let t = 0;
  for (const [pi, count] of parts.entries()) {
    for (let i = 0; i < count; i++) {
      t += 3;
      const last = i === count - 1;
      if (!last || pi < parts.length - 1) {
        const gap = last ? 8 : 1;
        silences.push({ start: t, end: t + gap });
        t += gap;
      }
    }
  }
  const r = proposeSegments(silences, t, []);
  assert.equal(r.candidates.length, 100);
  assert.equal(r.gapStats.boundary, 3);
  assert.equal(r.segments.filter((s) => s.start !== null).length, 54);
  const s31 = r.segments[30], // câu 31 — cuối Part 2
    s32 = r.segments[31], // nhóm câu 32–34 — đầu Part 3
    last = r.segments[53];
  assert.ok(s31.end !== null && s32.start !== null);
  assert.ok(s31.end! < s32.start!); // ranh giới Part không bị gộp
  assert.ok(Math.abs(last.end! - t) < 0.5); // trùm hết 100 câu trong file
  assert.ok(r.segments.every((s) => !s.confirmed && s.confidence <= 0.15));
});
test("group-level audio with long part pauses keeps one group per candidate", () => {
  const silences: Silence[] = [];
  const parts = [6, 25, 13, 10];
  let t = 0;
  for (const [pi, count] of parts.entries()) {
    for (let i = 0; i < count; i++) {
      t += 3;
      const last = i === count - 1;
      if (!last || pi < parts.length - 1) {
        silences.push({ start: t, end: t + (last ? 8 : 1) });
        t += last ? 8 : 1;
      }
    }
  }
  const r = proposeSegments(silences, t, []);
  assert.equal(r.candidates.length, 54);
  assert.equal(r.gapStats.boundary, 3);
  assert.equal(r.segments.filter((s) => s.start !== null).length, 54);
  assert.ok(
    r.segments.every(
      (s) => s.evidence === "silence-only" && !s.confirmed && s.confidence <= 0.15,
    ),
  );
});
test("question-level audio (100 candidates) groups Parts 3-4 three per TOEIC group", () => {
  const silences = Array.from({ length: 99 }, (_, i) => ({
    start: (i + 1) * 6 - 0.5,
    end: (i + 1) * 6 + 0.5,
  }));
  const r = proposeSegments(silences, 600, []);
  assert.equal(r.candidates.length, 100);
  assert.equal(r.segments.filter((s) => s.start !== null).length, 54);
  const s32 = r.segments[31]; // slot 32 = câu 32–34
  assert.ok(Math.abs(s32.start! - 186) < 0.6);
  assert.ok(Math.abs(s32.end! - 204) < 0.6);
  const s1 = r.segments[0], // slot 1 = câu 1
    s31 = r.segments[30]; // slot 31 = câu 31
  assert.ok(Math.abs(s1.start! - 0) < 0.6 && Math.abs(s1.end! - 6) < 0.6);
  assert.ok(Math.abs(s31.start! - 180) < 0.6 && Math.abs(s31.end! - 186) < 0.6);
  assert.ok(r.segments.every((s) => !s.confirmed && s.confidence <= 0.15));
});
test("extra short splits merge across the smallest gaps, never confirmed", () => {
  const silences: Silence[] = [];
  let t = 0;
  for (let i = 0; i < 56; i++) {
    t += 3;
    if (i < 55) {
      const gap = i === 10 || i === 30 ? 0.9 : 1.5;
      silences.push({ start: t, end: t + gap });
      t += gap;
    }
  }
  const r = proposeSegments(silences, t, []);
  assert.equal(r.candidates.length, 56);
  assert.equal(r.segments.filter((s) => s.start !== null).length, 54);
  assert.ok(r.segments.some((s) => s.evidence === "silence-merged"));
  assert.ok(r.segments.every((s) => !s.confirmed && s.confidence <= 0.15));
});
test("question gap below threshold is split back at the inner pause when too few candidates", () => {
  const silences: Silence[] = [];
  let t = 0;
  for (let i = 0; i < 54; i++) {
    t += 3;
    if (i < 53) {
      const gap = i === 20 ? 0.5 : 1.2;
      silences.push({ start: t, end: t + gap });
      t += gap;
    }
  }
  const r = proposeSegments(silences, t, []);
  assert.equal(r.candidates.length, 53);
  assert.equal(r.segments.filter((s) => s.start !== null).length, 54);
  assert.ok(r.segments.some((s) => s.evidence === "silence-split"));
  assert.ok(r.segments.every((s) => !s.confirmed && s.confidence <= 0.15));
});
test("restarted question numbering marks a new test window with its own anchors", () => {
  const transcript = [
    { start: 2, end: 4, text: "Question one." },
    { start: 10, end: 12, text: "Number two." },
    { start: 58, end: 60, text: "Question one." },
    { start: 70, end: 72, text: "Number two." },
  ];
  const r = proposeSegments([], 120, transcript);
  assert.equal(r.anchors.filter((a: any) => a.restart).length, 1);
  assert.equal(r.windows.length, 2);
  assert.equal(r.windows[0].candidates.length, 1);
  assert.equal(r.segments[0].start, 2);
  assert.equal(r.segments[1].start, 10);
  const r2 = proposeSegments([], 120, transcript, new Map(), { window: 1 });
  assert.equal(r2.selectedWindow, 1);
  assert.equal(r2.segments[0].start, 58);
  assert.equal(r2.segments[1].start, 70);
  assert.ok(r2.segments.every((s) => !s.confirmed));
});
