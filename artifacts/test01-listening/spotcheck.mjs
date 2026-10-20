import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const base = "http://127.0.0.1:3001";
const id = "21b1d2ee-6fe3-4ceb-b018-b543843233ea";
const p = await (await fetch(`${base}/api/audio/projects/${id}`)).json();
const job = p.jobs
  .filter((j) => j.kind === "export" && j.status === "completed")
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
const dir = path.dirname(job.result.files[0].url);
const targets = ["part-1-q001-001.mp3", "part-3-q032-034.mp3", "part-4-q098-100.mp3", "part-2-q020-020.mp3"];
const outDir = "artifacts/test01-listening/spotcheck";
fs.mkdirSync(outDir, { recursive: true });
const python = ".audio-venv/Scripts/python.exe";
for (const name of targets) {
  const src = path.resolve("." + dir + "/" + name);
  const out = path.resolve(outDir, name.replace(".mp3", ".json"));
  await new Promise((resolve) => {
    const child = spawn(python, ["server/whisper.py", "--input", src, "--output", out, "--model", "tiny.en", "--duration", "12"], {
      windowsHide: true,
    });
    child.stderr.on("data", () => {});
    child.on("close", resolve);
  });
  const t = JSON.parse(fs.readFileSync(out, "utf8"));
  console.log(`\n${name} (${fs.statSync(src).size} bytes)`);
  for (const s of t.slice(0, 4)) console.log(`   ${s.start.toFixed(1)}s  ${s.text}`);
}
