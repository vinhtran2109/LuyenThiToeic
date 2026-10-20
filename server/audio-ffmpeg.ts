import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import fs from "node:fs/promises";
import path from "node:path";
export const binaries = {
  ffmpeg: process.env.FFMPEG_PATH || ffmpeg || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || ffprobe.path,
};
const children = new Set<ReturnType<typeof spawn>>();
process.once("exit", () => {
  for (const child of children) child.kill();
});
export function command(
  bin: string,
  args: string[],
  onData?: (chunk: Buffer) => void,
  onProgress?: (seconds: number) => void,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    children.add(child);
    let stdout = "",
      stderr = "",
      progressBuffer = "";
    child.stdout.on("data", (b: Buffer) => {
      if (onData) onData(b);
      else {
        stdout += b.toString();
        if (stdout.length > 30e6) {
          child.kill();
          reject(Error("Đầu ra quá lớn."));
        }
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      const text = b.toString();
      stderr = (stderr + text).slice(-10e6);
      progressBuffer += text;
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/);
        if (m) onProgress?.(+m[1] / 1e6);
      }
    });
    child.on("error", (e) => {
      children.delete(child);
      reject(Error(`Không chạy được ${path.basename(bin)}: ${e.message}`));
    });
    child.on("close", (code) => {
      children.delete(child);
      code === 0
        ? resolve({ stdout, stderr })
        : reject(
            Error(`${path.basename(bin)} lỗi ${code}: ${stderr.slice(-1800)}`),
          );
    });
  });
}
export async function probeAudio(file: string) {
  const { stdout } = await command(binaries.ffprobe, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    file,
  ]);
  const data = JSON.parse(stdout);
  const audio = data.streams?.find((s: any) => s.codec_type === "audio");
  const duration = Number(data.format?.duration || audio?.duration);
  if (!audio || !Number.isFinite(duration) || duration <= 0)
    throw Error("Không tìm thấy luồng audio hoặc thời lượng hợp lệ.");
  return {
    duration,
    codec: audio.codec_name,
    format: data.format.format_name,
    sampleRate: Number(audio.sample_rate),
    channels: audio.channels,
    bitRate: Number(data.format.bit_rate || audio.bit_rate || 0),
    tags: data.format.tags || {},
    size: Number(data.format.size || 0),
  };
}
export async function createPeaks(
  file: string,
  duration: number,
  onProgress: (n: number) => void,
) {
  const rate = 8000,
    bins = Math.min(16000, Math.max(1000, Math.ceil(duration * 30))),
    peaks = new Array(bins).fill(0);
  let samples = 0,
    remainder = Buffer.alloc(0);
  await command(
    binaries.ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-f",
      "s16le",
      "-progress",
      "pipe:2",
      "pipe:1",
    ],
    (chunk) => {
      const b = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const length = b.length - (b.length % 2);
      for (let i = 0; i < length; i += 2) {
        const index = Math.min(
          bins - 1,
          Math.floor((samples++ / (rate * duration)) * bins),
        );
        peaks[index] = Math.max(
          peaks[index],
          Math.abs(b.readInt16LE(i)) / 32768,
        );
      }
      remainder = b.subarray(length);
    },
    onProgress,
  );
  return [peaks.map((p) => Math.round(p * 10000) / 10000)];
}
export async function detectSilence(
  file: string,
  duration: number,
  noise: number,
  minSilence: number,
  onProgress: (n: number) => void,
) {
  const { stderr } = await command(
    binaries.ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-vn",
      "-af",
      `silencedetect=noise=${noise}dB:d=${minSilence}`,
      "-progress",
      "pipe:2",
      "-f",
      "null",
      "-",
    ],
    undefined,
    onProgress,
  );
  const events = [...stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)];
  let start: number | undefined;
  const silences: { start: number; end: number }[] = [];
  for (const m of events) {
    if (m[1] === "start") start = +m[2];
    else if (start !== undefined) {
      silences.push({
        start: Math.max(0, start),
        end: Math.min(duration, +m[2]),
      });
      start = undefined;
    }
  }
  if (start !== undefined) silences.push({ start, end: duration });
  return silences;
}
export async function cutMp3(
  source: string,
  destination: string,
  start: number,
  end: number,
) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await command(binaries.ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-ss",
    String(start),
    "-i",
    source,
    "-t",
    String(end - start),
    "-map",
    "0:a:0",
    "-vn",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    destination,
  ]);
}
