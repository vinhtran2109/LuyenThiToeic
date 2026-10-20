const base = "http://127.0.0.1:3001/api";
const tests = await (await fetch(`${base}/tests`)).json();
const listening = tests.filter((t) => t.title.includes("Listening Test"));
console.log("đề Listening trong thư viện:", listening.length);
for (const t of listening) {
  console.log(
    `  ${t.title} | câu ${t._count.questions} | đáp án đã xác nhận ${t.keyCounts?.listening ?? 0}`,
  );
}
const testId = listening[0].id;
const detail = await (await fetch(`${base}/tests/${testId}`)).json();
console.log("\nTest 01:", detail.title, "| section:", detail.section, "| published:", detail.published);
const mapping = await (await fetch(`${base}/mappings/${testId}`)).json();
const rows = Array.isArray(mapping) ? mapping : mapping.mappings ?? [];
console.log("audio mapping:", rows.length, "đoạn");
if (rows.length) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  console.log(`  ${first.questionStart}-${first.questionEnd}: ${first.start.toFixed(2)} -> ${first.end.toFixed(2)}`);
  console.log(`  ${last.questionStart}-${last.questionEnd}: ${last.start.toFixed(2)} -> ${last.end.toFixed(2)}`);
}
const attempt = await (
  await fetch(`${base}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testId, mode: "practice", section: "listening" }),
  })
).json();
const full = await (await fetch(`${base}/attempts/${attempt.id}`)).json();
console.log(
  "\nbài luyện tập:",
  attempt.id,
  "| phase:",
  attempt.phase,
  "| câu:",
  full.test.questions.length,
);
const answers = {};
full.test.questions.forEach((q) => {
  answers[q.number] = q.answer;
});
const result = await (
  await fetch(`${base}/attempts/${attempt.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, flags: [], current: 100 }),
  })
).json();
console.log(
  `chấm bài: đúng ${result.correct}/${result.gradable} | điểm ${result.score} | trạng thái ${result.status}`,
);
await fetch(`${base}/attempts/${attempt.id}`, { method: "DELETE" }).catch(() => {});
