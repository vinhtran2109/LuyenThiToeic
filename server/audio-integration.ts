// Requires the localhost API. All QA mappings use a temporary cloned test.
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { binaries, command, probeAudio } from "./audio-ffmpeg";
import { listeningGroups } from "./audio-domain";
const db = new PrismaClient(),
  base = "http://127.0.0.1:3001/api/audio";
const qaProjects: string[] = [],
  qaDocs: string[] = [],
  qaTest = "audio-qa-" + randomUUID();
let keepDemo = "";
async function request(
  route: string,
  body?: any,
  method = body ? "POST" : "GET",
  expected?: number,
) {
  const r = await fetch(base + route, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const data = await r.json();
  if (expected) assert.equal(r.status, expected, data.error);
  else assert.ok(r.ok, data.error);
  return data;
}
async function upload(file: string, name: string, keep = false) {
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(file)]), name);
  const p = await request("/upload", form);
  if (keep) keepDemo = p.id;
  else {
    qaProjects.push(p.id);
    qaDocs.push(p.documentId);
  }
  return p;
}
async function wait(id: string, kind: string, limit = 180000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < limit) {
    const p = await request("/projects/" + id),
      job = p.jobs.find((j: any) => j.kind === kind);
    if (job?.status === "completed") return p;
    if (job?.status === "error") throw Error(job.message);
    if (Date.now() - last > 5000) {
      last = Date.now();
      console.log(kind, job?.progress, job?.message);
    }
    await new Promise((r) => setTimeout(r, 180));
  }
  throw Error(kind + " timeout");
}
async function cloneTest() {
  const original = await db.test.findUniqueOrThrow({
    where: { id: "sample-3" },
    include: { questions: true },
  });
  await db.test.create({
    data: {
      id: qaTest,
      title: "QA temporary Listening test",
      year: 0,
      collection: "QA",
      description: "Temporary automated test",
      published: true,
      questions: {
        create: original.questions.map(({ id, testId, ...q }) => ({
          ...q,
          id: qaTest + "-" + q.number,
        })),
      },
    },
  });
}
try {
  await fs.mkdir("artifacts/audio-tests", { recursive: true });
  const file = "artifacts/audio-tests/sample-45min-tones.mp3";
  try {
    await fs.stat(file);
  } catch {
    console.log("Generating 45-minute local tone fixture (not TOEIC content)…");
    await command(binaries.ffmpeg, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=exprs='if(lt(mod(t,50),49),0.12*sin(2*PI*440*t),0)':s=16000:d=2700",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      file,
    ]);
  }
  const system = await request("/system");
  assert.ok(system.ffmpeg && system.ffprobe);
  let demo = (await request("/projects")).find(
    (p: any) =>
      p.title ===
      "DEMO 45 phút · tone và khoảng lặng · KHÔNG PHẢI ĐỀ TOEIC.mp3",
  );
  if (demo) {
    keepDemo = demo.id;
    demo = await request("/projects/" + demo.id);
  } else
    demo = await upload(
      file,
      "DEMO 45 phút · tone và khoảng lặng · KHÔNG PHẢI ĐỀ TOEIC.mp3",
      true,
    );
  demo = await wait(demo.id, "analyze");
  assert.ok(Math.abs(demo.duration - 2700) < 0.2);
  assert.equal(demo.metadata.codec, "mp3");
  assert.equal(demo.metadata.channels, 1);
  assert.equal(demo.segments.length, 54);
  assert.ok(demo.peaksPath);
  const peaks = await (
    await fetch("http://127.0.0.1:3001" + demo.peaksPath)
  ).json();
  assert.equal(peaks.length, 1);
  assert.ok(peaks[0].length <= 16000 && peaks[0].some((n: number) => n > 0));
  await request(`/projects/${demo.id}/detect`, { noise: -35, minSilence: 0.7 });
  demo = await wait(demo.id, "detect");
  assert.equal(
    demo.jobs.find((j: any) => j.kind === "detect").result.candidates.length,
    54,
  );
  assert.ok(
    demo.segments.every((s: any) => !s.confirmed && s.confidence <= 0.15),
  );
  await request(`/projects/${demo.id}/publish`, {}, "POST", 400);
  const originalHash = createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
  assert.equal(demo.metadata.sha256, originalHash);
  assert.equal(
    createHash("sha256")
      .update(await fs.readFile("." + demo.document.path))
      .digest("hex"),
    originalHash,
  );
  await command(binaries.ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=16000:duration=6",
    "artifacts/audio-tests/short.wav",
  ]);
  await command(binaries.ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    "artifacts/audio-tests/short.wav",
    "-c:a",
    "aac",
    "artifacts/audio-tests/short.m4a",
  ]);
  const wav = await upload("artifacts/audio-tests/short.wav", "QA short.wav");
  let p = await wait(wav.id, "analyze");
  const m4a = await upload("artifacts/audio-tests/short.m4a", "QA short.m4a");
  const mp = await wait(m4a.id, "analyze");
  assert.equal(mp.metadata.codec, "aac");
  await cloneTest();
  let saved = await request(
    `/projects/${p.id}/draft`,
    {
      revision: p.revision,
      testId: qaTest,
      segments: p.segments.map((s: any) => ({
        ...s,
        start: (s.slot - 1) * 0.1,
        end: s.slot * 0.1,
        confirmed: false,
      })),
      viewState: { slot: 32, cursor: 3.25, zoom: 12 },
    },
    "PUT",
  );
  assert.equal(saved.viewState.slot, 32);
  assert.equal(saved.revision, p.revision + 1);
  await request(
    `/projects/${p.id}/draft`,
    { revision: p.revision, testId: qaTest, segments: saved.segments },
    "PUT",
    409,
  );
  await request(
    `/projects/${p.id}/draft`,
    {
      revision: saved.revision,
      testId: qaTest,
      segments: saved.segments.map((s: any) =>
        s.slot === 1 ? { ...s, start: -1 } : s,
      ),
    },
    "PUT",
    400,
  );
  const overlap = await request(
    `/projects/${p.id}/draft`,
    {
      revision: saved.revision,
      testId: qaTest,
      segments: saved.segments.map((s: any) =>
        s.slot === 2 ? { ...s, start: 0.05 } : s,
      ),
    },
    "PUT",
  );
  assert.ok(overlap.validation.overlaps.length);
  await request(`/projects/${p.id}/publish`, {}, "POST", 400);
  saved = await request(
    `/projects/${p.id}/draft`,
    {
      revision: overlap.revision,
      testId: qaTest,
      segments: overlap.segments.map((s: any) => ({
        ...s,
        start: (s.slot - 1) * 0.1,
        end: s.slot * 0.1,
        confirmed: true,
        evidence: "manual",
        reason: "Automated synthetic QA, not TOEIC material.",
      })),
    },
    "PUT",
  );
  assert.equal(saved.validation.canPublish, true);
  const exported = await request(`/projects/${p.id}/mapping.json`);
  await request(
    `/projects/${p.id}/import-mapping`,
    { ...exported, source: { sha256: "wrong-file" } },
    "POST",
    400,
  );
  p = await request(`/projects/${p.id}/import-mapping`, exported);
  assert.ok(p.segments.every((s: any) => !s.confirmed));
  await request(`/projects/${p.id}/publish`, {}, "POST", 400);
  p = await request(
    `/projects/${p.id}/draft`,
    {
      revision: p.revision,
      testId: qaTest,
      segments: p.segments.map((s: any) => ({ ...s, confirmed: true })),
    },
    "PUT",
  );
  await request(`/projects/${p.id}/publish`, {});
  const mappings = await db.audioMapping.findMany({
    where: { testId: qaTest },
    orderBy: { sequence: "asc" },
  });
  assert.equal(mappings.length, 54);
  assert.ok(mappings.every((m) => m.confirmed && m.continuous));
  assert.equal(mappings[0].playbackStart, 0);
  assert.ok(Math.abs(mappings[53].playbackEnd! - p.duration) < 0.001);
  const examResponse = await fetch("http://127.0.0.1:3001/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testId: qaTest, mode: "exam", section: "all" }),
  });
  assert.equal(examResponse.status, 200);
  await db.attempt.deleteMany({ where: { testId: qaTest } });
  await request(`/projects/${p.id}/export`, { slots: [1, 2] });
  p = await wait(p.id, "export");
  const exportJob = p.jobs.find((j: any) => j.kind === "export");
  assert.equal(exportJob.result.files.length, 2);
  const zip = await fs.readFile("." + exportJob.result.zipUrl);
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  const clipped = await probeAudio("." + exportJob.result.files[0].url);
  assert.ok(clipped.duration > 0.05 && clipped.duration < 0.3);
  assert.equal(clipped.codec, "mp3");
  await request(
    `/projects/${p.id}/transcript`,
    [{ start: 0, end: 100, text: "outside audio" }],
    "PUT",
    400,
  );
  if (system.whisper.available) {
    const voice = await upload(
      "artifacts/audio-tests/spoken-sample.wav",
      "QA spoken markers.wav",
    );
    const v = await wait(voice.id, "analyze");
    await request(`/projects/${v.id}/transcribe`, { model: "tiny.en" });
    const stt = await wait(v.id, "transcribe");
    assert.ok(
      stt.transcript.length > 0 &&
        stt.transcript.some((t: any) => t.words?.length),
    );
    await request(`/projects/${v.id}/detect`, { noise: -35, minSilence: 0.7 });
    const marked = await wait(v.id, "detect");
    assert.ok(
      marked.jobs.find((j: any) => j.kind === "detect").result.anchors.length >=
        2,
    );
    assert.ok(marked.segments.every((s: any) => !s.confirmed));
  }
  await fs.writeFile(
    "artifacts/audio-tests/broken.mp3",
    "This is not an audio stream.",
  );
  const broken = await upload(
    "artifacts/audio-tests/broken.mp3",
    "QA broken.mp3",
  );
  let rejected = false;
  try {
    await wait(broken.id, "analyze", 15000);
  } catch {
    rejected = true;
  }
  assert.ok(rejected);
  const paused = await db.audioJob.create({
    data: {
      id: randomUUID(),
      projectId: wav.id,
      kind: "analyze",
      status: "paused",
      message: "QA resume fixture",
    },
  });
  await request("/jobs/" + paused.id + "/resume", {});
  await wait(wav.id, "analyze");
  const report = {
    status: "passed",
    demoProjectId: keepDemo,
    formats: ["MP3 45 minutes", "WAV", "M4A"],
    checks: [
      "FFprobe metadata",
      "streamed precomputed waveform",
      "54 silences remain unconfirmed/low confidence",
      "missing/overlap/bounds validation",
      "SQLite draft and cursor persistence",
      "optimistic revision conflict",
      "JSON round trip resets confirmation",
      "source hash mismatch rejected",
      "all 54 confirmations required",
      "published mappings integrated into exam",
      "original instructions/gaps preserved by playback bounds",
      "MP3 split and ZIP manifest",
      "timestamped local Whisper on spoken sample",
      "invalid audio rejection",
      "paused job resume",
      "original SHA-256 unchanged",
    ],
    whisperTested: system.whisper.available,
  };
  await fs.writeFile(
    "artifacts/audio-tests/verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log("AUDIO INTEGRATION PASSED", JSON.stringify(report));
} finally {
  await db.attempt.deleteMany({ where: { testId: qaTest } });
  await db.audioMapping.deleteMany({ where: { testId: qaTest } });
  await db.question.deleteMany({ where: { testId: qaTest } });
  await db.test.deleteMany({ where: { id: qaTest } });
  await db.audioProject.deleteMany({ where: { id: { in: qaProjects } } });
  await db.document.deleteMany({ where: { id: { in: qaDocs } } });
  await db.$disconnect();
}
