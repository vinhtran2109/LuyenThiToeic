import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
const pythonChildren = new Set<ChildProcess>();
const trackPython = <T extends ChildProcess>(child: T): T => {
  pythonChildren.add(child);
  child.once("close", () => pythonChildren.delete(child));
  return child;
};
process.once("exit", () => {
  for (const child of pythonChildren) child.kill();
});
import { ZipArchive } from "archiver";
import { probeAudio, createPeaks, detectSilence, cutMp3 } from "./audio-ffmpeg";
import { proposeSegments, type DraftSegment } from "./audio-domain";
import { pdfReference } from "./audio-reference";
export const whisperPython = () =>
  process.env.WHISPER_PYTHON ||
  (existsSync(".audio-venv/Scripts/python.exe")
    ? path.resolve(".audio-venv/Scripts/python.exe")
    : existsSync(".audio-venv/bin/python")
      ? path.resolve(".audio-venv/bin/python")
      : "python");
export async function whisperStatus() {
  return new Promise<any>((resolve) => {
    const child = trackPython(
      spawn(whisperPython(), ["server/whisper.py", "--check"], {
        windowsHide: true,
      }),
    );
    let text = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        available: false,
        error: "Không kiểm tra được Python Whisper trong 20 giây.",
      });
    }, 20000);
    child.stdout.on("data", (b) => (text += b));
    child.on("error", () => {
      clearTimeout(timeout);
      resolve({
        available: false,
        error: "Không tìm thấy Python. Cấu hình WHISPER_PYTHON.",
      });
    });
    child.on("close", () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(text.trim()));
      } catch {
        resolve({
          available: false,
          error: "Python chưa sẵn sàng cho faster-whisper.",
        });
      }
    });
  });
}
const asJson = (s: string) => JSON.parse(s);
export function initAudioJobs(db: PrismaClient) {
  let active = false,
    stopping = false;
  async function recover() {
    await db.audioJob.updateMany({
      where: { status: "running" },
      data: {
        status: "paused",
        message:
          "Máy chủ đã khởi động lại. Nhấn Tiếp tục để chạy lại job từ file gốc.",
      },
    });
    kick();
  }
  async function progress(id: string, value: number, message: string) {
    await db.audioJob.updateMany({
      where: { id, status: "running" },
      data: {
        progress: Math.max(0, Math.min(100, Math.round(value))),
        message,
      },
    });
  }
  async function transcribe(
    project: any,
    source: string,
    model: string,
    jobId: string,
  ) {
    const status = await whisperStatus();
    if (!status.available)
      throw Error(
        status.error +
          " Cài python -m pip install faster-whisper hoặc nhập transcript JSON.",
      );
    const output = path.resolve(
      `uploads/audio-work/${project.id}/transcript-${jobId}.json`,
    );
    await fs.mkdir(path.dirname(output), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const child = trackPython(
        spawn(
          whisperPython(),
          [
            "server/whisper.py",
            "--input",
            source,
            "--output",
            output,
            "--model",
            model,
            "--duration",
            String(project.duration),
          ],
          { windowsHide: true },
        ),
      );
      let line = "",
        stderr = "";
      let last = 0;
      child.stdout.on("data", (b) => {
        line += b.toString();
        const lines = line.split("\n");
        line = lines.pop() || "";
        for (const l of lines)
          try {
            const d = JSON.parse(l);
            if (Date.now() - last > 800) {
              last = Date.now();
              void progress(
                jobId,
                d.progress || 1,
                d.message || d.error || "Whisper đang xử lý…",
              );
            }
          } catch {}
      });
      child.stderr.on(
        "data",
        (b) => (stderr = (stderr + b.toString()).slice(-1500)),
      );
      child.on("error", reject);
      child.on("close", (c) =>
        c === 0
          ? resolve()
          : reject(Error("Whisper không hoàn tất: " + stderr + " " + line)),
      );
    });
    const transcript = JSON.parse(await fs.readFile(output, "utf8"));
    if (!transcript.length)
      throw Error(
        "Whisper không nhận dạng được lời nói. Có thể tiếp tục bằng silence detection hoặc nhập transcript.",
      );
    await db.$transaction([
      db.audioProject.update({
        where: { id: project.id },
        data: {
          transcript: JSON.stringify(transcript),
          revision: { increment: 1 },
        },
      }),
      db.audioSegment.updateMany({
        where: { projectId: project.id },
        data: { confirmed: false },
      }),
    ]);
    return { transcriptCount: transcript.length };
  }
  async function run(job: any) {
    const input = asJson(job.input),
      project = await db.audioProject.findUniqueOrThrow({
        where: { id: job.projectId },
        include: { segments: { orderBy: { slot: "asc" } } },
      }),
      doc = await db.document.findUniqueOrThrow({
        where: { id: project.documentId },
      }),
      source = path.resolve("." + doc.path),
      folder = `uploads/audio-work/${project.id}`;
    await fs.mkdir(folder, { recursive: true });
    let last = 0;
    const report =
      (scale: number, offset: number, message: string) => (sec: number) => {
        if (Date.now() - last > 800) {
          last = Date.now();
          void progress(
            job.id,
            offset + (sec / Math.max(project.duration, 1)) * scale,
            message,
          ).catch(() => {});
        }
      };
    if (job.kind === "analyze") {
      await progress(job.id, 2, "FFprobe đang kiểm tra audio…");
      const metadata = await probeAudio(source);
      await db.audioProject.update({
        where: { id: project.id },
        data: {
          duration: metadata.duration,
          metadata: JSON.stringify(metadata),
        },
      });
      project.duration = metadata.duration;
      const peaks = await createPeaks(
        source,
        metadata.duration,
        report(90, 5, "Đang tạo waveform từ audio gốc…"),
      );
      const peaksPath = `/${folder}/peaks.json`;
      await fs.writeFile("." + peaksPath, JSON.stringify(peaks));
      const hash = createHash("sha256");
      const { createReadStream } = await import("node:fs");
      for await (const chunk of createReadStream(source)) hash.update(chunk);
      const sha256 = hash.digest("hex");
      await db.audioProject.update({
        where: { id: project.id },
        data: { peaksPath, metadata: JSON.stringify({ ...metadata, sha256 }) },
      });
      return { ...metadata, sha256, peaksPath };
    }
    if (!project.duration || !project.peaksPath)
      throw Error("Audio chưa phân tích xong. Chạy lại job phân tích trước.");
    if (job.kind === "transcribe")
      return transcribe(project, source, input.model || "tiny.en", job.id);
    if (job.kind === "detect") {
      await progress(job.id, 2, "FFmpeg đang tìm khoảng lặng…");
      const revision = project.revision;
      const silences = await detectSilence(
        source,
        project.duration,
        input.noise ?? -35,
        input.minSilence ?? 0.7,
        report(85, 3, "Đang tìm khoảng lặng và mốc phân đoạn…"),
      );
      const texts = new Map<number, string>();
      if (project.testId) {
        const qs = await db.question.findMany({
          where: { testId: project.testId, number: { lte: 100 } },
        });
        for (const q of qs)
          texts.set(
            q.number,
            [q.prompt, q.passage, JSON.parse(q.options).join(" ")].join(" "),
          );
      }
      let pdfEvidence: any = null;
      if (project.referenceDocumentId) {
        const reference = await pdfReference(db, project.referenceDocumentId);
        pdfEvidence = reference.evidence;
        for (const [n, text] of reference.snippets) texts.set(n, text);
      }
      const result = proposeSegments(
        silences,
        project.duration,
        JSON.parse(project.transcript),
        texts,
      );
      await db.$transaction(async (tx) => {
        const current = await tx.audioProject.findUniqueOrThrow({
          where: { id: project.id },
        });
        if (current.revision !== revision)
          throw Error(
            "Bản nháp hoặc transcript đã thay đổi trong khi xử lý. Chạy Auto Detect lại để không ghi đè chỉnh sửa.",
          );
        await tx.audioProject.update({
          where: { id: project.id },
          data: {
            silences: JSON.stringify(silences),
            revision: { increment: 1 },
          },
        });
        for (const s of result.segments)
          await tx.audioSegment.update({
            where: { projectId_slot: { projectId: project.id, slot: s.slot } },
            data: s,
          });
      });
      return { ...result, silences, pdfEvidence };
    }
    if (job.kind === "export") {
      const segments: DraftSegment[] = input.segments;
      const exportFolder = `${folder}/exports/${job.id}`;
      await fs.mkdir(exportFolder, { recursive: true });
      const files: {
        name: string;
        url: string;
        start: number;
        end: number;
        confirmed: boolean;
      }[] = [];
      for (const [i, s] of segments.entries()) {
        if (s.start === null || s.end === null || s.end <= s.start)
          throw Error("Khoảng xuất MP3 không hợp lệ.");
        const name = `part-${s.part}-q${String(s.questionStart).padStart(3, "0")}-${String(s.questionEnd).padStart(3, "0")}.mp3`;
        await cutMp3(source, path.resolve(exportFolder, name), s.start, s.end);
        files.push({
          name,
          url: `/${exportFolder}/${name}`,
          start: s.start,
          end: s.end,
          confirmed: s.confirmed,
        });
        await progress(
          job.id,
          5 + ((i + 1) / segments.length) * 85,
          `Đã xuất ${i + 1}/${segments.length} đoạn MP3`,
        );
      }
      const manifest = {
        version: 1,
        projectId: project.id,
        revision: input.revision,
        original: doc.name,
        originalSha256: asJson(project.metadata).sha256,
        files,
      };
      await fs.writeFile(
        `${exportFolder}/manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      const zipPath = `${exportFolder}/segments.zip`;
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(zipPath),
          zip = new ZipArchive({ zlib: { level: 1 } });
        out.on("close", () => resolve());
        out.on("error", reject);
        zip.on("error", reject);
        zip.pipe(out);
        for (const f of files) zip.file("." + f.url, { name: f.name });
        zip.file(`${exportFolder}/manifest.json`, { name: "manifest.json" });
        void zip.finalize();
      });
      return { ...manifest, zipUrl: `/${zipPath}` };
    }
    throw Error("Loại job không được hỗ trợ.");
  }
  function kick() {
    if (active || stopping) return;
    active = true;
    void (async () => {
      try {
        let job;
        while (
          !stopping &&
          (job = await db.audioJob.findFirst({
            where: { status: "queued" },
            orderBy: { createdAt: "asc" },
          }))
        ) {
          await db.audioJob.update({
            where: { id: job.id },
            data: {
              status: "running",
              progress: 0,
              message: "Bắt đầu xử lý nền…",
            },
          });
          try {
            const result = await run(job);
            await db.audioJob.update({
              where: { id: job.id },
              data: {
                status: "completed",
                progress: 100,
                result: JSON.stringify(result),
                message: "Hoàn tất.",
              },
            });
          } catch (e: any) {
            await db.audioJob.update({
              where: { id: job.id },
              data: { status: "error", message: e.message },
            });
          }
        }
      } finally {
        active = false;
      }
    })();
  }
  async function enqueue(projectId: string, kind: string, input: any = {}) {
    const job = await db.audioJob.create({
      data: { id: randomUUID(), projectId, kind, input: JSON.stringify(input) },
    });
    kick();
    return job;
  }
  void recover();
  return { enqueue, kick };
}
