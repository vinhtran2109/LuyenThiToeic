import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { seed } from "./seed";
import { grade, inSection, mappingConflict, partOf } from "./core";
import { runReadingImport } from "./reading-import";
import { runListeningImport } from "./listening-import";
import { audioRouter } from "./audio-api";
import { listeningGroups } from "./audio-domain";
import { probeAudio } from "./audio-ffmpeg";
const db = new PrismaClient();
await seed(db);
await fs.mkdir("uploads", { recursive: true });
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.resolve("uploads")));
app.use("/api/audio", audioRouter(db));
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const decode = (a: any) => ({
  ...a,
  answers: JSON.parse(a.answers),
  flags: JSON.parse(a.flags),
});
const decodeQ = (q: any, reveal = false) => ({
  ...q,
  sourcePages: JSON.parse(q.sourcePages || "[]"),
  options: JSON.parse(q.options),
  answer: reveal ? q.answer : undefined,
  explanation: reveal ? q.explanation : undefined,
});
app.get(
  "/api/answer-keys",
  wrap(async (_req: any, res: any) => {
    const sets = await db.answerKeySet.findMany({
      orderBy: [{ section: "asc" }, { testNumber: "asc" }],
      include: {
        document: { select: { id: true, name: true, path: true } },
        test: { select: { id: true, title: true } },
      },
    });
    res.json(
      sets.map(({ answers, ...set }) => ({
        ...set,
        count: Object.keys(JSON.parse(answers)).length,
        jsonUrl: `/api/answer-keys/${set.id}.json`,
      })),
    );
  }),
);
app.get(
  "/api/answer-keys/:id.json",
  wrap(async (req: any, res: any) => {
    const set = await db.answerKeySet.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${set.id}.json"`,
    );
    res.json(JSON.parse(set.answers));
  }),
);
app.get(
  "/api/tests",
  wrap(async (_req: any, res: any) =>
    res.json(
      (
        await db.test.findMany({
          where: { published: true },
          orderBy: [{ sourceDocumentId: "desc" }, { title: "asc" }],
          include: {
            questions: { select: { number: true, confirmed: true } },
            attempts: { orderBy: { startedAt: "desc" } },
            _count: { select: { questions: true } },
          },
        })
      ).map(({ questions, ...t }) => ({
        ...t,
        keyCounts: {
          reading: questions.filter((q) => q.number > 100 && q.confirmed)
            .length,
          listening: questions.filter((q) => q.number <= 100 && q.confirmed)
            .length,
        },
        attempts: t.attempts.map(decode),
      })),
    ),
  ),
);
app.get(
  "/api/tests/:id",
  wrap(async (req: any, res: any) => {
    const t = await db.test.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        questions: { orderBy: { number: "asc" } },
        mappings: {
          where: { confirmed: true },
          include: { document: true },
          orderBy: { sequence: "asc" },
        },
      },
    });
    res.json({ ...t, questions: t.questions.map((q) => decodeQ(q)) });
  }),
);
app.get(
  "/api/editor/:id",
  wrap(async (req: any, res: any) => {
    const t = await db.test.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { questions: { orderBy: { number: "asc" } } },
    });
    res.json({ ...t, questions: t.questions.map((q) => decodeQ(q, true)) });
  }),
);
app.put(
  "/api/questions/:id",
  wrap(async (req: any, res: any) => {
    const input = z
      .object({
        prompt: z.string().min(1),
        passage: z.string(),
        options: z.array(z.string().min(1)).min(3).max(4),
        answer: z.enum(["A", "B", "C", "D"]).nullable(),
        confirmed: z.boolean(),
        explanation: z.string(),
        image: z.string().nullable().optional(),
      })
      .parse(req.body);
    const q = await db.question.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (
      input.options.length !== (q.part === 2 ? 3 : 4) ||
      (input.confirmed && !input.answer) ||
      (input.answer && input.answer.charCodeAt(0) - 65 >= input.options.length)
    )
      throw Error("Đáp án hoặc số lựa chọn không hợp lệ cho Part.");
    res.json(
      await db.question.update({
        where: { id: q.id },
        data: { ...input, options: JSON.stringify(input.options) },
      }),
    );
  }),
);
app.post(
  "/api/attempts",
  wrap(async (req: any, res: any) => {
    const input = z
      .object({
        testId: z.string(),
        mode: z.enum(["practice", "exam"]),
        section: z.enum(["all", "listening", "reading"]),
      })
      .parse(req.body);
    const test = await db.test.findUniqueOrThrow({
      where: { id: input.testId },
      include: { _count: { select: { questions: true } } },
    });
    if (!test.published || !test._count.questions)
      throw Error("Đề chưa sẵn sàng để luyện tập.");
    if (test.section === "reading") input.section = "reading";
    if (input.section === "listening" && test.section === "reading")
      throw Error("Đề này chỉ có Reading.");
    if (input.mode === "exam" && input.section !== "reading") {
      const maps = await db.audioMapping.findMany({
        where: { testId: input.testId, confirmed: true },
      });
      const covered = new Set(
        maps.flatMap((m) =>
          Array.from(
            { length: m.questionEnd - m.questionStart + 1 },
            (_, i) => m.questionStart + i,
          ),
        ),
      );
      if (
        covered.size !== 100 ||
        maps.length !== 54 ||
        listeningGroups.some(
          (g) =>
            !maps.some(
              (m) =>
                m.sequence === g.slot &&
                m.part === g.part &&
                m.questionStart === g.questionStart &&
                m.questionEnd === g.questionEnd,
            ),
        )
      )
        return res.status(400).json({
          error:
            "Chế độ thi cần audio đã xác nhận cho đủ 100 câu Listening. Hãy dùng Luyện tập hoặc hoàn tất Audio Mapping.",
        });
    }
    const duration =
      input.section === "reading"
        ? 75
        : input.section === "listening"
          ? 45
          : 120;
    res.json(
      decode(
        await db.attempt.create({
          data: {
            id: randomUUID(),
            ...input,
            phase: input.section === "reading" ? "reading" : "prepared",
            current: input.section === "reading" ? 101 : 1,
            deadline: new Date(Date.now() + duration * 60000),
          },
        }),
      ),
    );
  }),
);
app.get(
  "/api/attempts",
  wrap(async (_req: any, res: any) =>
    res.json(
      (
        await db.attempt.findMany({
          include: { test: true },
          orderBy: { startedAt: "desc" },
        })
      ).map(decode),
    ),
  ),
);
app.post(
  "/api/attempts/:id/begin",
  wrap(async (req: any, res: any) => {
    const a = await db.attempt.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (a.phase !== "prepared" || a.status !== "active")
      return res.json(decode(a));
    res.json(
      decode(
        await db.attempt.update({
          where: { id: a.id },
          data: {
            phase: "listening",
            startedAt: new Date(),
            deadline: new Date(Date.now() + 120 * 60000),
          },
        }),
      ),
    );
  }),
);
app.get(
  "/api/attempts/:id",
  wrap(async (req: any, res: any) => {
    const a = await db.attempt.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        test: {
          include: {
            questions: { orderBy: { number: "asc" } },
            mappings: {
              where: { confirmed: true },
              include: { document: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    res.json({
      ...decode(a),
      test: {
        ...a.test,
        questions: a.test.questions.map((q) =>
          decodeQ(q, a.status === "completed"),
        ),
      },
    });
  }),
);
const stateSchema = z.object({
  answers: z.record(z.enum(["A", "B", "C", "D"])),
  flags: z.array(z.number().int().min(1).max(200)),
  current: z.number().int().min(1).max(200),
  audioIndex: z.number().int().min(0).optional(),
  audioPosition: z.number().min(0).optional(),
});
async function persist(req: any, submit: boolean) {
  const input = stateSchema.parse(req.body);
  const a = await db.attempt.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { test: { include: { questions: true } } },
  });
  if (a.status === "completed") return decode(a);
  const qs = a.test.questions.filter((q) => inSection(q.number, a.section));
  for (const [n, letter] of Object.entries(input.answers)) {
    const q = qs.find((q) => q.number === Number(n));
    if (!q || letter.charCodeAt(0) - 65 >= JSON.parse(q.options).length)
      throw Error("Lựa chọn không hợp lệ.");
  }
  if (!inSection(input.current, a.section))
    throw Error("Câu hỏi ngoài phần luyện tập.");
  let answers = input.answers;
  if (a.mode === "exam" && Date.now() > a.deadline.getTime())
    answers = JSON.parse(a.answers);
  const done =
    submit || (a.mode === "exam" && Date.now() >= a.deadline.getTime());
  const result = done ? grade(qs, answers) : null;
  return decode(
    await db.attempt.update({
      where: { id: a.id },
      data: {
        answers: JSON.stringify(answers),
        flags: JSON.stringify(input.flags),
        current: input.current,
        audioIndex: input.audioIndex ?? a.audioIndex,
        audioPosition: input.audioPosition ?? a.audioPosition,
        ...(a.mode === "exam" && a.current <= 100 && input.current > 100
          ? { phase: "reading", deadline: new Date(Date.now() + 75 * 60000) }
          : {}),
        elapsed: Math.max(
          0,
          Math.floor(
            (Math.min(
              Date.now(),
              a.mode === "exam" ? a.deadline.getTime() : Date.now(),
            ) -
              a.startedAt.getTime()) /
              1000,
          ),
        ),
        ...(result
          ? {
              ...result,
              status: "completed",
              completedAt: new Date(),
              score: null,
            }
          : {}),
      },
    }),
  );
}
app.put(
  "/api/attempts/:id",
  wrap(async (req: any, res: any) => res.json(await persist(req, false))),
);
app.post(
  "/api/attempts/:id/submit",
  wrap(async (req: any, res: any) => res.json(await persist(req, true))),
);
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (_r, f, cb) =>
    cb(null, randomUUID() + path.extname(f.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_r, f, cb) =>
    cb(
      null,
      [".pdf", ".mp3", ".wav", ".m4a", ".png", ".jpg", ".jpeg"].includes(
        path.extname(f.originalname).toLowerCase(),
      ),
    ),
});
app.get(
  "/api/documents",
  wrap(async (_req: any, res: any) =>
    res.json(await db.document.findMany({ orderBy: { createdAt: "desc" } })),
  ),
);
app.post(
  "/api/documents",
  upload.single("file"),
  wrap(async (req: any, res: any) => {
    if (!req.file)
      throw Error("Chọn PDF, MP3, WAV, M4A hoặc hình ảnh (tối đa 300 MB).");
    const f = req.file;
    const ext = path.extname(f.filename);
    let text = "",
      status = "ready";
    try {
      if (ext === ".pdf") {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await getDocument({
          data: new Uint8Array(await fs.readFile(f.path)),
          useSystemFonts: true,
        }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text +=
            `\n--- Trang ${i} ---\n` +
            content.items.map((v: any) => v.str ?? "").join(" ");
          page.cleanup();
        }
        status = text.replace(/--- Trang \d+ ---/g, "").trim()
          ? "review"
          : "needs-ocr";
        await pdf.destroy();
      }
    } catch {
      await fs.unlink(f.path);
      throw Error("Không đọc được PDF. Kiểm tra file hoặc mật khẩu.");
    }
    res.json(
      await db.document.create({
        data: {
          id: randomUUID(),
          name: f.originalname,
          kind: req.body.kind || "audio",
          path: `/uploads/${f.filename}`,
          mime: f.mimetype,
          size: f.size,
          status,
          text,
        },
      }),
    );
  }),
);
app.get(
  "/api/mappings/:testId",
  wrap(async (req: any, res: any) =>
    res.json(
      await db.audioMapping.findMany({
        where: { testId: req.params.testId },
        include: { document: true },
        orderBy: { sequence: "asc" },
      }),
    ),
  ),
);
const saveMapping = wrap(async (req: any, res: any) => {
  const data = z
    .object({
      testId: z.string(),
      documentId: z.string(),
      part: z.number().int().min(1).max(4),
      questionStart: z.number().int().min(1).max(100),
      questionEnd: z.number().int().min(1).max(100),
      groupId: z.string().min(1),
      start: z.number().min(0),
      end: z.number().positive(),
      sequence: z.number().int().min(1),
      gap: z.number().min(0),
    })
    .parse(req.body);
  if (
    data.end <= data.start ||
    data.questionEnd < data.questionStart ||
    partOf(data.questionStart) !== data.part ||
    partOf(data.questionEnd) !== data.part
  )
    throw Error("Khoảng thời gian hoặc phạm vi câu hỏi không hợp lệ.");
  const d = await db.document.findUniqueOrThrow({
    where: { id: data.documentId },
  });
  if (!/\.(mp3|wav|m4a)$/i.test(d.path))
    throw Error("Tài liệu không phải audio.");
  if (req.params.id) {
    const previous = await db.audioMapping.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (previous.projectId)
      throw Error(
        "Mapping này được quản lý trong /admin/audio-editor. Chỉnh sửa bản nháp và xuất bản lại tại đó.",
      );
  }
  if (
    await db.attempt.count({
      where: { testId: data.testId, mode: "exam", status: "active" },
    })
  )
    throw Error("Đề đang có bài thi nghiêm ngặt, chưa thể thay mapping.");
  const metadata = await probeAudio(path.resolve("." + d.path));
  if (data.end > metadata.duration + 0.01)
    throw Error("Khoảng mapping vượt quá thời lượng audio.");
  const others = await db.audioMapping.findMany({
    where: {
      testId: data.testId,
      ...(req.params.id ? { id: { not: req.params.id } } : {}),
    },
  });
  if (
    others.some((m) => mappingConflict(data, m) || m.sequence === data.sequence)
  )
    throw Error("Mapping trùng câu hỏi, khoảng audio hoặc thứ tự.");
  res.json(
    req.params.id
      ? await db.audioMapping.update({
          where: { id: req.params.id },
          data: { ...data, confirmed: true },
        })
      : await db.audioMapping.create({
          data: { id: randomUUID(), ...data, confirmed: true },
        }),
  );
});
app.post("/api/mappings", saveMapping);
app.put("/api/mappings/:id", saveMapping);
app.delete(
  "/api/mappings/:id",
  wrap(async (req: any, res: any) => {
    await db.audioMapping.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/keys/:testId",
  wrap(async (req: any, res: any) => {
    const input = z.record(z.enum(["A", "B", "C", "D"])).parse(req.body);
    const updates = [];
    for (const [n, answer] of Object.entries(input)) {
      const number = Number(n);
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 200 ||
        (partOf(number) === 2 && answer === "D")
      )
        throw Error(`Đáp án câu ${n} không hợp lệ.`);
      updates.push(
        db.question.update({
          where: { testId_number: { testId: req.params.testId, number } },
          data: { answer, confirmed: true },
        }),
      );
    }
    await db.$transaction(updates);
    res.json({ updated: updates.length });
  }),
);
const importConfig = z
  .object({
    testCount: z.number().int().min(1).max(50),
    pagesPerTest: z.number().int().min(1).max(500),
    coverPages: z.number().int().min(0).max(10),
    titlePrefix: z.string().trim().min(1).max(100),
  })
  .refine(
    (v) => v.coverPages < v.pagesPerTest,
    "Số trang bìa phải ít hơn số trang mỗi đề.",
  );
app.get(
  "/api/imports",
  wrap(async (_req: any, res: any) =>
    res.json(
      (await db.importJob.findMany({ orderBy: { createdAt: "desc" } })).map(
        (j) => ({ ...j, result: JSON.parse(j.result) }),
      ),
    ),
  ),
);
/** Mỗi tài liệu có một job cho Reading và một job cho Listening. */
async function findImportJob(docId: string, section: "reading" | "listening") {
  const jobs = await db.importJob.findMany({
    where: { documentId: docId, section },
    orderBy: { createdAt: "desc" },
  });
  return jobs[0];
}
app.post(
  "/api/documents/:id/reading-import",
  wrap(async (req: any, res: any) => {
    const doc = await db.document.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (!doc.path.endsWith(".pdf")) throw Error("Chọn tài liệu PDF.");
    const config = importConfig.parse(req.body);
    const existing = await findImportJob(doc.id, "reading");
    if (existing) {
      if (["queued", "ocr", "error"].includes(existing.status))
        void runReadingImport(db, existing.id, config);
      return res.json({ ...existing, result: JSON.parse(existing.result) });
    }
    const job = await db.importJob.create({
      data: {
        id: randomUUID(),
        documentId: doc.id,
        section: "reading",
        status: "queued",
        message: "Đang khởi động OCR trên máy của bạn…",
        result: JSON.stringify({ config, section: "reading" }),
      },
    });
    res.status(202).json({ ...job, result: { config, section: "reading" } });
    void runReadingImport(db, job.id, config);
  }),
);
app.post(
  "/api/documents/:id/listening-import",
  wrap(async (req: any, res: any) => {
    const doc = await db.document.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (!doc.path.endsWith(".pdf")) throw Error("Chọn tài liệu PDF.");
    const config = importConfig.parse(req.body);
    const existing = await findImportJob(doc.id, "listening");
    if (existing) {
      if (["queued", "ocr", "error"].includes(existing.status))
        void runListeningImport(db, existing.id, config);
      return res.json({ ...existing, result: JSON.parse(existing.result) });
    }
    const job = await db.importJob.create({
      data: {
        id: randomUUID(),
        documentId: doc.id,
        section: "listening",
        status: "queued",
        message: "Đang khởi động OCR trên máy của bạn…",
        result: JSON.stringify({ config, section: "listening" }),
      },
    });
    res.status(202).json({ ...job, result: { config, section: "listening" } });
    void runListeningImport(db, job.id, config);
  }),
);
app.put(
  "/api/imports/:id/locations",
  wrap(async (req: any, res: any) => {
    const job = await db.importJob.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (job.status !== "review")
      throw Error("Chỉ sửa vị trí trong giai đoạn kiểm tra.");
    const { config } = JSON.parse(job.result);
    const updates = z
      .array(
        z.object({
          test: z.number().int().min(1),
          question: z.number().int().min(101).max(200),
          page: z.number().int().min(1),
        }),
      )
      .min(1)
      .parse(req.body);
    const file = path.join(
      "uploads",
      `import-${job.documentId}`,
      "overrides.json",
    );
    let overrides: Record<string, Record<string, number>> = {};
    try {
      overrides = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {}
    for (const u of updates) {
      if (
        u.test > config.testCount ||
        u.page < (u.test - 1) * config.pagesPerTest + 1 + config.coverPages ||
        u.page > u.test * config.pagesPerTest
      )
        throw Error("Trang phải nằm trong phạm vi đề tương ứng.");
      overrides[u.test] ??= {};
      overrides[u.test][u.question] = u.page;
    }
    await fs.writeFile(file, JSON.stringify(overrides, null, 2));
    res.json({ ok: true });
    void runReadingImport(db, job.id, config);
  }),
);
app.post(
  "/api/imports/:id/publish",
  wrap(async (req: any, res: any) => {
    const job = await db.importJob.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    if (job.status === "published")
      return res.json({ ok: true, result: JSON.parse(job.result) });
    if (job.status !== "review") throw Error("OCR chưa hoàn tất.");
    const result = JSON.parse(job.result);
    const section = job.section ?? result.section ?? "reading";
    const tests = await db.test.findMany({
      where: { id: { in: result.tests.map((t: any) => t.testId) } },
      include: { questions: true },
    });
    if (tests.length !== result.config.testCount) throw Error("Thiếu bộ đề.");
    for (const t of tests) {
      if (t.questions.length !== 100) throw Error("Đề chưa đủ 100 câu.");
      if (new Set(t.questions.map((q) => q.number)).size !== 100)
        throw Error("Đề có câu hỏi trùng số.");
      if (section === "listening") {
        // Listening: 6/25/39/30 câu ở Part 1/2/3/4, mỗi nhóm có groupId đúng.
        if (
          [1, 2, 3, 4].some(
            (p, i) =>
              t.questions.filter((q) => q.part === p).length !==
              [6, 25, 39, 30][i],
          ) ||
          listeningGroups.some((g) => {
            const group = t.questions.filter(
              (q) => q.number >= g.questionStart && q.number <= g.questionEnd,
            );
            return group.some((q) => q.part !== g.part || q.groupId !== group[0].groupId);
          })
        )
          throw Error("Cấu trúc đề Listening chưa hợp lệ.");
      } else if (
        t.questions.some((q) => q.needsReview) ||
        [5, 6, 7].some(
          (p, i) =>
            t.questions.filter((q) => q.part === p).length !== [30, 16, 54][i],
        )
      )
        throw Error(
          "Còn vị trí câu hỏi cần kiểm tra hoặc cấu trúc đề chưa hợp lệ.",
        );
    }
    await db.$transaction([
      db.test.updateMany({
        where: { id: { in: tests.map((t) => t.id) } },
        data: { published: true },
      }),
      db.importJob.update({
        where: { id: job.id },
        data: {
          status: "published",
          message: `Đã tạo ${tests.length} đề ${
            section === "listening" ? "Listening" : "Reading"
          } để luyện tập.`,
        },
      }),
      db.document.update({
        where: { id: job.documentId },
        data: { status: "converted" },
      }),
    ]);
    res.json({ ok: true, result });
  }),
);
app.use(express.static(path.resolve("dist")));
app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: _req.originalUrl.startsWith("/api/audio")
        ? "File audio vượt giới hạn 1 GB."
        : "File vượt quá giới hạn 300 MB. Hãy tách tài liệu thành các phần nhỏ hơn.",
    });
  }
  console.error(err.message);
  res.status(err.code === "P2025" ? 404 : 400).json({
    error:
      err instanceof z.ZodError
        ? "Dữ liệu nhập chưa hợp lệ."
        : err.message || "Không xử lý được yêu cầu.",
  });
});
app.listen(3001, "127.0.0.1", () =>
  console.log("TOEIC API: http://127.0.0.1:3001"),
);
