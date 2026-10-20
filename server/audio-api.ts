import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  blankSegments,
  listeningGroups,
  validateSegments,
} from "./audio-domain";
import { initAudioJobs, whisperStatus } from "./audio-jobs";
import { binaries, command } from "./audio-ffmpeg";
const segmentSchema = z.object({
  slot: z.number().int().min(1).max(54),
  part: z.number().int().min(1).max(4),
  questionStart: z.number().int().min(1).max(100),
  questionEnd: z.number().int().min(1).max(100),
  start: z.number().finite().nullable(),
  end: z.number().finite().nullable(),
  confirmed: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(100),
  reason: z.string().max(2000),
});
const transcriptSchema = z
  .array(
    z.object({
      start: z.number().finite().min(0),
      end: z.number().finite().positive(),
      text: z.string().min(1).max(20000),
      words: z
        .array(
          z.object({
            start: z.number().min(0),
            end: z.number().positive(),
            word: z.string().max(1000),
          }),
        )
        .optional(),
    }),
  )
  .max(30000);
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export function audioRouter(db: PrismaClient) {
  const router = Router(),
    jobs = initAudioJobs(db);
  const dto = async (id: string) => {
    const p = await db.audioProject.findUniqueOrThrow({
      where: { id },
      include: {
        segments: { orderBy: { slot: "asc" } },
        jobs: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    });
    const document = await db.document.findUniqueOrThrow({
      where: { id: p.documentId },
    });
    return {
      ...p,
      metadata: JSON.parse(p.metadata),
      silences: JSON.parse(p.silences),
      transcript: JSON.parse(p.transcript),
      viewState: JSON.parse(p.viewState),
      jobs: p.jobs.map((j) => ({
        ...j,
        input: undefined,
        result: JSON.parse(j.result),
      })),
      document,
      validation: validateSegments(p.segments, p.duration),
    };
  };
  router.get(
    "/system",
    wrap(async (_r: any, res: any) => {
      let ffmpeg = false,
        ffprobe = false;
      try {
        await command(binaries.ffmpeg, ["-version"]);
        ffmpeg = true;
      } catch {}
      try {
        await command(binaries.ffprobe, ["-version"]);
        ffprobe = true;
      } catch {}
      res.json({
        ffmpeg,
        ffprobe,
        whisper: await whisperStatus(),
        groups: listeningGroups,
      });
    }),
  );
  router.get(
    "/projects",
    wrap(async (_r: any, res: any) => {
      const rows = await db.audioProject.findMany({
        orderBy: { createdAt: "desc" },
        include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const docs = await db.document.findMany({
        where: { id: { in: rows.map((p) => p.documentId) } },
      });
      res.json(
        rows.map((p) => ({
          ...p,
          metadata: JSON.parse(p.metadata),
          document: docs.find((d) => d.id === p.documentId),
          jobs: p.jobs.map((j) => ({
            ...j,
            input: undefined,
            result: undefined,
          })),
        })),
      );
    }),
  );
  const storage = multer.diskStorage({
    destination: "uploads",
    filename: (_r, f, cb) =>
      cb(null, randomUUID() + path.extname(f.originalname).toLowerCase()),
  });
  const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 1024 },
    fileFilter: (_r, f, cb) =>
      cb(null, /\.(mp3|wav|m4a)$/i.test(f.originalname)),
  });
  router.post(
    "/upload",
    upload.single("file"),
    wrap(async (req: any, res: any) => {
      if (!req.file) throw Error("Chọn MP3, WAV hoặc M4A, tối đa 1 GB.");
      const f = req.file,
        id = randomUUID();
      const decodedName = Buffer.from(f.originalname, "latin1").toString(
        "utf8",
      );
      if (!decodedName.includes("\ufffd")) f.originalname = decodedName;
      const doc = await db.document.create({
        data: {
          id: randomUUID(),
          name: f.originalname,
          path: `/uploads/${f.filename}`,
          kind: "audio",
          mime: f.mimetype,
          size: f.size,
          status: "ready",
        },
      });
      await db.audioProject.create({
        data: {
          id,
          documentId: doc.id,
          title: f.originalname,
          segments: {
            create: blankSegments().map((s) => ({ id: randomUUID(), ...s })),
          },
        },
      });
      await jobs.enqueue(id, "analyze");
      res.status(201).json(await dto(id));
    }),
  );
  router.post(
    "/projects",
    wrap(async (req: any, res: any) => {
      const { documentId } = z
        .object({ documentId: z.string() })
        .parse(req.body);
      const doc = await db.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      if (!/\.(mp3|wav|m4a)$/i.test(doc.path))
        throw Error("Tài liệu không phải audio.");
      const existing = await db.audioProject.findFirst({
        where: { documentId },
      });
      if (existing) return res.json(await dto(existing.id));
      const id = randomUUID();
      await db.audioProject.create({
        data: {
          id,
          documentId,
          title: doc.name,
          segments: {
            create: blankSegments().map((s) => ({ id: randomUUID(), ...s })),
          },
        },
      });
      await jobs.enqueue(id, "analyze");
      res.status(201).json(await dto(id));
    }),
  );
  router.get(
    "/projects/:id",
    wrap(async (req: any, res: any) => res.json(await dto(req.params.id))),
  );
  router.put(
    "/projects/:id/draft",
    wrap(async (req: any, res: any) => {
      const body = z
        .object({
          revision: z.number().int(),
          testId: z.string().nullable(),
          referenceDocumentId: z.string().nullable().default(null),
          segments: z.array(segmentSchema).length(54),
          viewState: z
            .object({
              slot: z.number().int().min(1).max(54),
              cursor: z.number().min(0),
              zoom: z.number().min(0).max(200),
            })
            .optional(),
        })
        .parse(req.body);
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      const v = validateSegments(body.segments, p.duration);
      if (v.invalid.length) throw Error(v.invalid.join(" "));
      if (body.testId) {
        const t = await db.test.findUniqueOrThrow({
          where: { id: body.testId },
        });
        if (t.section === "reading")
          throw Error("Đề Reading không có nhóm Listening để gán audio.");
      }
      const success = await db.$transaction(async (tx) => {
        const updated = await tx.audioProject.updateMany({
          where: { id: p.id, revision: body.revision },
          data: {
            testId: body.testId,
            referenceDocumentId: body.referenceDocumentId,
            revision: { increment: 1 },
            ...(body.viewState
              ? { viewState: JSON.stringify(body.viewState) }
              : {}),
          },
        });
        if (!updated.count) return false;
        for (const s of body.segments)
          await tx.audioSegment.update({
            where: { projectId_slot: { projectId: p.id, slot: s.slot } },
            data: s,
          });
        return true;
      });
      if (!success)
        return res
          .status(409)
          .json({
            error:
              "Bản nháp đã thay đổi ở job hoặc cửa sổ khác. Tải lại dữ liệu trước khi lưu.",
          });
      res.json(await dto(p.id));
    }),
  );
  router.put(
    "/projects/:id/view",
    wrap(async (req: any, res: any) => {
      const view = z
        .object({
          slot: z.number().int().min(1).max(54),
          cursor: z.number().min(0),
          zoom: z.number().min(0).max(200),
        })
        .parse(req.body);
      await db.audioProject.update({
        where: { id: req.params.id },
        data: { viewState: JSON.stringify(view) },
      });
      res.json({ ok: true });
    }),
  );
  router.post(
    "/projects/:id/detect",
    wrap(async (req: any, res: any) => {
      const body = z
        .object({
          noise: z.number().min(-80).max(-10).default(-35),
          minSilence: z.number().min(0.15).max(10).default(0.7),
        })
        .parse(req.body || {});
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      if (!p.duration || !p.peaksPath)
        throw Error("Chờ phân tích audio hoàn tất.");
      if (
        await db.audioJob.count({
          where: { projectId: p.id, status: { in: ["queued", "running"] } },
        })
      )
        throw Error(
          "Project đang có job xử lý. Chờ hoàn tất trước khi Auto Detect.",
        );
      res.status(202).json(await jobs.enqueue(p.id, "detect", body));
    }),
  );
  router.post(
    "/projects/:id/transcribe",
    wrap(async (req: any, res: any) => {
      const body = z
        .object({
          model: z.enum(["tiny.en", "base.en", "small.en"]).default("tiny.en"),
        })
        .parse(req.body || {});
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      if (!p.duration) throw Error("Audio chưa phân tích xong.");
      if (!(await whisperStatus()).available)
        throw Error(
          "Chưa có faster-whisper. Cài vào Python cục bộ hoặc nhập transcript JSON có timestamp.",
        );
      if (
        await db.audioJob.count({
          where: { projectId: p.id, status: { in: ["queued", "running"] } },
        })
      )
        throw Error("Project đang xử lý một job.");
      res.status(202).json(await jobs.enqueue(p.id, "transcribe", body));
    }),
  );
  router.put(
    "/projects/:id/transcript",
    wrap(async (req: any, res: any) => {
      const transcript = transcriptSchema.parse(req.body);
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      if (
        transcript.some(
          (t) =>
            t.end <= t.start ||
            t.end > p.duration + 0.01 ||
            t.words?.some(
              (w) =>
                w.end < w.start ||
                w.start < t.start - 0.01 ||
                w.end > t.end + 0.01,
            ),
        )
      )
        throw Error(
          "Timestamp transcript ngoài thời lượng audio hoặc không hợp lệ.",
        );
      if (transcript.some((t, i) => i > 0 && t.start < transcript[i - 1].start))
        throw Error("Transcript phải theo thứ tự thời gian.");
      await db.$transaction([
        db.audioProject.update({
          where: { id: p.id },
          data: {
            transcript: JSON.stringify(transcript),
            revision: { increment: 1 },
          },
        }),
        db.audioSegment.updateMany({
          where: { projectId: p.id },
          data: { confirmed: false },
        }),
      ]);
      res.json(await dto(p.id));
    }),
  );
  router.get(
    "/projects/:id/mapping.json",
    wrap(async (req: any, res: any) => {
      const p = await dto(req.params.id);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audio-mapping-${p.id}.json"`,
      );
      res.json({
        version: 1,
        title: p.title,
        duration: p.duration,
        source: {
          name: p.document.name,
          size: p.document.size,
          sha256: p.metadata.sha256,
        },
        segments: p.segments.map(
          ({
            slot,
            part,
            questionStart,
            questionEnd,
            start,
            end,
            confirmed,
            confidence,
            evidence,
            reason,
          }) => ({
            slot,
            part,
            questionStart,
            questionEnd,
            start,
            end,
            confirmed,
            confidence,
            evidence,
            reason,
          }),
        ),
      });
    }),
  );
  router.post(
    "/projects/:id/import-mapping",
    wrap(async (req: any, res: any) => {
      const data = z
        .object({
          version: z.literal(1),
          source: z.object({ sha256: z.string().optional() }).optional(),
          duration: z.number().optional(),
          segments: z.array(segmentSchema).length(54),
        })
        .parse(req.body);
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      const metadata = JSON.parse(p.metadata);
      if (data.source?.sha256 && metadata.sha256 !== data.source.sha256)
        throw Error("Mapping thuộc một file audio khác (SHA-256 không trùng).");
      if (data.duration && Math.abs(data.duration - p.duration) > 0.25)
        throw Error("Thời lượng mapping không trùng audio.");
      const segments = data.segments.map((s) => ({
        ...s,
        confirmed: false,
        reason: "Nhập từ JSON; cần nghe kiểm tra và xác nhận lại. " + s.reason,
      }));
      const v = validateSegments(segments, p.duration);
      if (v.invalid.length) throw Error(v.invalid.join(" "));
      await db.$transaction(async (tx) => {
        for (const s of segments)
          await tx.audioSegment.update({
            where: { projectId_slot: { projectId: p.id, slot: s.slot } },
            data: s,
          });
        await tx.audioProject.update({
          where: { id: p.id },
          data: { revision: { increment: 1 } },
        });
      });
      res.json(await dto(p.id));
    }),
  );
  router.post(
    "/projects/:id/export",
    wrap(async (req: any, res: any) => {
      const { slots } = z
        .object({
          slots: z.array(z.number().int().min(1).max(54)).min(1).max(54),
        })
        .parse(req.body);
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          segments: {
            where: { slot: { in: slots } },
            orderBy: { slot: "asc" },
          },
        },
      });
      if (
        p.segments.length !== new Set(slots).size ||
        p.segments.some(
          (s) =>
            s.start === null ||
            s.end === null ||
            s.end <= s.start ||
            s.end > p.duration,
        )
      )
        throw Error("Các đoạn xuất phải có start/end hợp lệ.");
      res
        .status(202)
        .json(
          await jobs.enqueue(p.id, "export", {
            segments: p.segments,
            revision: p.revision,
          }),
        );
    }),
  );
  router.post(
    "/jobs/:id/resume",
    wrap(async (req: any, res: any) => {
      const job = await db.audioJob.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      if (!["paused", "error"].includes(job.status))
        throw Error("Job không ở trạng thái có thể tiếp tục.");
      await db.audioJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          progress: 0,
          message: "Đã xếp hàng để tiếp tục.",
        },
      });
      jobs.kick();
      res.json({ ok: true });
    }),
  );
  router.post(
    "/projects/:id/publish",
    wrap(async (req: any, res: any) => {
      const p = await db.audioProject.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { segments: true },
      });
      if (
        await db.audioJob.count({
          where: { projectId: p.id, status: { in: ["queued", "running"] } },
        })
      )
        throw Error("Chờ job xử lý hoàn tất trước khi xuất bản.");
      const v = validateSegments(p.segments, p.duration);
      if (!v.canPublish)
        return res
          .status(400)
          .json({
            error:
              "Cần đủ 54 nhóm hợp lệ, không trùng/chồng lấn/sai thứ tự và xác nhận từng đoạn.",
            validation: v,
          });
      if (!p.testId)
        throw Error("Chọn bộ đề Listening trước khi xuất bản mapping.");
      const qs = await db.question.findMany({
        where: { testId: p.testId, number: { lte: 100 } },
      });
      if (
        qs.length !== 100 ||
        listeningGroups.some((g) => {
          const group = qs.filter(
            (q) => q.number >= g.questionStart && q.number <= g.questionEnd,
          );
          return (
            group.length !== g.questionEnd - g.questionStart + 1 ||
            group.some(
              (q) => q.part !== g.part || q.groupId !== group[0].groupId,
            )
          );
        })
      )
        throw Error(
          "Đề đích chưa có đủ câu hỏi và nhóm Listening đúng cấu trúc.",
        );
      if (
        await db.attempt.count({
          where: { testId: p.testId!, mode: "exam", status: "active" },
        })
      )
        throw Error(
          "Đề đích đang có bài thi nghiêm ngặt chưa hoàn thành. Hoàn thành bài trước khi thay mapping.",
        );
      const sorted = p.segments
        .slice()
        .sort((a, b) => a.questionStart - b.questionStart);
      await db.$transaction(async (tx) => {
        const current = await tx.audioProject.findUniqueOrThrow({
          where: { id: p.id },
        });
        if (current.revision !== p.revision)
          throw Error("Bản nháp thay đổi khi xuất bản, hãy thử lại.");
        await tx.audioMapping.deleteMany({ where: { testId: p.testId! } });
        await tx.audioMapping.createMany({
          data: sorted.map((s, i) => ({
            id: randomUUID(),
            testId: p.testId!,
            documentId: p.documentId,
            projectId: p.id,
            part: s.part,
            questionStart: s.questionStart,
            questionEnd: s.questionEnd,
            groupId: qs.find((q) => q.number === s.questionStart)!.groupId,
            start: s.start!,
            end: s.end!,
            sequence: i + 1,
            gap: 0,
            confirmed: true,
            continuous: true,
            playbackStart: i === 0 ? 0 : s.start!,
            playbackEnd: i === 53 ? p.duration : sorted[i + 1].start!,
            confidence: s.confidence,
          })),
        });
        await tx.audioProject.update({
          where: { id: p.id },
          data: { publishedRevision: p.revision },
        });
      });
      res.json({
        ok: true,
        count: 54,
        note: "Chế độ thi phát liên tục file gốc, giữ cả chỉ dẫn và khoảng nghỉ. Luyện tập phát đúng start/end đã chọn.",
      });
    }),
  );
  return router;
}
