import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Question, Test } from "../types";
export function SourcePages({
  question,
  test,
}: {
  question: Question;
  test: Test;
}) {
  const [page, setPage] = useState(
      question.sourcePages?.[0]?.page || question.sourcePage || 1,
    ),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    setPage(question.sourcePages?.[0]?.page || question.sourcePage || 1);
    setZoom(1);
  }, [question.groupId]);
  const first = test.sourceStartPage || question.sourcePage || 1,
    last = test.sourceEndPage || question.sourcePage || 1;
  const url = `/uploads/import-${test.sourceDocumentId}/page-${String(page).padStart(3, "0")}.jpg`;
  return (
    <div className="source-pages">
      <div className="notice source-notice">
        Bản scan gốc · Câu {question.number} nằm ở trang PDF{" "}
        {question.sourcePage}. Đọc các trang liên quan, rồi chọn A/B/C/D trong
        khung trả lời.
      </div>
      <div className="source-toolbar">
        <button
          aria-label="Trang tài liệu trước"
          disabled={page <= first}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          Trang PDF{" "}
          <select
            aria-label="Trang tài liệu"
            value={page}
            onChange={(e) => setPage(+e.target.value)}
          >
            {Array.from({ length: last - first + 1 }, (_, i) => i + first).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                  {question.sourcePages?.some((p) => p.page === n)
                    ? " · liên quan"
                    : ""}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          aria-label="Trang tài liệu tiếp"
          disabled={page >= last}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={18} />
        </button>
        <span />
        <button
          aria-label="Thu nhỏ tài liệu"
          disabled={zoom <= 0.75}
          onClick={() => setZoom((z) => z - 0.25)}
        >
          <ZoomOut size={17} />
        </button>
        <small>{Math.round(zoom * 100)}%</small>
        <button
          aria-label="Phóng to tài liệu"
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => z + 0.25)}
        >
          <ZoomIn size={17} />
        </button>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Mở ảnh gốc">
          <ExternalLink size={17} />
        </a>
      </div>
      <div className="source-image-scroll">
        <img
          src={url}
          alt={`Bản scan gốc trang PDF ${page}`}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
        />
      </div>
      <div className="source-group-pages">
        {question.sourcePages?.map((p) => (
          <button
            key={p.page}
            className={page === p.page ? "active" : ""}
            onClick={() => setPage(p.page)}
          >
            Trang {p.page}
            {p.page === question.sourcePage ? " · câu hỏi" : ""}
          </button>
        ))}
      </div>
      <p className="source-key-note">
        {question.confirmed
          ? "Câu này đã có đáp án xác nhận. Nộp bài để xem kết quả và đáp án."
          : "Chưa có đáp án được xác nhận. Bài làm và thời gian vẫn được lưu."}
      </p>
    </div>
  );
}
