import fs from "node:fs";
const base = "http://127.0.0.1:3001/api/audio";
const id = "21b1d2ee-6fe3-4ceb-b018-b543843233ea";
const project = await (await fetch(`${base}/projects/${id}`)).json();
const slots = project.segments
  .filter((s) => s.start !== null && s.end !== null && s.end > s.start)
  .map((s) => s.slot);
console.log("exporting slots:", slots.length);
const r = await fetch(`${base}/projects/${id}/export`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slots }),
});
console.log("export enqueued:", r.status, r.status === 202 ? "" : await r.text());
for (let i = 0; i < 600; i++) {
  const p = await (await fetch(`${base}/projects/${id}`)).json();
  const j = p.jobs.filter((x) => x.kind === "export").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (j.status === "completed" || j.status === "error") {
    console.log("job:", j.status, j.message);
    if (j.status === "completed") {
      const res = j.result;
      console.log("files:", res.files.length, "zip:", res.zipUrl);
      const expected = project.segments.filter((s) => slots.includes(s.slot));
      let bad = 0;
      for (const f of res.files) {
        const seg = expected.find((s) => s.questionStart === Number(f.name.match(/q(\d+)-/)[1]));
        const want = seg.end - seg.start;
        const got = f.end - f.start;
        if (Math.abs(want - got) > 0.01) bad++;
      }
      console.log("sai độ dài:", bad);
      console.log("mẫu:", res.files.slice(0, 3).map((f) => `${f.name} ${f.start.toFixed(2)}-${f.end.toFixed(2)}`).join(" | "));
      console.log("      ", res.files.slice(-2).map((f) => `${f.name} ${f.start.toFixed(2)}-${f.end.toFixed(2)}`).join(" | "));
      const zip = await (await fetch("http://127.0.0.1:3001" + res.zipUrl)).arrayBuffer();
      fs.writeFileSync("artifacts/test01-listening/segments.zip", Buffer.from(zip));
      console.log("zip bytes:", zip.byteLength);
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 1500));
}
