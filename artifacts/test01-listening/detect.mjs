import fs from "node:fs";
const base = "http://127.0.0.1:3001/api/audio";
const id = "21b1d2ee-6fe3-4ceb-b018-b543843233ea";
const r = await fetch(`${base}/projects/${id}/detect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ noise: -35, questionGap: 0.8, boundaryGap: 4, autoBoundary: true, window: null }),
});
console.log("detect enqueued:", r.status);
for (let i = 0; i < 120; i++) {
  const p = await (await fetch(`${base}/projects/${id}`)).json();
  const j = p.jobs.filter((x) => x.kind === "detect").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (j.status === "completed" || j.status === "error") {
    console.log("job:", j.status, j.message);
    const res = j.result || {};
    console.log("windows:", res.windows?.length, "selected:", res.selectedWindow);
    console.log("gapStats:", JSON.stringify(res.gapStats), "threshold:", res.boundaryThreshold);
    const segs = p.segments;
    const filled = segs.filter((s) => s.start !== null && s.end !== null);
    console.log("segments filled:", filled.length, "/", segs.length);
    const ev = {};
    for (const s of segs) ev[s.evidence] = (ev[s.evidence] || 0) + 1;
    console.log("evidence:", JSON.stringify(ev));
    for (const s of segs)
      console.log(
        `slot ${String(s.slot).padStart(2)} p${s.part} q${s.questionStart}-${s.questionEnd} ${s.start ?? "-"} -> ${s.end ?? "-"} ${s.evidence}`,
      );
    fs.writeFileSync("artifacts/test01-listening/segments-after-fix.json", JSON.stringify(segs, null, 2));
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
