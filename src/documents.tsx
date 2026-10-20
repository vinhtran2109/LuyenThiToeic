import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Music2,
  Check,
  Plus,
  Trash2,
  Headphones,
  ArrowRight,
  Save,
  FolderOpen,
} from "lucide-react";
import { api, parts, useUI } from "./lib";
import type { Doc, Test, Mapping, Question } from "./types";
import { Button } from "./components/ui/button";
import { Link } from "react-router-dom";
import { ReadingImportPanel } from "./components/reading-import-panel";
import { ListeningImportPanel } from "./components/listening-import-panel";
import { AnswerKeyLibrary } from "./components/answer-key-library";
const PdfPreview = lazy(() =>
  import("./components/pdf-preview").then((module) => ({
    default: module.PdfPreview,
  })),
);
export function Documents() {
  const [tab, setTab] = useState(
      () => new URLSearchParams(window.location.search).get("tab") || "files",
    ),
    [docs, setDocs] = useState<Doc[]>([]),
    [importKind, setImportKind] = useState<"reading" | "listening">("reading"),
    [tests, setTests] = useState<Test[]>([]),
    [testId, setTestId] = useState("sample-1"),
    [selected, setSelected] = useState<Doc>(),
    [kind, setKind] = useState("reading"),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState("");
  const notify = useUI((s) => s.notify);
  async function load() {
    try {
      const [d, t] = await Promise.all([
        api<Doc[]>("/documents"),
        api<Test[]>("/tests"),
      ]);
      setDocs(d);
      setTests(t);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function upload(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 300 * 1024 * 1024) {
      setError(
        "File vượt quá giới hạn 300 MB. Hãy tách tài liệu thành các phần nhỏ hơn.",
      );
      return;
    }
    const data = new FormData();
    data.append("file", file);
    data.append("kind", kind);
    const req = new XMLHttpRequest();
    req.open("POST", "/api/documents");
    setProgress(0);
    req.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    req.onload = () => {
      setProgress(null);
      try {
        const result = JSON.parse(req.responseText);
        if (req.status >= 400) throw Error(result.error);
        setSelected(result);
        void load();
        notify(
          "Đã tải tài liệu. Hãy kiểm tra nội dung trước khi nhập câu hỏi.",
        );
      } catch (e: any) {
        setError(e.message);
      }
    };
    req.onerror = () => {
      setProgress(null);
      setError("Không kết nối được máy chủ.");
    };
    req.send(data);
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">YOUR CONTENT LIBRARY</div>
          <h1>Quản lý tài liệu</h1>
          <p>
            Tập hợp nguồn học, kiểm tra nội dung và xây dựng bộ đề của riêng
            bạn.
          </p>
        </div>
        <span className="subtle-tag">
          <FolderOpen size={15} /> Lưu trữ trên thiết bị
        </span>
      </div>
      <div className="tabs">
        {[
          ["files", "Tài liệu & PDF"],
          ["import", "Chuyển PDF thành đề"],
          ["audio", "Audio Mapping"],
          ["editor", "Biên tập câu hỏi"],
          ["keys", "Đáp án"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div className="notice error">{error}</div>}
      {tab !== "files" && tab !== "import" && (
        <label className="test-select">
          Bộ đề đang biên tập
          <select value={testId} onChange={(e) => setTestId(e.target.value)}>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === "files" && (
        <>
          <div className="notice">
            <FileText size={18} />
            <span>
              PDF có text layer được trích xuất để kiểm tra. Với PDF scan, mở{" "}
              <b>Chuyển PDF thành đề</b> để chạy OCR và tạo đề Reading giữ
              nguyên ảnh gốc.
            </span>
          </div>
          <div className="card upload-panel">
            <div>
              <span className="upload-icon">
                <Upload size={26} />
              </span>
              <h2>Thêm tài liệu học tập</h2>
              <p>PDF, MP3, WAV, M4A, PNG, JPG · Tối đa 300 MB mỗi file</p>
              <div className="upload-controls">
                <select
                  aria-label="Loại tài liệu"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="reading">Reading PDF</option>
                  <option value="listening">Listening PDF</option>
                  <option value="answer-key">Answer Key PDF</option>
                  <option value="audio">Audio</option>
                  <option value="image">Hình ảnh câu hỏi</option>
                </select>
                <label className="btn btn-primary upload-button">
                  <Plus size={16} />
                  {progress !== null ? "Đang xử lý…" : "Chọn file từ máy"}
                  <input
                    type="file"
                    disabled={progress !== null}
                    accept=".pdf,.mp3,.wav,.m4a,.png,.jpg,.jpeg"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
              </div>
              {progress !== null && (
                <div className="upload-progress">
                  <progress max="100" value={progress} />
                  <span>
                    {progress === 100 ? "Đang đọc tài liệu…" : `${progress}%`}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="document-grid">
            <div className="card document-list">
              <h2>
                Thư viện của bạn <span>{docs.length}</span>
              </h2>
              {docs.length ? (
                docs.map((d) => (
                  <button
                    key={d.id}
                    className={
                      "document-item " +
                      (selected?.id === d.id ? "selected" : "")
                    }
                    onClick={() => setSelected(d)}
                  >
                    {d.path.endsWith(".pdf") ? (
                      <FileText size={22} />
                    ) : d.kind === "audio" ? (
                      <Music2 size={22} />
                    ) : (
                      <FolderOpen size={22} />
                    )}
                    <span>
                      <b>{d.name}</b>
                      <small>
                        {(d.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {d.status === "review"
                          ? "Cần kiểm tra thủ công"
                          : d.status === "needs-ocr"
                            ? "Cần OCR"
                            : d.status === "converted"
                              ? "Đã tạo đề luyện"
                              : "Đã lưu"}
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))
              ) : (
                <div className="empty">
                  <FileText size={26} />
                  <p>Chưa có tài liệu. Thêm file để bắt đầu.</p>
                </div>
              )}
            </div>
            <div className="card preview-panel">
              {selected ? (
                <>
                  <h2>{selected.name}</h2>
                  {selected.path.endsWith(".pdf") ? (
                    <>
                      {selected.status === "needs-ocr" && (
                        <div className="notice">
                          PDF scan · Dùng tab Chuyển PDF thành đề để nhận dạng
                          vị trí câu hỏi.
                        </div>
                      )}
                      <Suspense fallback={<p>Đang tải trình xem PDF…</p>}>
                        <PdfPreview src={selected.path} />
                      </Suspense>
                      <details>
                        <summary>Văn bản trích xuất · cần kiểm tra</summary>
                        <pre>
                          {selected.text
                            .replace(/--- Trang \d+ ---/g, "")
                            .trim()
                            ? selected.text
                            : "Không tìm thấy text layer. Cần OCR hoặc nhập thủ công."}
                        </pre>
                      </details>
                      <p className="muted">
                        Bản gốc hiển thị bằng PDF.js. Chuyển trang để đối chiếu
                        nội dung và bố cục.
                      </p>
                    </>
                  ) : /\.(mp3|wav|m4a)$/i.test(selected.path) ? (
                    <audio controls src={selected.path} />
                  ) : (
                    <img src={selected.path} alt={selected.name} />
                  )}
                </>
              ) : (
                <div className="empty">
                  <FileText size={30} />
                  <h3>Đối chiếu tài liệu gốc</h3>
                  <p>Chọn một file trong thư viện để xem trước.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {tab === "import" && (
        <>
          <div className="tabs sub-tabs">
            {[
              ["reading", "Reading"],
              ["listening", "Listening"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setImportKind(id as "reading" | "listening")}
                className={importKind === id ? "active" : ""}
              >
                {label}
              </button>
            ))}
          </div>
          {importKind === "reading" ? (
            <ReadingImportPanel docs={docs} onUpdated={load} />
          ) : (
            <ListeningImportPanel docs={docs} onUpdated={load} />
          )}
        </>
      )}
      {tab === "audio" && (
        <>
          <div className="notice">
            Phân đoạn tự động, waveform kéo thả và Whisper nằm trong Audio
            Studio.{" "}
            <Link className="btn btn-outline" to="/admin/audio-editor">
              Mở Audio Studio
            </Link>
          </div>
          <AudioEditor docs={docs} testId={testId} />
        </>
      )}
      {tab === "editor" && <QuestionEditor testId={testId} docs={docs} />}
      {tab === "keys" && (
        <>
          <AnswerKeyLibrary />
          <KeyEditor testId={testId} />
        </>
      )}
    </>
  );
}
function AudioEditor({ docs, testId }: { docs: Doc[]; testId: string }) {
  const [maps, setMaps] = useState<Mapping[]>([]),
    [docId, setDocId] = useState(""),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(10),
    [part, setPart] = useState(1),
    [first, setFirst] = useState(1),
    [last, setLast] = useState(1),
    [sequence, setSequence] = useState(1),
    [gap, setGap] = useState(0),
    [groupId, setGroupId] = useState("q-1"),
    [duration, setDuration] = useState(0),
    [position, setPosition] = useState(0),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null),
    notify = useUI((s) => s.notify),
    audios = docs.filter((d) => /\.(mp3|wav|m4a)$/i.test(d.path)),
    doc = audios.find((d) => d.id === docId);
  async function load() {
    try {
      setMaps(await api("/mappings/" + testId));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, [testId]);
  const covered = new Set(
    maps.flatMap((m) =>
      Array.from(
        { length: m.questionEnd - m.questionStart + 1 },
        (_, i) => m.questionStart + i,
      ),
    ),
  ).size;
  async function save() {
    try {
      if (end > duration || end <= start || !duration)
        throw Error(
          "Hãy kiểm tra thời lượng audio và khoảng bắt đầu/kết thúc.",
        );
      const body = {
        testId,
        documentId: docId,
        part,
        questionStart: first,
        questionEnd: last,
        groupId,
        start,
        end,
        sequence,
        gap,
      };
      await api("/mappings" + (editing ? "/" + editing : ""), {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(undefined);
      await load();
      notify("Đã lưu mapping audio được bạn xác nhận.");
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="notice">
        <Headphones size={19} />
        <span>
          Đã gán {covered}/100 câu Listening · Còn {100 - covered} câu thiếu
          audio. Tự xác minh nội dung trước khi lưu; thứ tự phát lấy từ trường
          “Thứ tự”, không lấy từ tên file.
        </span>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="card audio-editor">
        <h2>{editing ? "Điều chỉnh audio mapping" : "Thiết lập đoạn audio"}</h2>
        <label>
          Nguồn audio
          <select
            value={docId}
            onChange={(e) => {
              setDocId(e.target.value);
              setDuration(0);
            }}
          >
            <option value="">Chọn file đã tải lên</option>
            {audios.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {doc && (
          <div className="audio-timeline">
            <audio
              ref={audio}
              controls
              src={doc.path}
              onLoadedMetadata={() =>
                setDuration(
                  Number.isFinite(audio.current?.duration)
                    ? audio.current!.duration
                    : 0,
                )
              }
              onTimeUpdate={() => {
                if (audio.current) {
                  setPosition(audio.current.currentTime);
                  if (audio.current.currentTime >= end) audio.current.pause();
                }
              }}
            />
            <input
              aria-label="Timeline audio"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={position}
              onChange={(e) => {
                if (audio.current) audio.current.currentTime = +e.target.value;
              }}
            />
            <div className="section-title">
              <small>
                {position.toFixed(1)}s / {duration.toFixed(1)}s
              </small>
              <Button
                variant="outline"
                onClick={() => {
                  if (audio.current) {
                    audio.current.currentTime = start;
                    void audio.current.play();
                  }
                }}
              >
                Nghe thử đoạn {start}–{end}s
              </Button>
            </div>
          </div>
        )}
        <div className="mapping-fields">
          <label>
            Bắt đầu (giây)
            <input
              type="number"
              min="0"
              step="0.1"
              value={start}
              onChange={(e) => setStart(+e.target.value)}
            />
          </label>
          <label>
            Kết thúc (giây)
            <input
              type="number"
              min="0"
              step="0.1"
              value={end}
              onChange={(e) => setEnd(+e.target.value)}
            />
          </label>
          <label>
            Part
            <select value={part} onChange={(e) => setPart(+e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Part {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Câu bắt đầu
            <input
              type="number"
              min="1"
              max="100"
              value={first}
              onChange={(e) => setFirst(+e.target.value)}
            />
          </label>
          <label>
            Câu kết thúc
            <input
              type="number"
              min="1"
              max="100"
              value={last}
              onChange={(e) => setLast(+e.target.value)}
            />
          </label>
          <label>
            Group ID
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </label>
          <label>
            Thứ tự phát
            <input
              type="number"
              min="1"
              value={sequence}
              onChange={(e) => setSequence(+e.target.value)}
            />
          </label>
          <label>
            Nghỉ sau đoạn (giây)
            <input
              type="number"
              min="0"
              value={gap}
              onChange={(e) => setGap(+e.target.value)}
            />
          </label>
        </div>
        <Button onClick={save} disabled={!doc}>
          <Check size={16} /> Xác nhận nội dung & lưu mapping
        </Button>
      </div>
      <div className="card recent-card">
        <h2>Trình tự Listening</h2>
        {maps.length ? (
          maps.map((m) => (
            <div className="mapping-row" key={m.id}>
              <span className="mapping-order">{m.sequence}</span>
              <div>
                <strong>
                  Part {m.part} · Câu {m.questionStart}–{m.questionEnd}
                </strong>
                <small>
                  {m.document.name} · {m.start}–{m.end}s · nghỉ {m.gap}s ·{" "}
                  {m.groupId}
                </small>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(m.id);
                  setDocId(m.documentId);
                  setStart(m.start);
                  setEnd(m.end);
                  setPart(m.part);
                  setFirst(m.questionStart);
                  setLast(m.questionEnd);
                  setSequence(m.sequence);
                  setGap(m.gap);
                  setGroupId(m.groupId);
                }}
              >
                Sửa
              </Button>
              <button
                className="icon-btn"
                aria-label="Xóa mapping"
                onClick={async () => {
                  await api("/mappings/" + m.id, { method: "DELETE" });
                  void load();
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty">
            Chưa có mapping. Chọn audio và gán đoạn đầu tiên.
          </div>
        )}
      </div>
    </>
  );
}
function QuestionEditor({ testId, docs }: { testId: string; docs: Doc[] }) {
  const [qs, setQs] = useState<Question[]>([]),
    [number, setNumber] = useState(101),
    [q, setQ] = useState<Question>(),
    [pdf, setPdf] = useState(""),
    [error, setError] = useState("");
  const notify = useUI((s) => s.notify);
  useEffect(() => {
    api<Test>("/editor/" + testId)
      .then((t) => setQs(t.questions || []))
      .catch((e) => setError(e.message));
  }, [testId]);
  useEffect(() => {
    setQ(qs.find((q) => q.number === number));
  }, [qs, number]);
  async function save() {
    if (!q) return;
    try {
      await api("/questions/" + q.id, {
        method: "PUT",
        body: JSON.stringify({
          ...q,
          answer: q.answer || null,
          explanation: q.explanation || "",
          image: q.image || null,
        }),
      });
      setQs((v) => v.map((old) => (old.id === q.id ? q : old)));
      notify("Đã lưu câu hỏi và trạng thái đáp án.");
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="notice">
        Chỉnh sửa các câu hỏi và đáp án của bộ đề đã chọn. Tab Chuyển PDF thành
        đề hỗ trợ OCR để tạo đề Reading từ ảnh gốc. Part và nhóm câu hiện giữ
        theo cấu trúc đã nhập; chưa hỗ trợ gộp/tách nhóm tại đây.
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="editor-layout">
        <div className="card preview-panel">
          <label>
            PDF đối chiếu
            <select value={pdf} onChange={(e) => setPdf(e.target.value)}>
              <option value="">Chọn PDF gốc</option>
              {docs
                .filter((d) => d.path.endsWith(".pdf"))
                .map((d) => (
                  <option value={d.path} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          {pdf ? (
            <Suspense fallback={<p>Đang tải trình xem PDF…</p>}>
              <PdfPreview src={pdf} />
            </Suspense>
          ) : (
            <div className="empty">
              <FileText size={32} />
              <p>Thêm PDF trong tab Tài liệu để đối chiếu.</p>
            </div>
          )}
        </div>
        <div className="card question-editor">
          <label>
            Câu hỏi
            <select value={number} onChange={(e) => setNumber(+e.target.value)}>
              {qs.map((q) => (
                <option key={q.id} value={q.number}>
                  Câu {q.number} · Part {q.part} · {parts[q.part - 1]}
                </option>
              ))}
            </select>
          </label>
          {q && (
            <>
              <small>
                Nhóm: {q.groupId} · Part {q.part}
              </small>
              <label>
                Nội dung câu hỏi
                <textarea
                  value={q.prompt}
                  onChange={(e) => setQ({ ...q, prompt: e.target.value })}
                />
              </label>
              <label>
                Đoạn văn (giữ xuống dòng)
                <textarea
                  className="passage-editor"
                  value={q.passage}
                  onChange={(e) => setQ({ ...q, passage: e.target.value })}
                />
              </label>
              {q.options.map((o, i) => (
                <label key={i}>
                  Lựa chọn {String.fromCharCode(65 + i)}
                  <input
                    value={o}
                    onChange={(e) =>
                      setQ({
                        ...q,
                        options: q.options.map((old, j) =>
                          j === i ? e.target.value : old,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Hình ảnh
                <select
                  value={q.image || ""}
                  onChange={(e) => setQ({ ...q, image: e.target.value })}
                >
                  <option value="">Không có ảnh</option>
                  <option value="/sample-office.svg">
                    Minh họa mẫu Studio
                  </option>
                  {docs
                    .filter((d) => /\.(png|jpg|jpeg)$/i.test(d.path))
                    .map((d) => (
                      <option key={d.id} value={d.path}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Đáp án
                <select
                  value={q.answer || ""}
                  onChange={(e) =>
                    setQ({ ...q, answer: e.target.value, confirmed: false })
                  }
                >
                  <option value="">Chưa có đáp án</option>
                  {q.options.map((_, i) => (
                    <option key={i}>{String.fromCharCode(65 + i)}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={q.confirmed}
                  onChange={(e) => setQ({ ...q, confirmed: e.target.checked })}
                />{" "}
                Tôi đã kiểm tra và xác nhận đáp án
              </label>
              <label>
                Giải thích
                <textarea
                  value={q.explanation || ""}
                  onChange={(e) => setQ({ ...q, explanation: e.target.value })}
                />
              </label>
              <Button onClick={save}>
                <Save size={16} /> Lưu câu hỏi
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
function KeyEditor({ testId }: { testId: string }) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const notify = useUI((s) => s.notify);
  function parse() {
    const text = value.trim();
    if (text.startsWith("{")) return JSON.parse(text);
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((l) => !/^question|^number|^cau/i.test(l))
        .map((l) => {
          const pair = l.trim().split(/[,;\t\s]+/);
          if (pair.length !== 2)
            throw Error("Mỗi dòng CSV cần số câu và đáp án, ví dụ 101,A");
          return [pair[0], pair[1].toUpperCase()];
        }),
    );
  }
  return (
    <div className="card key-editor">
      <h2>Nhập đáp án đã xác nhận</h2>
      <p>
        JSON: {JSON.stringify({ "101": "A", "102": "B" })} hoặc CSV mỗi dòng
        “101,A”. PDF đáp án được tải và đối chiếu trong tab Tài liệu; chưa tự
        nhận dạng đáp án từ PDF.
      </p>
      <label className="btn btn-outline upload-button">
        <Upload size={15} /> Chọn CSV / JSON
        <input
          type="file"
          accept=".json,.csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setValue(await f.text());
            setConfirmed(false);
          }}
        />
      </label>
      <textarea
        aria-label="Đáp án JSON hoặc CSV"
        placeholder={"101,A\n102,B\n103,C"}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setConfirmed(false);
        }}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        Tôi xác nhận đáp án đã đối chiếu với nguồn
      </label>
      {error && <p className="notice error">{error}</p>}
      <Button
        disabled={!confirmed || !value.trim()}
        onClick={async () => {
          try {
            const data = parse();
            const r = await api("/keys/" + testId, {
              method: "POST",
              body: JSON.stringify(data),
            });
            notify(`Đã cập nhật ${r.updated} đáp án.`);
            setError("");
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        <Check size={16} /> Lưu đáp án
      </Button>
    </div>
  );
}
