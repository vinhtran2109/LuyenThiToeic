export const ranges = [
  [1, 6],
  [7, 31],
  [32, 70],
  [71, 100],
  [101, 130],
  [131, 146],
  [147, 200],
];
export function partOf(n: number) {
  return ranges.findIndex(([a, b]) => n >= a && n <= b) + 1;
}
export function inSection(n: number, section: string) {
  return section === "all" || (section === "listening" ? n <= 100 : n > 100);
}
export function grade(
  questions: { number: number; answer: string | null; confirmed: boolean }[],
  answers: Record<string, string>,
) {
  const valid = questions.filter((q) => q.confirmed && q.answer);
  return {
    gradable: valid.length,
    correct: valid.filter((q) => answers[q.number] === q.answer).length,
  };
}
export function mappingConflict(
  a: {
    questionStart: number;
    questionEnd: number;
    documentId: string;
    start: number;
    end: number;
  },
  b: typeof a,
) {
  return (
    (a.questionStart <= b.questionEnd && a.questionEnd >= b.questionStart) ||
    (a.documentId === b.documentId && a.start < b.end && a.end > b.start)
  );
}
