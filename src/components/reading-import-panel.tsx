import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, FileScan, RefreshCw } from "lucide-react";
import type { Doc } from "../types";
import { api, useUI } from "../lib";
import { Button } from "./ui/button";
const PdfPreview = lazy(() =>
  import("./pdf-preview").then((m) => ({ default: m.PdfPreview })),
);
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
    needsReview?: number;
    tests?: {
      testId: string;
      index: number;
      startPage: number;
      endPage: number;
      questionCount: number;
      missing: number[];
    }[];
  };
};
export function ReadingImportPanel({
  docs,
  onUpdated,
}: {
  docs: Doc[];
  onUpdated: () => void;
}) {
  const pdfs = docs.filter((d) => d.path.endsWith(".pdf"));
  const [docId, setDocId] = useState(pdfs[0]?.id || ""),
    [jobs, setJobs] = useState<Job[]>([]),
    [count, setCount] = useState(10),
    [perTest, setPerTest] = useState(29),
    [covers, setCovers] = useState(1),
    [title, setTitle] = useState("1000 Reading"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false),
    [review, setReview] = useState(false),
    [locations, setLocations] = useState<Record<string, string>>({});
  const notify = useUI((s) => s.notify),
    doc = pdfs.find((d) => d.id === docId),
    job = jobs.find((j) => j.documentId === docId);
  const [loadError, setLoadError] = useState("");
  async function refresh() {
    try {
      setJobs(await api<Job[]>("/imports"));
      setLoadError("");
    } catch (e: any) {
      setLoadError(e.message);
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
      await api(`/documents/${doc.id}/reading-import`, {
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
  async function saveLocations() {
    const updates = Object.entries(locations)
      .filter(([, v]) => v)
      .map(([key, v]) => ({
        test: Number(key.split(":")[0]),
        question: Number(key.split(":")[1]),
        page: Number(v),
      }));
    setBusy(true);
    try {
      await api(`/imports/${job!.id}/locations`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      setLocations({});
      await refresh();
      notify("Đang kiểm tra lại ánh xạ từ các trang bạn xác nhận.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice">
        <FileScan size={21} />
        <span>
          OCR chạy cục bộ để đọc câu hỏi và lựa chọn trong bản scan. Đề luyện
          giữ ảnh gốc, bảng biểu và các trang đọc liên quan. Nội dung OCR không
          được dùng làm đáp án.
        </span>
      </div>
      <div className="card import-config">
        <h2>Chuyển PDF thành đề Reading</h2>
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
              Kiểm tra ranh giới đề trong PDF trước khi bắt đầu. Mỗi đề Reading
              cần câu 101–200, gồm 30/16/54 câu ở Part 5/6/7.
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
              <small>
                Bạn có thể chuyển trang; tiến độ xử lý được lưu trên máy. Sau
                khi máy chủ khởi động lại, dùng nút tiếp tục bên dưới.
              </small>
            )}
            {["queued", "ocr"].includes(job.status) && (
              <Button variant="outline" disabled={busy} onClick={start}>
                <RefreshCw size={14} /> Tiếp tục nếu xử lý bị gián đoạn
              </Button>
            )}
          </div>
        )}
        {(error || loadError) && (
          <p className="notice error">{error || loadError}</p>
        )}
      </div>
      {job?.result.tests && (
        <div className="card import-review">
          <div className="section-title">
            <h2>
              {job.result.tests.length} đề ·{" "}
              {job.result.tests.reduce((n, t) => n + t.questionCount, 0)} câu
              Reading
            </h2>
            <Button variant="outline" onClick={() => setReview(!review)}>
              Đối chiếu vị trí
            </Button>
          </div>
          <p>
            Câu hỏi và lựa chọn được đọc thẳng từ bản scan; đoạn văn và bảng biểu
            vẫn giữ nguyên ảnh gốc. Chưa có answer key; ứng dụng lưu đáp án nhưng
            chưa chấm điểm.
          </p>
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
                    <td>{t.questionCount} · Part 5/6/7</td>
                    <td>
                      {t.missing.length ? (
                        <span className="badge orange">
                          {t.missing.length} vị trí cần xem
                        </span>
                      ) : (
                        <span className="badge green">
                          <Check size={12} /> Đủ vị trí
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {review && (
            <div className="import-location-editor">
              <div>
                {job.result.tests.flatMap((t) =>
                  t.missing.map((n) => (
                    <label key={`${t.index}:${n}`}>
                      Test {t.index} · Câu {n}
                      <input
                        type="number"
                        placeholder={`Trang ${t.startPage}–${t.endPage}`}
                        min={t.startPage}
                        max={t.endPage}
                        value={locations[`${t.index}:${n}`] || ""}
                        onChange={(e) =>
                          setLocations((v) => ({
                            ...v,
                            [`${t.index}:${n}`]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  )),
                )}
                {job.result.needsReview === 0 ? (
                  <p>Đã tìm đủ vị trí câu 101–200 trong mỗi đề.</p>
                ) : (
                  <Button
                    disabled={busy || !Object.values(locations).some(Boolean)}
                    onClick={saveLocations}
                  >
                    Lưu các vị trí đã đối chiếu
                  </Button>
                )}
              </div>
              <div>
                {doc && (
                  <Suspense fallback={<p>Đang mở PDF…</p>}>
                    <PdfPreview src={doc.path} />
                  </Suspense>
                )}
              </div>
            </div>
          )}
          {job.status === "review" && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />{" "}
                Đã kiểm tra ranh giới đề và vị trí câu hỏi. Đáp án vẫn chưa được
                xác nhận.
              </label>
              <Button
                disabled={!checked || busy || !!job.result.needsReview}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/imports/${job.id}/publish`, { method: "POST" });
                    await refresh();
                    onUpdated();
                    notify("Đã đưa các đề Reading vào thư viện luyện tập.");
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
              <Link to="/reading">
                Luyện Reading từ PDF của bạn <ArrowRight size={16} />
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
