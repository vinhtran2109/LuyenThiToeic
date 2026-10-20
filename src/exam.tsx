import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Grid2X2,
  Headphones,
  Check,
  Clock,
  Send,
  X,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { api, clock, parts } from "./lib";
import type { Attempt, Question, Mapping } from "./types";
import { Button } from "./components/ui/button";
import { SourcePages } from "./components/source-pages";
const selected = (n: number, s: string) =>
  s === "all" || (s === "reading" ? n > 100 : n <= 100);
type State = {
  answers: Record<string, string>;
  flags: number[];
  current: number;
  audioIndex: number;
  audioPosition: number;
};
export function Exam() {
  const { id } = useParams(),
    navigate = useNavigate();
  const [a, setA] = useState<Attempt>(),
    [state, setState] = useState<State>({
      answers: {},
      flags: [],
      current: 1,
      audioIndex: 0,
      audioPosition: 0,
    }),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("Đang tải…"),
    [now, setNow] = useState(Date.now()),
    [navigator, setNavigator] = useState(() => window.innerWidth >= 950),
    [submitOpen, setSubmitOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [ratio, setRatio] = useState(52),
    [ready, setReady] = useState(false);
  const latest = useRef(state),
    audio = useRef<HTMLAudioElement>(null),
    saveChain = useRef(Promise.resolve()),
    loaded = useRef(false),
    advancing = useRef(false);
  latest.current = state;
  const audioIndex = state.audioIndex;
  useEffect(() => {
    loaded.current = false;
    api<Attempt>("/attempts/" + id)
      .then((v) => {
        if (v.status === "completed") {
          navigate("/result/" + id, { replace: true });
          return;
        }
        let s = {
          answers: v.answers,
          flags: v.flags,
          current: v.current,
          audioIndex: v.audioIndex,
          audioPosition: v.audioPosition,
        };
        try {
          const local = JSON.parse(
            localStorage.getItem("attempt-" + id) || "null",
          );
          if (local && v.mode === "practice") s = { ...s, ...local };
        } catch {}
        setA(v);
        setState(s);
        loaded.current = true;
        setSaved("Đã khôi phục bài làm");
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  function save(s: State) {
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        try {
          const result = await api<Attempt>("/attempts/" + id, {
            method: "PUT",
            body: JSON.stringify(s),
          });
          if (result.status === "completed") navigate("/result/" + id);
          setA((prev) => ({ ...prev!, ...result, test: prev!.test }));
          setSaved("Đã lưu trên thiết bị");
        } catch (e: any) {
          setSaved("Chưa đồng bộ · bản dự phòng trong trình duyệt");
          setError(e.message);
        }
      });
  }
  useEffect(() => {
    if (!loaded.current) return;
    localStorage.setItem("attempt-" + id, JSON.stringify(state));
    setSaved("Đang lưu…");
    const t = setTimeout(() => save(state), 350);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const flush = () => {
      if (loaded.current)
        fetch("/api/attempts/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(latest.current),
          keepalive: true,
        }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [id]);
  const remaining = a
    ? Math.max(0, (new Date(a.deadline).getTime() - now) / 1000)
    : 0;
  useEffect(() => {
    if (a?.mode === "exam" && a.phase !== "prepared" && remaining <= 0 && !busy)
      void submit();
  }, [remaining, a?.mode]);
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await saveChain.current;
      await api("/attempts/" + id + "/submit", {
        method: "POST",
        body: JSON.stringify(latest.current),
      });
      localStorage.removeItem("attempt-" + id);
      navigate("/result/" + id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  const qs =
      a?.test?.questions?.filter((q) => selected(q.number, a.section)) || [],
    current = qs.find((q) => q.number === state.current) || qs[0],
    maps = a?.test?.mappings || [];
  const mapping =
    a?.mode === "exam"
      ? maps[audioIndex]
      : maps.find(
          (m) =>
            current &&
            m.questionStart <= current.number &&
            m.questionEnd >= current.number,
        );
  function go(n: number) {
    if (!a) return;
    if (
      a.mode === "exam" &&
      current?.number <= 100 &&
      n > 100 &&
      audioIndex < maps.length
    ) {
      setError("Hoàn thành audio Listening trước khi chuyển sang Reading.");
      return;
    }
    if (a.mode === "exam" && current?.number > 100 && n <= 100) {
      setError("Phần Listening đã kết thúc.");
      return;
    }
    if (
      a.mode === "exam" &&
      n <= 100 &&
      mapping &&
      (n < mapping.questionStart || n > mapping.questionEnd)
    ) {
      setError(
        "Trong phần Listening, chỉ chuyển câu trong nhóm audio đang phát.",
      );
      return;
    }
    setState((s) => ({ ...s, current: n }));
  }
  useEffect(() => {
    if (mapping && audio.current) {
      const start =
        a?.mode === "exam"
          ? (mapping.playbackStart ?? mapping.start)
          : mapping.start;
      const end =
        a?.mode === "exam" ? (mapping.playbackEnd ?? mapping.end) : mapping.end;
      if (!(
        a?.mode === "exam" &&
        mapping.continuous &&
        ready &&
        audio.current.currentTime >= start &&
        audio.current.currentTime < end
      ))
        audio.current.currentTime =
          a?.mode === "exam"
            ? Math.max(start, Math.min(state.audioPosition, end))
            : start;
      advancing.current = false;
      if (ready)
        audio.current
          .play()
          .catch(() => setError("Nhấn phát audio để tiếp tục."));
    }
  }, [mapping?.id, ready]);
  function nextAudio(ended = false) {
    if (a?.mode !== "exam" || !mapping || advancing.current) return;
    advancing.current = true;
    if (mapping.continuous) {
      const position = audio.current?.currentTime ?? 0;
      const target = ended
        ? -1
        : maps.findIndex(
            (m) =>
              position >= (m.playbackStart ?? m.start) &&
              position < (m.playbackEnd ?? m.end),
          );
      if (target >= 0) {
        setState((s) => ({
          ...s,
          audioIndex: target,
          audioPosition: position,
          current: maps[target].questionStart,
        }));
        advancing.current = false;
      } else {
        setState((s) => ({
          ...s,
          audioIndex: maps.length,
          audioPosition: 0,
          current: 101,
        }));
      }
      return;
    }
    if (audioIndex + 1 < maps.length) {
      const m = maps[audioIndex + 1];
      setTimeout(
        () => {
          setState((s) => ({
            ...s,
            audioIndex: s.audioIndex + 1,
            audioPosition: m.playbackStart ?? m.start,
            current: m.questionStart,
          }));
        },
        mapping.continuous ? 0 : mapping.gap * 1000,
      );
    } else {
      setState((s) => ({
        ...s,
        audioIndex: maps.length,
        audioPosition: 0,
        current: 101,
      }));
    }
  }
  if (!a || !current)
    return (
      <div className="loading-screen">
        {error || "Đang khôi phục không gian làm bài…"}
        <Link to="/tests">Quay lại bộ đề</Link>
      </div>
    );
  const group = qs.filter((q) => q.groupId === current.groupId),
    answered = Object.keys(state.answers).length;
  return (
    <div className="exam-shell">
      <header className="exam-header">
        <Link to="/tests" className="exam-back" aria-label="Lưu và về bộ đề">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <strong>{a.test?.title}</strong>
          <small>
            {a.mode === "exam"
              ? "Mô phỏng thi nghiêm ngặt"
              : "Chế độ luyện tập"}{" "}
            · {current.number <= 100 ? "Listening" : "Reading"}
          </small>
        </div>
        <div className="exam-header-right">
          <span className="answered-count">
            {answered}/{qs.length} câu
          </span>
          <span className={"timer " + (remaining < 300 ? "urgent" : "")}>
            <Clock size={18} />
            {clock(remaining)}
            {a.mode === "practice" && remaining === 0 && (
              <small>Hết thời gian gợi ý</small>
            )}
          </span>
          <Button
            variant="outline"
            onClick={() => setNavigator(!navigator)}
            aria-label="Bảng câu hỏi"
          >
            <Grid2X2 size={17} />
          </Button>
          <Button onClick={() => setSubmitOpen(true)}>
            <Send size={15} /> Nộp bài
          </Button>
        </div>
      </header>
      <div className="exam-subbar">
        <span>
          Part {current.part} <Chevron /> {parts[current.part - 1]}
        </span>
        <span>
          <Check size={14} />
          {saved}
        </span>
      </div>
      {error && (
        <div className="notice error">
          {error}
          <button
            className="icon-btn"
            onClick={() => setError("")}
            aria-label="Đóng thông báo"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="exam-body">
        <div className="exam-workspace">
          <div className="reading-pane" style={{ flexBasis: ratio + "%" }}>
            <div className="eyebrow">
              {current.part <= 4 ? "LISTENING MATERIAL" : "READING MATERIAL"} ·
              PART {current.part}
            </div>
            <h2>{parts[current.part - 1]}</h2>
            {current.image && !current.sourcePage && (
              <img
                className="question-image"
                src={current.image}
                alt="Minh họa văn phòng mẫu, không phải ảnh đề thi chính thức"
              />
            )}
            {current.part <= 4 ? (
              <>
                <div className="audio-box">
                  <Headphones size={28} />
                  <h3>
                    {mapping
                      ? "Audio cho câu " +
                        mapping.questionStart +
                        "–" +
                        mapping.questionEnd
                      : "Chưa có audio cho nhóm câu này"}
                  </h3>
                  {mapping ? (
                    <>
                      <audio
                        ref={audio}
                        src={mapping.document.path}
                        controls={a.mode === "practice"}
                        onTimeUpdate={() => {
                          const el = audio.current;
                          if (
                            el &&
                            a.mode === "exam" &&
                            Math.abs(el.currentTime - state.audioPosition) >= 2
                          )
                            setState((s) => ({
                              ...s,
                              audioPosition: el.currentTime,
                            }));
                          if (
                            el &&
                            el.currentTime >=
                              (a.mode === "exam"
                                ? (mapping.playbackEnd ?? mapping.end)
                                : mapping.end)
                          ) {
                            if (!(a.mode === "exam" && mapping.continuous))
                              el.pause();
                            nextAudio();
                          }
                        }}
                        onEnded={() => nextAudio(true)}
                        onError={() =>
                          setError(
                            "Không phát được định dạng audio này. Hãy thử MP3 hoặc WAV.",
                          )
                        }
                        onLoadedMetadata={() => {
                          if (audio.current)
                            audio.current.currentTime =
                              a.mode === "exam"
                                ? Math.max(
                                    mapping.playbackStart ?? mapping.start,
                                    state.audioPosition,
                                  )
                                : mapping.start;
                        }}
                      />
                      {a.mode === "practice" ? (
                        <div className="audio-tools">
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (audio.current) {
                                audio.current.currentTime = mapping.start;
                                void audio.current.play();
                              }
                            }}
                          >
                            Nghe lại đoạn
                          </Button>
                          <select
                            aria-label="Tốc độ audio"
                            onChange={(e) => {
                              if (audio.current)
                                audio.current.playbackRate = +e.target.value;
                            }}
                            defaultValue="1"
                          >
                            <option value="0.75">0.75×</option>
                            <option value="1">1×</option>
                            <option value="1.25">1.25×</option>
                          </select>
                        </div>
                      ) : (
                        <Button
                          onClick={async () => {
                            try {
                              if (a.phase === "prepared") {
                                const updated = await api<Attempt>(
                                  "/attempts/" + id + "/begin",
                                  { method: "POST" },
                                );
                                setA({ ...a, ...updated, test: a.test });
                              }
                              setReady(true);
                              audio.current
                                ?.play()
                                .catch(() =>
                                  setError("Không phát được audio."),
                                );
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          {ready
                            ? "Tiếp tục audio"
                            : "Tôi đã sẵn sàng · Bắt đầu audio"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <p>
                      Tải file audio và xác nhận khoảng phát tại Quản lý tài
                      liệu → Audio Mapping. Không có nội dung audio được tự tạo.
                    </p>
                  )}
                </div>
                <div className="notice">
                  Đây là dữ liệu mẫu kiểm thử. Câu Listening chưa có đáp án sẽ
                  không được tính vào tỷ lệ đúng.
                </div>
              </>
            ) : current.sourcePage ? (
              <SourcePages question={current} test={a.test!} />
            ) : (
              <div
                className={
                  "passage " + (current.part >= 6 ? "document-passage" : "")
                }
              >
                {current.passage}
              </div>
            )}
            <div className="pane-bottom">
              TOEIC STUDIO <span>Practice makes progress.</span>
            </div>
          </div>
          <div
            className="split-handle"
            role="separator"
            aria-label="Điều chỉnh chiều rộng"
            aria-orientation="vertical"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setRatio((v) => Math.max(30, v - 5));
              if (e.key === "ArrowRight") setRatio((v) => Math.min(70, v + 5));
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.buttons) {
                const box =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                setRatio(
                  Math.min(
                    70,
                    Math.max(30, ((e.clientX - box.left) / box.width) * 100),
                  ),
                );
              }
            }}
          >
            <span />
          </div>
          <div className="answer-pane">
            {group.map((q) => (
              <div
                className={
                  "question-block " +
                  (q.number === current.number ? "current-block" : "")
                }
                key={q.id}
              >
                <div className="question-title">
                  <span>Câu {q.number}</span>
                  <button
                    className={
                      "flag-btn " +
                      (state.flags.includes(q.number) ? "flagged" : "")
                    }
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        flags: s.flags.includes(q.number)
                          ? s.flags.filter((n) => n !== q.number)
                          : [...s.flags, q.number],
                      }))
                    }
                  >
                    <Flag size={15} />{" "}
                    {state.flags.includes(q.number) ? "Đã đánh dấu" : "Xem lại"}
                  </button>
                </div>
                <h3>{q.prompt}</h3>
                <div className="options">
                  {q.options.map((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    return (
                      <button
                        key={letter}
                        disabled={
                          a.mode === "exam" && current.number <= 100 && !ready
                        }
                        className={
                          "option " +
                          (state.answers[q.number] === letter ? "chosen" : "")
                        }
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            answers: { ...s.answers, [q.number]: letter },
                          }))
                        }
                      >
                        <span>{letter}</span>
                        <div>{opt}</div>
                        {state.answers[q.number] === letter && (
                          <Check size={17} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="question-controls">
              <Button
                variant="outline"
                disabled={qs.indexOf(current) === 0}
                onClick={() => go(qs[qs.indexOf(current) - 1].number)}
              >
                <ArrowLeft size={16} /> Câu trước
              </Button>
              <Button
                disabled={qs.indexOf(current) === qs.length - 1}
                onClick={() => go(qs[qs.indexOf(current) + 1].number)}
              >
                Câu tiếp <ArrowRight size={16} />
              </Button>
            </div>
            <p className="auto-save-note">
              <Check size={13} /> Lựa chọn của bạn được lưu tự động.
            </p>
          </div>
        </div>
        {navigator && (
          <aside className="question-nav">
            <div className="section-title">
              <h3>Bảng câu hỏi</h3>
              <button
                className="icon-btn"
                onClick={() => setNavigator(false)}
                aria-label="Đóng bảng câu hỏi"
              >
                <X size={17} />
              </button>
            </div>
            <div className="nav-legend">
              <span>
                <i className="answered" />
                Đã trả lời
              </span>
              <span>
                <i className="flagged" />
                Xem lại
              </span>
            </div>
            {parts.map((name, i) => {
              const pq = qs.filter((q) => q.part === i + 1);
              return pq.length ? (
                <div className="part-nav" key={name}>
                  <h4>
                    Part {i + 1}
                    <small>
                      {pq.filter((q) => state.answers[q.number]).length}/
                      {pq.length}
                    </small>
                  </h4>
                  <div>
                    {pq.map((q) => (
                      <button
                        key={q.id}
                        aria-label={"Câu " + q.number}
                        className={`${state.answers[q.number] ? "answered " : ""}${state.flags.includes(q.number) ? "flagged " : ""}${state.current === q.number ? "current" : ""}`}
                        onClick={() => go(q.number)}
                      >
                        {q.number}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
          </aside>
        )}
      </div>
      <Dialog.Root open={submitOpen} onOpenChange={setSubmitOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content">
            <Dialog.Title>Nộp bài luyện tập?</Dialog.Title>
            <Dialog.Description>
              Bạn đã trả lời {answered}/{qs.length} câu. Còn{" "}
              {qs.length - answered} câu chưa trả lời và {state.flags.length}{" "}
              câu đánh dấu xem lại.
            </Dialog.Description>
            <p>
              Chỉ các câu có đáp án xác nhận được chấm. Các câu còn lại sẽ ghi
              rõ chưa thể đánh giá.
            </p>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setSubmitOpen(false)}>
                Tiếp tục làm bài
              </Button>
              <Button disabled={busy} onClick={submit}>
                {busy ? "Đang nộp…" : "Xác nhận nộp bài"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
function Chevron() {
  return <span className="muted">/</span>;
}
export function Result() {
  const { id } = useParams();
  const [a, setA] = useState<Attempt>(),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  useEffect(() => {
    api<Attempt>("/attempts/" + id)
      .then(setA)
      .catch((e) => setError(e.message));
  }, [id]);
  if (!a)
    return <div className="loading-screen">{error || "Đang tải kết quả…"}</div>;
  if (a.status !== "completed")
    return (
      <div className="loading-screen">
        <Link to={"/exam/" + id}>
          Bài này chưa hoàn thành. Tiếp tục làm bài
        </Link>
      </div>
    );
  const qs = a.test!.questions!.filter((q) => selected(q.number, a.section));
  return (
    <div className="result-page">
      <Link to="/history" className="back-link">
        <ArrowLeft size={17} /> Lịch sử làm bài
      </Link>
      <div className="result-hero">
        <span className="eyebrow">EVERY PRACTICE COUNTS</span>
        <h1>
          {a.gradable
            ? "Thêm một bước tiến. Làm tốt lắm!"
            : "Đã lưu bài luyện của bạn"}
        </h1>
        <p>
          {a.test?.title} · {a.section === "all" ? "Toàn bộ đề" : a.section}
        </p>
        <div className="result-metrics">
          <div>
            <strong>
              {a.gradable ? `${a.correct}/${a.gradable}` : "Chưa có key"}
            </strong>
            <span>Câu đúng / câu có đáp án</span>
          </div>
          <div>
            <strong>
              {a.gradable
                ? Math.round((a.correct! / a.gradable) * 100) + "%"
                : "—"}
            </strong>
            <span>Độ chính xác</span>
          </div>
          <div>
            <strong>{clock(a.elapsed)}</strong>
            <span>Thời gian làm bài</span>
          </div>
          <div>
            <strong>
              {Object.keys(a.answers).length}/{qs.length}
            </strong>
            <span>Câu đã trả lời</span>
          </div>
        </div>
      </div>
      <div className="notice">
        <AlertCircle size={19} /> Không quy đổi điểm TOEIC khi chưa có bảng quy
        đổi được xác nhận. {qs.filter((q) => !q.confirmed).length} câu chưa có
        đáp án xác nhận không được chấm.
      </div>
      <div className="section-title outside">
        <h2>Xem lại & hiểu sâu hơn</h2>
        <select
          aria-label="Lọc kết quả"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tất cả câu hỏi</option>
          <option value="wrong">Sai / bỏ trống</option>
          <option value="flagged">Đã đánh dấu</option>
        </select>
      </div>
      {qs
        .filter(
          (q) =>
            filter === "all" ||
            (filter === "flagged" && a.flags.includes(q.number)) ||
            (filter === "wrong" &&
              q.confirmed &&
              a.answers[q.number] !== q.answer),
        )
        .map((q) => (
          <div className="card review-question" key={q.id}>
            <div className="question-title">
              <span>
                Part {q.part} · Câu {q.number}
              </span>
              <span
                className={
                  "badge " +
                  (!q.confirmed
                    ? "orange"
                    : a.answers[q.number] === q.answer
                      ? "green"
                      : "red")
                }
              >
                {!q.confirmed
                  ? "Chưa thể chấm"
                  : a.answers[q.number] === q.answer
                    ? "Chính xác"
                    : "Chưa chính xác"}
              </span>
            </div>
            <h3>{q.prompt}</h3>
            {q.sourcePage && q.image && (
              <details className="review-source">
                <summary>Xem câu hỏi gốc · Trang PDF {q.sourcePage}</summary>
                <img
                  loading="lazy"
                  src={q.image}
                  alt={`Câu ${q.number} trong trang gốc ${q.sourcePage}`}
                />
              </details>
            )}
            <div className="review-options">
              {q.options.map((opt, i) => {
                const l = String.fromCharCode(65 + i);
                return (
                  <div
                    key={l}
                    className={
                      q.confirmed && q.answer === l
                        ? "correct"
                        : a.answers[q.number] === l
                          ? "incorrect"
                          : ""
                    }
                  >
                    <b>{l}.</b> {opt}{" "}
                    {a.answers[q.number] === l && <small> · Bạn chọn</small>}
                    {q.confirmed && q.answer === l && <Check size={16} />}
                  </div>
                );
              })}
            </div>
            <p className="explanation">
              {q.explanation || "Chưa có lời giải được xác nhận."}
            </p>
          </div>
        ))}
      <Button asChild>
        <Link to="/tests">
          Chọn bài luyện tiếp theo <ArrowRight size={16} />
        </Link>
      </Button>
    </div>
  );
}
