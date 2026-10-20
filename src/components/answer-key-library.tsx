import { useEffect, useState } from "react";
import { api } from "../lib";
type Set = {
  id: string;
  section: string;
  testNumber: number;
  sourcePage: number;
  count: number;
  status: string;
  test?: { id: string; title: string };
  document: { name: string; path: string };
  jsonUrl: string;
};
export function AnswerKeyLibrary() {
  const [sets, setSets] = useState<Set[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<Set[]>("/answer-keys")
      .then(setSets)
      .catch((e) => setError(e.message));
  }, []);
  if (error)
    return (
      <p role="alert" className="notice error">
        {error}
      </p>
    );
  if (!sets.length) return null;
  return (
    <section className="card answer-key-library">
      <div className="eyebrow">VERIFIED SOURCE KEYS</div>
      <h2>Đáp án ETS 2024 đã nhập</h2>
      <p>
        RC đã gắn với đề Reading tương ứng. LC được lưu riêng theo Test, chờ nội
        dung Listening và audio; chưa gán vào đề mẫu.
      </p>
      {["reading", "listening"].map((section) => (
        <details key={section} open={section === "reading"}>
          <summary>
            {section === "reading"
              ? "Reading · Đã gắn đáp án"
              : "Listening · Đã lưu, chờ audio và đề"}{" "}
            ·{" "}
            {sets
              .filter((s) => s.section === section)
              .reduce((n, s) => n + s.count, 0)}{" "}
            đáp án
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Số câu</th>
                  <th>Trạng thái</th>
                  <th>Nguồn / dữ liệu</th>
                </tr>
              </thead>
              <tbody>
                {sets
                  .filter((s) => s.section === section)
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.testNumber).padStart(2, "0")}</td>
                      <td>{s.count}/100</td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (s.status === "applied" ? "green" : "orange")
                          }
                        >
                          {s.status === "applied"
                            ? "Đã gắn · Có thể chấm"
                            : "Đã lưu · Chờ Listening"}
                        </span>
                        {s.test && <small>{s.test.title}</small>}
                      </td>
                      <td>
                        <a
                          className="table-link"
                          href={`${s.document.path}#page=${s.sourcePage}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF nguồn · trang {s.sourcePage}
                        </a>
                        <a className="table-link" href={s.jsonUrl} download>
                          Tải JSON Test {s.testNumber}
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
