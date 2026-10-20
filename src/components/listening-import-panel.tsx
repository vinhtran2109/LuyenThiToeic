import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, FileScan, Headphones, RefreshCw } from "lucide-react";
import type { Doc } from "../types";
import { api, useUI } from "../lib";
import { Button } from "./ui/button";

type Job = {
  id: string;
  documentId: string;
  status: string;
  done: number;
  total: number;
  message: string;
  result: {
    config?: {
      testCount: number;
      pagesPerTest: number;
      coverPages: number;
      titlePrefix: string;
    };
    section?: string;
    needsReview?: number;
    audioNotes?: string[];
    tests?: {
      testId: string;
      index: number;
      startPage: number;
      endPage: number;
      questionCount: number;
      missing: number[];
      needsReview: number;
      fromAudio: boolean;
    }[];
  };
};

export function ListeningImportPanel({
  docs,
  onUpdated,
}: {
  docs: Doc[];
  onUpdated: () => void;
}) {
  const pdfs = docs.filter((d) => d.path.endsWith(".pdf"));
  const [docId, setDocId] = useState(pdfs[0]?.id || "");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [count, setCount] = useState(10);
  const [perTest, setPerTest] = useState(13);
  const [covers, setCovers] = useState(1);
  const [title, setTitle] = useState("1000 Listening");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const notify = useUI((s) => s.notify);
  const doc = pdfs.find((d) => d.id === docId);
  const job = jobs.find(
    (j) => j.documentId === docId && (j.result.section ?? "reading") === "listening",
  );

  async function refresh() {
    try {
      setJobs(await api<Job[]>("/imports"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (!docId && pdfs[0]) setDocId(pdfs[0].id);
  }, [docs]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const c = job?.result.config;
    if (c) {
      setCount(c.testCount);
      setPerTest(c.pagesPerTest);
      setCovers(c.coverPages);
      setTitle(c.titlePrefix);
    }
    setChecked(false);
  }, [job?.id]);

  async function start() {
    if (!doc) return;
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${doc.id}/listening-import`, {
        method: "POST",
        body: JSON.stringify({
          testCount: count,
          pagesPerTest: perTest,
          coverPages: covers,
          titlePrefix: title,
        }),
      });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="notice">
        <Headphones size={21} />
        <span>
          PDF Listening ETS dùng cấu trúc 6/25/39/30 câu ở Part 1/2/3/4. Part 1
          là ảnh, Part 2 chỉ in số câu — cả hai nằm trong audio, nên ứng dụng
          lấy thêm từ transcript khi có file audio tương ứng.
        </span>
      </div>
      <div className="card import-config">
        <h2>Chuyển PDF thành đề Listening</h2>
        <label>
          Tài liệu nguồn
          <select
            value={docId}
            onChange={(e) => {
              setDocId(e.target.value);
              setError("");
            }}
          >
            <option value="">Chọn PDF đã tải</option>
            {pdfs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {!job || job.status === "error" ? (
          <>
            <div className="mapping-fields">
              <label>
                Tên bộ đề
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Số đề
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={count}
                  onChange={(e) => setCount(+e.target.value)}
                />
              </label>
              <label>
                Số trang mỗi đề
                <input
                  type="number"
                  min="1"
                  value={perTest}
                  onChange={(e) => setPerTest(+e.target.value)}
                />
              </label>
              <label>
                Trang bìa đầu mỗi đề
                <input
                  type="number"
                  min="0"
                  value={covers}
                  onChange={(e) => setCovers(+e.target.value)}
                />
              </label>
            </div>
            <p>
              Mỗi đề Listening cần câu 1–100: 6 câu Part 1, 25 câu Part 2, 39
              câu Part 3, 30 câu Part 4. OCR chạy cục bộ, không gửi tài liệu lên
              mạng.
            </p>
            <Button disabled={!doc || busy} onClick={start}>
              <FileScan size={16} />
              {job ? "Tiếp tục OCR từ bộ nhớ đệm" : "Nhận dạng & tạo bản nháp"}
            </Button>
          </>
        ) : null}
        {job && (
          <div className="import-progress">
            <div className="section-title">
              <h3>
                {job.status === "published"
                  ? "Đã sẵn sàng để luyện tập"
                  : job.status === "review"
                    ? "OCR xong · Kiểm tra trước khi mở đề"
                    : "Đang chuyển đổi tài liệu"}
              </h3>
              <span className="badge">
                {job.done}/{job.total || "…"} trang
              </span>
            </div>
            <progress max={job.total || 1} value={job.done} />
            <p role="status">{job.message}</p>
            {["queued", "ocr"].includes(job.status) && (
              <Button variant="outline" disabled={busy} onClick={start}>
                <RefreshCw size={14} /> Tiếp tục nếu xử lý bị gián đoạn
              </Button>
            )}
          </div>
        )}
        {error && <p className="notice error">{error}</p>}
      </div>
      {job?.result.tests && (
        <div className="card import-review">
          <div className="section-title">
            <h2>
              {job.result.tests.length} đề ·{" "}
              {job.result.tests.reduce((n, t) => n + t.questionCount, 0)} câu
              Listening
            </h2>
          </div>
          <p>
            Câu 32–100 có sẵn trong PDF. Câu 1–31 nằm trong audio: ứng dụng lấy
            từ transcript khi đã tải file audio tương ứng, nếu không thì câu đó
            để trống cho tới khi bạn thêm audio.
          </p>
          {job.result.audioNotes?.length ? (
            <ul className="plain-list">
              {job.result.audioNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ĐỀ</th>
                  <th>TRANG PDF</th>
                  <th>CÂU HỎI</th>
                  <th>KIỂM TRA</th>
                </tr>
              </thead>
              <tbody>
                {job.result.tests.map((t) => (
                  <tr key={t.testId}>
                    <td>Test {String(t.index).padStart(2, "0")}</td>
                    <td>
                      {t.startPage}–{t.endPage}
                    </td>
                    <td>{t.questionCount} · Part 1/2/3/4</td>
                    <td>
                      {t.needsReview ? (
                        <span className="badge orange">
                          {t.needsReview} câu cần audio
                        </span>
                      ) : (
                        <span className="badge green">
                          <Check size={12} /> Đủ nội dung
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {job.status === "review" && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />{" "}
                Đã kiểm tra nội dung câu hỏi. Đáp án vẫn chưa được xác nhận.
              </label>
              <Button
                disabled={!checked || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/imports/${job.id}/publish`, { method: "POST" });
                    await refresh();
                    onUpdated();
                    notify("Đã đưa các đề Listening vào thư viện luyện tập.");
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Đưa vào luyện tập <ArrowRight size={16} />
              </Button>
            </>
          )}
          {job.status === "published" && (
            <Button asChild>
              <Link to="/listening">
                Luyện Listening từ PDF của bạn <ArrowRight size={16} />
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
