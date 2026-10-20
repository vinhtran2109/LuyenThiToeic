const base = "http://127.0.0.1:3001/api";
const docs = await (await fetch(`${base}/documents`)).json();
const doc = docs.find(
  (d) => d.name.toLowerCase().includes("listening") && d.path.endsWith(".pdf"),
);
const r = await fetch(`${base}/documents/${doc.id}/listening-import`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    testCount: 10,
    pagesPerTest: 13,
    coverPages: 1,
    titlePrefix: "1000 Listening",
  }),
});
const payload = JSON.parse(await r.text());
console.log("job:", payload.id, payload.status);
for (let i = 0; i < 600; i++) {
  const jobs = await (await fetch(`${base}/imports`)).json();
  const j = jobs.find((x) => x.id === payload.id);
  if (j.status === "review" || j.status === "error" || j.status === "published") {
    console.log("import:", j.status, j.message);
    if (j.result?.tests)
      for (const t of j.result.tests)
        console.log(
          `  Test ${String(t.index).padStart(2, "0")} câu=${t.questionCount} cầnXemLại=${t.needsReview} thiếu=${t.missing.length} audio=${t.fromAudio}`,
        );
    if (j.status === "review") {
      const pub = await fetch(`${base}/imports/${j.id}/publish`, { method: "POST" });
      console.log("publish:", pub.status, (await pub.text()).slice(0, 220));
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
