import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AudioWaveform } from "./components/audio-waveform";
import { Button } from "./components/ui/button";
import { api, useUI, clock } from "./lib";
import {
  listeningGroups,
  validateSegments,
  type DraftSegment,
  type Transcript,
} from "../server/audio-domain";
import type { Doc, Test } from "./types";
import {
  Upload,
  AudioLines,
  WandSparkles,
  Save,
  Play,
  Scissors,
  Download,
  Check,
  AlertCircle,
  RefreshCw,
  FileJson,
  Headphones,
  ChevronRight,
} from "lucide-react";
type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  message: string;
  result: any;
};
type Project = {
  referenceDocumentId?: string;
  id: string;
  title: string;
  documentId: string;
  document: Doc;
  duration: number;
  metadata: any;
  peaksPath?: string;
  revision: number;
  publishedRevision?: number;
  viewState: { slot?: number; zoom?: number; cursor?: number };
  segments: DraftSegment[];
  jobs: Job[];
  transcript: Transcript[];
  silences: { start: number; end: number }[];
};
type Summary = {
  id: string;
  title: string;
  duration: number;
  document: Doc;
  jobs: Job[];
};
export function AudioEditor() {
  const [params, setParams] = useSearchParams(),
    id = params.get("project");
  const [list, setList] = useState<Summary[]>([]),
    [p, setP] = useState<Project>(),
    [segments, setSegments] = useState<DraftSegment[]>([]),
    [testId, setTestId] = useState<string | null>(null),
    [tests, setTests] = useState<Test[]>([]),
    [docs, setDocs] = useState<Doc[]>([]),
    [system, setSystem] = useState<any>(),
    [slot, setSlot] = useState(1),
    [part, setPart] = useState(0),
    [cursor, setCursor] = useState(0),
    [zoom, setZoom] = useState(0.5),
    [noise, setNoise] = useState(-35),
    [minSilence, setMinSilence] = useState(0.7),
    [preview, setPreview] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [uploadProgress, setUploadProgress] = useState<number | null>(null),
    [transcriptText, setTranscriptText] = useState(""),
    [model, setModel] = useState("tiny.en"),
    [pdfId, setPdfId] = useState(""),
    [context, setContext] = useState<Test>(),
    [storageDoc, setStorageDoc] = useState("");
  const notify = useUI((s) => s.notify),
    projectRef = useRef(p),
    draftRef = useRef({ segments, testId, slot, cursor, zoom, pdfId }),
    dirtyRef = useRef(dirty),
    savingPromise = useRef<Promise<Project | undefined> | null>(null),
    editVersion = useRef(0);
  projectRef.current = p;
  draftRef.current = { segments, testId, slot, cursor, zoom, pdfId };
  dirtyRef.current = dirty;
  async function refreshList() {
    try {
      const [projects, ts, ds] = await Promise.all([
        api<Summary[]>("/audio/projects"),
        api<Test[]>("/tests"),
        api<Doc[]>("/documents"),
      ]);
      setList(projects);
      setTests(ts);
      setDocs(ds);
    } catch (e: any) {
      setError(e.message);
    }
  }
  function adopt(next: Project, initial = false) {
    setP(next);
    projectRef.current = next;
    setSegments(next.segments);
    setTestId((next as any).testId || null);
    setPdfId(next.referenceDocumentId || "");
    if (initial) {
      let view = next.viewState || {};
      try {
        const local = JSON.parse(
          localStorage.getItem("audio-view-" + next.id) || "null",
        );
        if (local) view = local;
      } catch {}
      setSlot(view.slot || 1);
      setZoom(view.zoom ?? 0.5);
      setCursor(view.cursor || 0);
      try {
        const cached = JSON.parse(
          localStorage.getItem("audio-draft-" + next.id) || "null",
        );
        if (cached?.dirty && cached.revision === next.revision) {
          setSegments(cached.segments);
          setTestId(cached.testId);
          setPdfId(cached.pdfId || next.referenceDocumentId || "");
          setDirty(true);
          dirtyRef.current = true;
          return;
        }
        if (cached?.dirty)
          notify(
            "Có bản nháp trình duyệt cũ. Dữ liệu SQLite mới hơn đã được giữ; có thể xuất bản dự phòng để đối chiếu.",
          );
      } catch {}
    }
    setDirty(false);
    dirtyRef.current = false;
  }
  useEffect(() => {
    void refreshList();
    api("/audio/system")
      .then(setSystem)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setP(undefined);
    setError("");
    setDirty(false);
    dirtyRef.current = false;
    if (!id) return;
    let live = true;
    api<Project>("/audio/projects/" + id)
      .then((next) => {
        if (live) adopt(next, true);
      })
      .catch((e) => setError(e.message));
    const timer = setInterval(async () => {
      try {
        const next = await api<Project>("/audio/projects/" + id);
        if (!live) return;
        setList((rows) =>
          rows.map((row) =>
            row.id === next.id
              ? { ...row, duration: next.duration, jobs: next.jobs.slice(0, 1) }
              : row,
          ),
        );
        const current = projectRef.current;
        if (
          !dirtyRef.current &&
          !savingPromise.current &&
          current?.revision !== next.revision
        )
          adopt(next);
        else
          setP((prev) =>
            prev
              ? {
                  ...prev,
                  duration: next.duration,
                  metadata: next.metadata,
                  peaksPath: next.peaksPath,
                  jobs: next.jobs,
                  transcript: next.transcript,
                  silences: next.silences,
                  publishedRevision: next.publishedRevision,
                }
              : next,
          );
      } catch (e: any) {
        if (live) setError(e.message);
      }
    }, 1800);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    if (!testId) {
      setContext(undefined);
      return;
    }
    api<Test>("/editor/" + testId)
      .then(setContext)
      .catch((e) => setError(e.message));
  }, [testId]);
  async function save(): Promise<Project | undefined> {
    if (savingPromise.current) await savingPromise.current;
    if (!projectRef.current) return;
    const current = projectRef.current,
      d = draftRef.current;
    if (!dirtyRef.current) return current;
    const version = editVersion.current;
    setSaving(true);
    const task = api<Project>(`/audio/projects/${current.id}/draft`, {
      method: "PUT",
      body: JSON.stringify({
        revision: current.revision,
        testId: d.testId,
        referenceDocumentId: d.pdfId || null,
        segments: d.segments,
        viewState: { slot: d.slot, cursor: d.cursor, zoom: d.zoom },
      }),
    })
      .then((next) => {
        setP(next);
        projectRef.current = next;
        if (version === editVersion.current) {
          setSegments(next.segments);
          setDirty(false);
          dirtyRef.current = false;
        }
        setError("");
        return next;
      })
      .catch((e) => {
        setError(e.message);
        throw e;
      })
      .finally(() => {
        setSaving(false);
        savingPromise.current = null;
      });
    savingPromise.current = task;
    return task;
  }
  useEffect(() => {
    if (!p) return;
    localStorage.setItem(
      "audio-draft-" + p.id,
      JSON.stringify({ revision: p.revision, segments, testId, pdfId, dirty }),
    );
    if (!dirty) return;
    const t = setTimeout(() => void save().catch(() => {}), 750);
    return () => clearTimeout(t);
  }, [segments, testId, pdfId, dirty, p?.revision]);
  useEffect(() => {
    if (!id || !p) return;
    const view = { slot, cursor, zoom };
    localStorage.setItem("audio-view-" + id, JSON.stringify(view));
    const t = setTimeout(
      () =>
        void api(`/audio/projects/${id}/view`, {
          method: "PUT",
          body: JSON.stringify(view),
        }).catch(() => {}),
      900,
    );
    return () => clearTimeout(t);
  }, [slot, cursor, zoom, id, !!p]);
  function update(which: number, patch: Partial<DraftSegment>) {
    editVersion.current++;
    setSegments((prev) =>
      prev.map((s) =>
        s.slot === which
          ? {
              ...s,
              ...patch,
              ...("confirmed" in patch
                ? {}
                : {
                    confirmed: false,
                    evidence: "manual",
                    confidence: 0,
                    reason: "Điều chỉnh thủ công; cần nghe và xác nhận lại.",
                  }),
            }
          : s,
      ),
    );
    setDirty(true);
    dirtyRef.current = true;
  }
  async function action(suffix: string, body: any = {}) {
    setBusy(true);
    setError("");
    try {
      const saved = await save();
      if (!saved) return;
      const result = await api(`/audio/projects/${saved.id}/${suffix}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (suffix === "publish") {
        notify(
          "Đã xuất bản 54 mapping đã xác nhận. File gốc được phát liên tục khi thi.",
        );
        adopt(await api("/audio/projects/" + saved.id));
      } else {
        setP(await api("/audio/projects/" + saved.id));
        notify("Đã tạo job xử lý nền. Bạn có thể rời trang và quay lại.");
      }
      return result;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function upload(file?: File) {
    if (!file) return;
    if (file.size > 1024 ** 3) {
      setError("Audio vượt giới hạn 1 GB.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/audio/upload");
    setUploadProgress(0);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadProgress(null);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw Error(data.error);
        setParams({ project: data.id });
        void refreshList();
      } catch (e: any) {
        setError(e.message);
      }
    };
    xhr.onerror = () => {
      setUploadProgress(null);
      setError("Upload thất bại. Kiểm tra máy chủ localhost.");
    };
    xhr.send(form);
  }
  const selected = segments.find((s) => s.slot === slot),
    v = validateSegments(segments, p?.duration || 0),
    pending = p?.jobs.some((j) => ["queued", "running"].includes(j.status)),
    detectResult = p?.jobs.find(
      (j) => j.kind === "detect" && j.status === "completed",
    )?.result,
    exportJobs =
      p?.jobs.filter((j) => j.kind === "export" && j.status === "completed") ||
      [],
    valid =
      selected?.start !== null &&
      selected?.end !== null &&
      selected &&
      selected.end! > selected.start!,
    canWork = !!p?.peaksPath && !pending && !busy;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">LISTENING CONTENT STUDIO</div>
          <h1>Audio Segmentation & Mapping</h1>
          <p>Nghe, xác định ranh giới và đối chiếu từng nhóm câu hỏi TOEIC.</p>
        </div>
        <label className="btn btn-primary upload-button">
          <Upload size={16} />
          {uploadProgress === null ? "Upload audio" : "Đang upload…"}
          <input
            disabled={uploadProgress !== null}
            type="file"
            accept=".mp3,.wav,.m4a"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <Button variant="ghost" onClick={() => setError("")}>
            Đóng
          </Button>
        </div>
      )}
      {uploadProgress !== null && (
        <div className="notice">
          <progress max="100" value={uploadProgress} />
          {uploadProgress}% · MP3 / WAV / M4A, tối đa 1 GB
        </div>
      )}
      <div className="audio-runtime">
        <span className={system?.ffmpeg ? "online" : "waiting"}>
          ● FFmpeg {system?.ffmpeg ? "sẵn sàng" : "đang kiểm tra"}
        </span>
        <span className={system?.ffprobe ? "online" : "waiting"}>
          ● FFprobe {system?.ffprobe ? "sẵn sàng" : "đang kiểm tra"}
        </span>
        <span>
          Whisper:{" "}
          {system?.whisper?.available
            ? "CPU · cục bộ · tùy chọn"
            : "chưa sẵn sàng · có thể nhập transcript JSON"}
        </span>
        <Link to="/documents">
          Thư viện tài liệu <ChevronRight size={13} />
        </Link>
      </div>
      <div className="audio-studio-grid">
        <aside className="card audio-library">
          <h2>
            <Headphones size={17} /> File audio
          </h2>
          <p>MP3, WAV, M4A · file gốc được giữ nguyên.</p>
          {list.map((item) => (
            <button
              key={item.id}
              className={"audio-file " + (id === item.id ? "active" : "")}
              onClick={async () => {
                if (dirtyRef.current)
                  try {
                    await save();
                  } catch {
                    return;
                  }
                setParams({ project: item.id });
              }}
            >
              <AudioLines size={20} />
              <span>
                <b>{item.title}</b>
                <small>
                  {item.duration ? clock(item.duration) : "Đang phân tích"} ·{" "}
                  {item.jobs[0]?.status || "draft"}
                </small>
              </span>
            </button>
          ))}
          {!list.length && (
            <div className="empty">
              <Upload size={25} />
              <p>Upload file Listening để bắt đầu.</p>
            </div>
          )}
          <details>
            <summary>Dùng audio đã có trong tài liệu</summary>
            <select
              aria-label="Audio trong thư viện"
              value={storageDoc}
              onChange={(e) => setStorageDoc(e.target.value)}
            >
              <option value="">Chọn audio</option>
              {docs
                .filter((d) => /\.(mp3|wav|m4a)$/i.test(d.path))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              disabled={!storageDoc}
              onClick={async () => {
                try {
                  const next = await api("/audio/projects", {
                    method: "POST",
                    body: JSON.stringify({ documentId: storageDoc }),
                  });
                  setParams({ project: next.id });
                  void refreshList();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Mở trong editor
            </Button>
          </details>
        </aside>
        <div className="audio-work-area">
          {!p ? (
            <div className="card empty audio-empty">
              <AudioLines size={40} />
              <h2>Không gian biên tập Listening</h2>
              <p>
                54 nhóm chuẩn · Part 1–4 · Phân tích nền · Xác nhận từng đoạn
              </p>
              <p>Chọn audio bên trái hoặc upload file khoảng 45 phút.</p>
            </div>
          ) : (
            <>
              <div className="card audio-wave-card">
                <div className="section-title">
                  <div>
                    <h2>{p.title}</h2>
                    <p>
                      {clock(p.duration)} ·{" "}
                      {p.metadata.codec || "Đang phân tích"} ·{" "}
                      {p.metadata.sampleRate
                        ? `${p.metadata.sampleRate} Hz · ${p.metadata.channels} kênh`
                        : ""}
                    </p>
                  </div>
                  <span className={"badge " + (dirty ? "orange" : "green")}>
                    {saving
                      ? "Đang lưu…"
                      : dirty
                        ? "Chưa lưu"
                        : `Đã lưu · v${p.revision}`}
                  </span>
                </div>
                {p.peaksPath ? (
                  <AudioWaveform
                    key={p.id}
                    url={p.document.path}
                    peaksPath={p.peaksPath}
                    duration={p.duration}
                    segments={segments}
                    slot={slot}
                    zoom={zoom}
                    initialCursor={cursor}
                    onCursor={setCursor}
                    onRange={(n, start, end) => update(n, { start, end })}
                    onSelect={(nextSlot) => {
                      setSlot(nextSlot);
                      const nextPart = segments.find(
                        (s) => s.slot === nextSlot,
                      )?.part;
                      if (part && nextPart && nextPart !== part)
                        setPart(nextPart);
                    }}
                    previewSignal={preview}
                  />
                ) : (
                  <div className="empty">
                    Đang kiểm tra định dạng và tạo waveform…
                  </div>
                )}
                <div className="audio-timeline-options">
                  <span>
                    Con trỏ: <b>{cursor.toFixed(2)}s</b> /{" "}
                    {p.duration.toFixed(2)}s
                  </span>
                  <label>
                    Zoom
                    <input
                      aria-label="Zoom waveform"
                      type="range"
                      min="0.2"
                      max="50"
                      step=".2"
                      value={zoom}
                      onChange={(e) => setZoom(+e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="card audio-actions">
                <label>
                  Ngưỡng lặng (dB)
                  <input
                    aria-label="Ngưỡng lặng dB"
                    type="number"
                    min="-80"
                    max="-10"
                    value={noise}
                    onChange={(e) => setNoise(+e.target.value)}
                  />
                </label>
                <label>
                  Lặng tối thiểu (s)
                  <input
                    aria-label="Khoảng lặng tối thiểu"
                    type="number"
                    min=".15"
                    max="10"
                    step=".05"
                    value={minSilence}
                    onChange={(e) => setMinSilence(+e.target.value)}
                  />
                </label>
                <Button
                  disabled={!canWork}
                  onClick={() => void action("detect", { noise, minSilence })}
                >
                  <WandSparkles size={16} /> Auto Detect
                </Button>
                <Button
                  disabled={!p || saving || busy}
                  variant="outline"
                  onClick={() =>
                    void save()
                      .then(() =>
                        notify("Đã lưu mapping bản nháp trong SQLite."),
                      )
                      .catch(() => {})
                  }
                >
                  <Save size={16} /> Save Mapping
                </Button>
                <p>
                  Auto Detect thay bản nháp và xóa xác nhận cũ. 54 đoạn không
                  chứng minh khớp đề; mọi đề xuất đều cần kiểm tra.
                </p>
              </div>
              <div className="audio-job-list">
                {p.jobs
                  .filter((j) =>
                    ["queued", "running", "paused", "error"].includes(j.status),
                  )
                  .map((j) => (
                    <div
                      className={
                        "card audio-job " +
                        (j.status === "error" ? "job-error" : "")
                      }
                      key={j.id}
                    >
                      <div className="section-title">
                        <b>
                          {j.kind} · {j.status}
                        </b>
                        <span>{j.progress}%</span>
                      </div>
                      <progress value={j.progress} max="100" />
                      <p role="status">{j.message}</p>
                      {["paused", "error"].includes(j.status) && (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await api("/audio/jobs/" + j.id + "/resume", {
                                method: "POST",
                              });
                              setP(await api("/audio/projects/" + p.id));
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          <RefreshCw size={14} /> Tiếp tục job
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
              <div className="audio-validation">
                <span className="badge green">
                  {segments.filter((s) => s.confirmed).length}/54 đã xác nhận
                </span>
                <span className="badge orange">
                  {v.missing.length} nhóm thiếu
                </span>
                <span className={v.overlaps.length ? "badge red" : "badge"}>
                  {v.overlaps.length} chồng lấn
                </span>
                <span className={v.duplicates.length ? "badge red" : "badge"}>
                  {v.duplicates.length} nhóm trùng
                </span>
                <span className="badge">
                  {v.gaps.length} khoảng thời gian chưa gán
                </span>
                {v.outOfOrder && (
                  <span className="badge red">Sai thứ tự thời gian</span>
                )}
              </div>
              {v.invalid.length > 0 && (
                <div className="notice error">{v.invalid.join(" ")}</div>
              )}
              {v.overlaps.length > 0 && (
                <div className="notice error">
                  Chồng lấn:{" "}
                  {v.overlaps.map((o) => `slot ${o.a}/${o.b}`).join(", ")}
                </div>
              )}
              <div className="audio-edit-grid">
                <div className="card audio-groups">
                  <div className="tabs">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        className={part === n ? "active" : ""}
                        onClick={() => {
                          setPart(n);
                          if (n && selected?.part !== n) {
                            const first = segments.find((s) => s.part === n);
                            if (first) setSlot(first.slot);
                          }
                        }}
                      >
                        {n ? "Part " + n : "54 nhóm"}
                      </button>
                    ))}
                  </div>
                  <div className="audio-group-list">
                    {segments
                      .filter((s) => !part || s.part === part)
                      .map((s) => (
                        <button
                          key={s.slot}
                          className={
                            "audio-group-row " +
                            (slot === s.slot ? "selected" : "")
                          }
                          onClick={() => setSlot(s.slot)}
                        >
                          <span className="group-slot">
                            {String(s.slot).padStart(2, "0")}
                          </span>
                          <div>
                            <b>
                              Part {s.part} · Câu {s.questionStart}
                              {s.questionEnd !== s.questionStart
                                ? "–" + s.questionEnd
                                : ""}
                            </b>
                            <small>
                              {s.start === null || s.end === null
                                ? "Chưa xác định"
                                : `${s.start.toFixed(2)} – ${s.end.toFixed(2)}s`}
                            </small>
                          </div>
                          <span
                            className={
                              "segment-state " +
                              (s.confirmed
                                ? "confirmed"
                                : s.evidence === "unknown"
                                  ? "unknown"
                                  : "proposed")
                            }
                          >
                            {s.confirmed ? (
                              <Check size={14} />
                            ) : s.evidence === "unknown" ? (
                              "?"
                            ) : (
                              Math.round(s.confidence * 100) + "%"
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
                <div className="card selected-segment">
                  {selected && (
                    <>
                      <div className="eyebrow">
                        SEGMENT {String(slot).padStart(2, "0")}
                      </div>
                      <h2>Biên tập nhóm audio</h2>
                      <label>
                        Liên kết câu hỏi / nhóm
                        <select
                          aria-label="Nhóm câu liên kết"
                          value={
                            listeningGroups.find(
                              (g) =>
                                g.part === selected.part &&
                                g.questionStart === selected.questionStart,
                            )?.slot || 1
                          }
                          onChange={(e) => {
                            const g = listeningGroups[+e.target.value - 1];
                            update(slot, {
                              part: g.part,
                              questionStart: g.questionStart,
                              questionEnd: g.questionEnd,
                            });
                          }}
                        >
                          {listeningGroups.map((g) => (
                            <option key={g.slot} value={g.slot}>
                              Part {g.part} · Câu {g.questionStart}
                              {g.questionEnd !== g.questionStart
                                ? "–" + g.questionEnd
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="segment-times">
                        <label>
                          Start time (s)
                          <input
                            aria-label="Start time"
                            type="number"
                            min="0"
                            max={p.duration}
                            step=".01"
                            value={selected.start ?? ""}
                            onChange={(e) =>
                              update(slot, {
                                start:
                                  e.target.value === ""
                                    ? null
                                    : +e.target.value,
                              })
                            }
                          />
                          <button
                            onClick={() =>
                              update(slot, {
                                start: Math.round(cursor * 100) / 100,
                              })
                            }
                          >
                            Lấy con trỏ
                          </button>
                        </label>
                        <label>
                          End time (s)
                          <input
                            aria-label="End time"
                            type="number"
                            min="0"
                            max={p.duration}
                            step=".01"
                            value={selected.end ?? ""}
                            onChange={(e) =>
                              update(slot, {
                                end:
                                  e.target.value === ""
                                    ? null
                                    : +e.target.value,
                              })
                            }
                          />
                          <button
                            onClick={() =>
                              update(slot, {
                                end: Math.round(cursor * 100) / 100,
                              })
                            }
                          >
                            Lấy con trỏ
                          </button>
                        </label>
                      </div>
                      <p className="segment-evidence">
                        <b>
                          Độ tin cậy: {Math.round(selected.confidence * 100)}% ·{" "}
                          {selected.evidence}
                        </b>
                        <br />
                        {selected.reason}
                      </p>
                      <div className="segment-buttons">
                        <Button
                          disabled={!valid}
                          onClick={() => setPreview((n) => n + 1)}
                        >
                          <Play size={15} /> Preview
                        </Button>
                        <Button
                          disabled={!valid || busy || pending}
                          variant="outline"
                          onClick={() =>
                            void action("export", { slots: [slot] })
                          }
                        >
                          <Scissors size={15} /> Split MP3
                        </Button>
                      </div>
                      <label className="checkbox-label segment-confirm">
                        <input
                          type="checkbox"
                          aria-label="Xác nhận đoạn audio"
                          checked={selected.confirmed}
                          disabled={!valid}
                          onChange={(e) =>
                            update(slot, { confirmed: e.target.checked })
                          }
                        />{" "}
                        Tôi xác nhận thời gian và nội dung đúng nhóm câu này.
                      </label>
                      <p className="muted">
                        Kéo hai mép vùng trên waveform để chỉnh start/end. Mỗi
                        thay đổi sẽ bỏ xác nhận của đoạn.
                      </p>
                      {context && (
                        <details className="question-context">
                          <summary>Nội dung câu hỏi để đối chiếu</summary>
                          {context.collection === "Studio Originals" && (
                            <p className="notice">
                              Đề mẫu tự soạn; không phải bằng chứng audio khớp
                              PDF.
                            </p>
                          )}
                          {context.questions
                            ?.filter(
                              (q) =>
                                q.number >= selected.questionStart &&
                                q.number <= selected.questionEnd,
                            )
                            .map((q) => (
                              <div key={q.id}>
                                <b>Câu {q.number}</b>
                                <p>{q.prompt}</p>
                                <small>{q.options.join(" · ")}</small>
                              </div>
                            ))}
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
              <details className="card candidate-panel">
                <summary>
                  {detectResult?.candidates?.length || 0} ứng viên khoảng lặng ·
                  chưa xác định nội dung
                </summary>
                <p>
                  Gán ứng viên vào slot đang chọn để nghe kiểm tra. Không tự coi
                  ứng viên thứ N là nhóm TOEIC thứ N.
                </p>
                <div>
                  {detectResult?.candidates?.map((c: any, i: number) => (
                    <button
                      key={i}
                      onClick={() =>
                        update(slot, {
                          start: c.start,
                          end: c.end,
                          evidence: "silence-only",
                          confidence: 0.15,
                          reason:
                            "Ứng viên từ khoảng lặng; cần nghe xác nhận nội dung.",
                        })
                      }
                    >
                      {c.start.toFixed(1)}–{c.end.toFixed(1)}s
                    </button>
                  ))}
                </div>
              </details>
              <details className="card transcript-panel">
                <summary>
                  Transcript & đối chiếu · {p.transcript.length} đoạn có
                  timestamp
                </summary>
                <div className="notice">
                  Whisper là tùy chọn chạy CPU/RAM cục bộ. Lần đầu cần tải mô
                  hình; audio dài có thể xử lý lâu hơn thời gian phát. Không
                  dùng API trả phí. Transcript và so khớp từ khóa vẫn cần kiểm
                  tra thủ công.
                </div>
                <div className="transcript-tools">
                  <select
                    aria-label="Mô hình Whisper"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    <option>tiny.en</option>
                    <option>base.en</option>
                    <option>small.en</option>
                  </select>
                  <Button
                    disabled={!canWork || !system?.whisper?.available}
                    onClick={() => void action("transcribe", { model })}
                  >
                    Chạy Whisper cục bộ
                  </Button>
                  <label className="btn btn-outline upload-button">
                    <FileJson size={15} /> Nhập transcript JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) setTranscriptText(await f.text());
                      }}
                    />
                  </label>
                </div>
                <textarea
                  aria-label="Transcript JSON có timestamp"
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder={'[{"start":0,"end":3,"text":"Question one..."}]'}
                />
                <Button
                  variant="outline"
                  disabled={!transcriptText.trim() || pending}
                  onClick={async () => {
                    try {
                      await save();
                      const next = await api<Project>(
                        `/audio/projects/${p.id}/transcript`,
                        {
                          method: "PUT",
                          body: JSON.stringify(JSON.parse(transcriptText)),
                        },
                      );
                      adopt(next);
                      notify(
                        "Đã lưu transcript; chạy Auto Detect để đề xuất lại mapping.",
                      );
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  Lưu transcript đã nhập
                </Button>
                <div className="transcript-text">
                  {p.transcript.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCursor(t.start);
                        update(slot, { start: t.start, end: t.end });
                      }}
                    >
                      <time>
                        {clock(t.start)} – {clock(t.end)}
                      </time>
                      <span>{t.text}</span>
                    </button>
                  ))}
                </div>
                <label>
                  PDF nguồn để xem đối chiếu
                  <select
                    value={pdfId}
                    onChange={(e) => {
                      setPdfId(e.target.value);
                      setDirty(true);
                      dirtyRef.current = true;
                      editVersion.current++;
                    }}
                  >
                    <option value="">Chọn PDF gốc</option>
                    {docs
                      .filter((d) => d.path.endsWith(".pdf"))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
                {pdfId && (
                  <a
                    className="table-link"
                    target="_blank"
                    rel="noreferrer"
                    href={docs.find((d) => d.id === pdfId)?.path}
                  >
                    Mở PDF gốc để đối chiếu <ChevronRight size={14} />
                  </a>
                )}
              </details>
              <div className="card audio-publish">
                <h2>Lưu & xuất bản mapping</h2>
                <label>
                  Bộ đề đích
                  <select
                    aria-label="Bộ đề Listening đích"
                    value={testId || ""}
                    onChange={(e) => {
                      setTestId(e.target.value || null);
                      setDirty(true);
                      dirtyRef.current = true;
                      editVersion.current++;
                    }}
                  >
                    <option value="">Chọn bộ đề có 100 câu Listening</option>
                    {tests
                      .filter((t) => t.section !== "reading")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="notice">
                  <AlertCircle size={17} /> Bản nháp lưu trong SQLite; chỉ 54
                  nhóm đã xác nhận mới được xuất bản. Khi thi, audio gốc phát
                  liên tục để giữ chỉ dẫn và khoảng nghỉ, kể cả những khoảng
                  ngoài đoạn đã chọn.
                </div>
                <div className="publish-buttons">
                  <Button
                    disabled={!v.canPublish || !testId || busy || pending}
                    onClick={() => void action("publish")}
                  >
                    <Check size={16} /> Xuất bản mapping đã xác nhận
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      pending ||
                      !segments.some(
                        (s) =>
                          s.start !== null && s.end !== null && s.end > s.start,
                      )
                    }
                    onClick={() =>
                      void action("export", {
                        slots: segments
                          .filter(
                            (s) =>
                              s.start !== null &&
                              s.end !== null &&
                              s.end > s.start,
                          )
                          .map((s) => s.slot),
                      })
                    }
                  >
                    <Download size={15} /> Export Segments MP3
                  </Button>
                  <a
                    className="btn btn-outline"
                    href={`/api/audio/projects/${p.id}/mapping.json`}
                    onClick={(e) => {
                      if (dirty) {
                        e.preventDefault();
                        void save()
                          .then(() =>
                            window.location.assign(
                              `/api/audio/projects/${p.id}/mapping.json`,
                            ),
                          )
                          .catch(() => {});
                      }
                    }}
                  >
                    Export JSON
                  </a>
                  <label className="btn btn-outline upload-button">
                    Import JSON
                    <input
                      type="file"
                      accept=".json"
                      disabled={busy || pending}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          await save();
                          const next = await api<Project>(
                            `/audio/projects/${p.id}/import-mapping`,
                            {
                              method: "POST",
                              body: JSON.stringify(JSON.parse(await f.text())),
                            },
                          );
                          adopt(next);
                          notify(
                            "Đã nhập mapping. Từng đoạn cần được xác nhận lại.",
                          );
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    />
                  </label>
                </div>
                <p>
                  {p.publishedRevision !== null &&
                  p.publishedRevision !== undefined
                    ? `Bản đã xuất bản: v${p.publishedRevision}${p.publishedRevision !== p.revision ? " · Có thay đổi chưa xuất bản." : ""}`
                    : "Chưa xuất bản. Đề xuất tự động không được dùng để thi."}
                </p>
                {exportJobs.map((j) => (
                  <div className="export-result" key={j.id}>
                    <b>
                      Export · v{j.result.revision} · {j.result.files?.length}{" "}
                      đoạn
                    </b>
                    <a href={j.result.zipUrl} download>
                      Tải ZIP + manifest
                    </a>
                    {j.result.files?.map((f: any) => (
                      <a key={f.url} href={f.url} download>
                        {f.name}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
