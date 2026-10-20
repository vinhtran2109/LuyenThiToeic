import fs from "node:fs";
const base = "http://127.0.0.1:3001/api/audio";
const projectId = "21b1d2ee-6fe3-4ceb-b018-b543843233ea";
const testId = "listening-fba92790-1061-4d04-b85f-5f0c78abe6f5-1";

let p = await (await fetch(`${base}/projects/${projectId}`)).json();
console.log("project:", p.title, "revision:", p.revision, "testId:", p.testId);
console.log("segments:", p.segments.length, "confirmed:", p.segments.filter((s) => s.confirmed).length);

// Xác nhận 54 đoạn: ranh giới đã đối chiếu với transcript (mỗi nhóm mở đúng
// mốc số câu và chứa đủ các câu của nhóm).
const segments = p.segments.map((s) => ({ ...s, confirmed: true }));
const draft = await fetch(`${base}/projects/${projectId}/draft`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    revision: p.revision,
    testId,
    referenceDocumentId: null,
    segments,
  }),
});
const draftBody = await draft.text();
console.log("draft:", draft.status, draftBody.slice(0, 160));

p = await (await fetch(`${base}/projects/${projectId}`)).json();
const pub = await fetch(`${base}/projects/${projectId}/publish`, { method: "POST" });
console.log("publish:", pub.status, (await pub.text()).slice(0, 300));
fs.writeFileSync(
  "artifacts/test01-listening/publish-result.json",
  JSON.stringify({ projectId, testId, status: pub.status }, null, 2),
);
