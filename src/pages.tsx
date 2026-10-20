import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Routes, Route, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Library,
  Headphones,
  BookOpen,
  History,
  ChartNoAxesCombined,
  FolderOpen,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Clock,
  Check,
  ChevronRight,
  Target,
  Flame,
  GraduationCap,
  PanelLeftClose,
  Menu,
  Sparkles,
  Play,
  TrendingUp,
  CheckCircle2,
  MoreHorizontal,
  AudioLines,
} from "lucide-react";
import { api, useUI, date, parts } from "./lib";
import type { Test, Attempt } from "./types";
import { Button } from "./components/ui/button";
import { Documents } from "./documents";
const AudioEditor = lazy(() =>
  import("./audio-editor").then((m) => ({ default: m.AudioEditor })),
);
const nav = [
  ["/", "Tổng quan", LayoutDashboard],
  ["/tests", "Bộ đề TOEIC", Library],
  ["/listening", "Luyện Listening", Headphones],
  ["/reading", "Luyện Reading", BookOpen],
  ["/history", "Lịch sử làm bài", History],
  ["/stats", "Thống kê kết quả", ChartNoAxesCombined],
  ["/documents", "Quản lý tài liệu", FolderOpen],
  ["/admin/audio-editor", "Audio Studio", AudioLines],
  ["/settings", "Cài đặt", Settings],
] as const;
export function App() {
  const [mobile, setMobile] = useState(false);
  const { toast } = useUI();
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Headphones size={23} />
          </span>
          <div>
            TOEIC<span>STUDIO</span>
          </div>
        </Link>
        <div className="workspace-label">KHÔNG GIAN HỌC TẬP</div>
        <nav>
          {nav.map(([url, label, Icon], i) => (
            <NavLink
              end={url === "/"}
              to={url}
              key={url}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `${isActive ? "active " : ""}${i === 6 ? "nav-separator" : ""}`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="status-dot" /> Đang chạy trên localhost
            <small>Dữ liệu được lưu trên thiết bị của bạn</small>
          </div>
          <div className="profile">
            <span className="avatar">B</span>
            <div>
              {localStorage.getItem("toeic-name") || "Bạn học TOEIC"}
              <small>Tài khoản cá nhân</small>
            </div>
            <Settings size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Mở menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Không gian học tập <ChevronRight size={14} />{" "}
            <strong>TOEIC Listening & Reading</strong>
          </span>
          <div className="top-right">
            <span className="local-pill">
              <span className="status-dot" /> Local workspace
            </span>
            <span className="avatar small">B</span>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tests" element={<Tests />} />
            <Route path="/listening" element={<Tests section="listening" />} />
            <Route path="/reading" element={<Tests section="reading" />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/documents" element={<Documents />} />
            <Route
              path="/admin/audio-editor"
              element={
                <Suspense fallback={<p>Đang mở Audio Studio…</p>}>
                  <AudioEditor />
                </Suspense>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  Không tìm thấy trang. <Link to="/">Về tổng quan</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer>
          TOEIC Studio <span>Học có mục tiêu. Tiến bộ mỗi ngày.</span>
          <span>Không gian luyện thi cá nhân · Localhost</span>
        </footer>
      </div>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
export function useData() {
  const [tests, setTests] = useState<Test[]>([]),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Test[]>("/tests"), api<Attempt[]>("/attempts")])
      .then(([t, a]) => {
        setTests(t);
        setAttempts(a);
      })
      .catch((e) => setError(e.message));
  }, []);
  return { tests, attempts, error };
}
function PageHead({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Metrics({ attempts }: { attempts: Attempt[] }) {
  const done = attempts.filter((a) => a.status === "completed"),
    answers = done.reduce((n, a) => n + Object.keys(a.answers).length, 0),
    correct = done.reduce((n, a) => n + (a.correct || 0), 0),
    gradable = done.reduce((n, a) => n + (a.gradable || 0), 0);
  return (
    <div className="metrics">
      {[
        {
          label: "Bài luyện đã hoàn thành",
          value: String(done.length).padStart(2, "0"),
          unit: "bài",
          icon: CheckCircle2,
          note: "Mỗi bài luyện là một bước tiến",
          color: "green",
        },
        {
          label: "Tổng số câu đã luyện",
          value: answers.toLocaleString(),
          unit: "câu",
          icon: BookOpen,
          note: "Tích lũy kiến thức từng ngày",
          color: "blue",
        },
        {
          label: "Tỷ lệ trả lời đúng",
          value: gradable ? Math.round((correct / gradable) * 100) + "%" : "—",
          unit: "",
          icon: Target,
          note: gradable
            ? `${correct} / ${gradable} câu có đáp án`
            : "Bắt đầu để theo dõi độ chính xác",
          color: "orange",
        },
        {
          label: "Điểm TOEIC gần nhất",
          value: "—",
          unit: "/ 990",
          icon: TrendingUp,
          note: "Chưa có bảng quy đổi được xác nhận",
          color: "purple",
        },
      ].map((m) => (
        <div className="metric card" key={m.label}>
          <div className="metric-top">
            {m.label}
            <span className={"metric-icon " + m.color}>
              <m.icon size={18} />
            </span>
          </div>
          <div className="metric-value">
            {m.value}
            <small>{m.unit}</small>
          </div>
          <small>{m.note}</small>
        </div>
      ))}
    </div>
  );
}
function ProgressChart({ attempts }: { attempts: Attempt[] }) {
  const done = attempts
    .filter((a) => a.status === "completed" && a.gradable)
    .slice(0, 12)
    .reverse();
  return (
    <div className="card chart-card">
      <div className="section-title">
        <div>
          <h2>Hành trình tiến bộ</h2>
          <p>Mỗi lần luyện tập, một phiên bản tốt hơn.</p>
        </div>
        <span className="subtle-tag">Độ chính xác (%)</span>
      </div>
      <div className="chart">
        <div className="axis-labels">
          {[100, 75, 50, 25, 0].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div className="chart-area">
          <div className="grid-lines">
            {[0, 1, 2, 3, 4].map((n) => (
              <i key={n} />
            ))}
          </div>
          {done.length > 0 ? (
            <svg
              viewBox="0 0 600 150"
              preserveAspectRatio="none"
              aria-label="Biểu đồ tỷ lệ đúng"
            >
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#537d66" stopOpacity=".24" />
                  <stop offset="100%" stopColor="#537d66" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`M 0 150 ${done.map((a, i) => `L ${done.length === 1 ? 300 : (i * 600) / (done.length - 1)} ${150 - ((a.correct || 0) / a.gradable!) * 145}`).join(" ")} L 600 150 Z`}
                fill="url(#chartFill)"
              />
              <polyline
                points={done
                  .map(
                    (a, i) =>
                      `${done.length === 1 ? 300 : (i * 600) / (done.length - 1)},${150 - ((a.correct || 0) / a.gradable!) * 145}`,
                  )
                  .join(" ")}
                stroke="#527b63"
                fill="none"
                strokeWidth="3"
              />
              {done.map((a, i) => (
                <circle
                  key={a.id}
                  cx={done.length === 1 ? 300 : (i * 600) / (done.length - 1)}
                  cy={150 - ((a.correct || 0) / a.gradable!) * 145}
                  r="4"
                  fill="#527b63"
                />
              ))}
            </svg>
          ) : (
            <div className="chart-empty">
              <ChartNoAxesCombined size={25} />
              <b>Tiến bộ bắt đầu từ bài luyện đầu tiên</b>
              <span>Kết quả thật của bạn sẽ xuất hiện ở đây.</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-bottom">
        <span>
          <i /> Tỷ lệ trả lời đúng
        </span>
        <span>
          {done.length
            ? `${done.length} bài gần nhất`
            : "Chưa có dữ liệu luyện tập"}
        </span>
      </div>
    </div>
  );
}
function Dashboard() {
  const { tests, attempts, error } = useData();
  const active = attempts.find((a) => a.status === "active");
  return (
    <>
      <PageHead
        eyebrow="YOUR LEARNING JOURNEY"
        title="Sẵn sàng cho một bước tiến mới?"
        subtitle="Chào mừng trở lại. Dành một chút thời gian hôm nay cho mục tiêu TOEIC của bạn."
      >
        <span className="date-chip">
          {new Date().toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </span>
      </PageHead>
      {error && <p className="notice error">{error}</p>}
      <div className="hero">
        <div className="hero-copy">
          <div className="hero-label">
            <span /> TẬP TRUNG HÔM NAY, TỰ TIN NGÀY MAI
          </div>
          <h2>
            Mục tiêu lớn.
            <br />
            Bắt đầu từ <em>một bài luyện.</em>
          </h2>
          <p>
            Không gian luyện thi Listening & Reading của riêng bạn.
            <br />
            Luyện tập chủ động, theo dõi tiến bộ và chinh phục mục tiêu.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to={active ? `/exam/${active.id}` : "/tests"}>
                {active ? "Tiếp tục bài đang làm" : "Bắt đầu luyện tập"}
                <ArrowRight size={17} />
              </Link>
            </Button>
            <Link className="hero-link" to="/documents">
              Thêm đề của bạn <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="hero-meta">
            <span>
              <Check size={14} /> 7 Parts chuẩn cấu trúc
            </span>
            <span>
              <Check size={14} /> Tự động lưu bài làm
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="floating-star star-one">✧</span>
          <span className="floating-star star-two">✦</span>
          <div className="art-chip">
            <span>
              <TrendingUp size={18} />
            </span>
            BETTER EVERY DAY
          </div>
          <div className="art-headphones">
            <Headphones strokeWidth={1.1} />
          </div>
          <div className="art-note">
            <span className="note-icon">
              <BookOpen size={24} />
            </span>
            <div>
              One step closer.<small>Your TOEIC journey starts here</small>
            </div>
            <span className="note-check">
              <Check size={18} />
            </span>
          </div>
        </div>
      </div>
      <Metrics attempts={attempts} />
      <div className="dashboard-mid">
        <ProgressChart attempts={attempts} />
        <div className="card goal-card">
          <div className="section-title">
            <h2>Mục tiêu của bạn</h2>
            <Target size={18} />
          </div>
          <div className="goal-circle">
            <div>
              <strong>{localStorage.getItem("toeic-goal") || "850"}</strong>
              <span>ĐIỂM TOEIC</span>
            </div>
          </div>
          <p>
            Kiên trì một chút mỗi ngày,
            <br />
            bạn sẽ tiến xa hơn bạn nghĩ.
          </p>
          <Link to="/settings">
            Điều chỉnh mục tiêu <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div className="section-title outside">
        <div>
          <h2>Chọn một bài luyện hôm nay</h2>
          <p>Xây nền tảng vững chắc, từng kỹ năng một.</p>
        </div>
        <Link to="/tests">
          Xem tất cả bộ đề <ArrowRight size={16} />
        </Link>
      </div>
      <div className="practice-grid">
        <PracticeTile type="listening" />
        <PracticeTile type="reading" />
      </div>
      <div className="card recent-card">
        <div className="section-title">
          <div>
            <h2>Hoạt động gần đây</h2>
            <p>Tiếp nối hành trình của bạn.</p>
          </div>
          <Link to="/history">
            Xem lịch sử <ArrowRight size={15} />
          </Link>
        </div>
        <AttemptTable attempts={attempts.slice(0, 4)} tests={tests} />
      </div>
      <p className="sample-foot">
        <Sparkles size={14} /> Bộ đề Studio là dữ liệu mẫu kiểm thử. Đề từ PDF
        của bạn giữ nguyên nội dung tài liệu nguồn.
      </p>
    </>
  );
}
function PracticeTile({ type }: { type: "listening" | "reading" }) {
  const listening = type === "listening",
    Icon = listening ? Headphones : BookOpen;
  return (
    <Link className={"practice-tile " + type} to={"/" + type}>
      <span className="practice-icon">
        <Icon size={27} />
      </span>
      <div>
        <span className="eyebrow">
          {listening ? "LISTEN & UNDERSTAND" : "READ & DISCOVER"}
        </span>
        <h3>Luyện {listening ? "Listening" : "Reading"}</h3>
        <p>
          {listening
            ? "Rèn khả năng nghe hiểu, làm chủ từng cuộc hội thoại."
            : "Củng cố ngữ pháp, tăng tốc đọc hiểu mỗi ngày."}
        </p>
        <div className="tile-meta">
          {listening ? "Part 1 – 4" : "Part 5 – 7"} <span>·</span> 100 câu hỏi{" "}
          <span>·</span> {listening ? "45" : "75"} phút
        </div>
      </div>
      <span className="round-arrow">
        <ArrowUpRight size={19} />
      </span>
    </Link>
  );
}
function Tests({ section = "all" }: { section?: string }) {
  const { tests, error } = useData();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [year, setYear] = useState("all"),
    [collection, setCollection] = useState("all");
  const navigate = useNavigate(),
    notify = useUI((s) => s.notify);
  const [busy, setBusy] = useState(false);
  async function start(t: Test, mode: string) {
    setBusy(true);
    try {
      const a = await api<Attempt>("/attempts", {
        method: "POST",
        body: JSON.stringify({
          testId: t.id,
          mode,
          section:
            t.section === "reading"
              ? "reading"
              : mode === "exam"
                ? "all"
                : section,
        }),
      });
      navigate("/exam/" + a.id);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="PRACTICE LIBRARY"
        title={
          section === "all"
            ? "Bộ đề TOEIC"
            : `Luyện ${section === "reading" ? "Reading" : "Listening"}`
        }
        subtitle="Chọn bộ đề, giữ nhịp luyện tập và tiến gần hơn đến mục tiêu của bạn."
      >
        <Button asChild variant="outline">
          <Link to="/documents">
            <Plus size={17} /> Thêm tài liệu
          </Link>
        </Button>
      </PageHead>
      <div className="notice">
        <Sparkles size={18} />
        <span>
          <b>
            {tests.filter((t) => t.sourceDocumentId).length} đề từ PDF của bạn.
          </b>{" "}
          {
            tests.filter(
              (t) => t.sourceDocumentId && t.keyCounts?.reading === 100,
            ).length
          }{" "}
          đề Reading đã đủ 100 đáp án để chấm bài. Bản scan giữ nguyên nội dung
          gốc. Bộ đề Studio là dữ liệu mẫu kiểm thử.
        </span>
      </div>
      <div className="filters">
        <label className="search-input">
          <Search size={18} />
          <input
            placeholder="Tìm kiếm bộ đề…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Bộ đề"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
        >
          <option value="all">Tất cả bộ đề</option>
          {[...new Set(tests.map((t) => t.collection))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Năm"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="all">Tất cả năm</option>
          {[...new Set(tests.map((t) => t.year))].map((y) => (
            <option key={y} value={y}>
              {y || "Không rõ năm"}
            </option>
          ))}
        </select>
        <select
          aria-label="Trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="new">Chưa làm</option>
          <option value="active">Đang làm</option>
          <option value="completed">Hoàn thành</option>
        </select>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="test-grid">
        {tests
          .filter(
            (t) =>
              (section !== "listening" || t.section !== "reading") &&
              t.title.toLowerCase().includes(q.toLowerCase()) &&
              (year === "all" || t.year === Number(year)) &&
              (collection === "all" || t.collection === collection) &&
              (status === "all" ||
                status ===
                  (t.attempts.some((a) => a.status === "active")
                    ? "active"
                    : t.attempts.length
                      ? "completed"
                      : "new")),
          )
          .map((t, i) => {
            const active = t.attempts.find((a) => a.status === "active"),
              done = t.attempts.find((a) => a.status === "completed");
            return (
              <article className="card test-card" key={t.id}>
                <div className={"test-cover cover-" + (i % 3)}>
                  <span>
                    {t.sourceDocumentId ? "YOUR PDF" : "STUDIO"}
                    <br />
                    <b>TOEIC</b>
                    <small>
                      {t.section === "reading"
                        ? "READING · PART 5–7"
                        : "LISTENING & READING"}
                    </small>
                  </span>
                  <strong>
                    {String(
                      Number(t.title.match(/Test\s*(\d+)/i)?.[1] || i + 1),
                    ).padStart(2, "0")}
                  </strong>
                  <div className="cover-lines" />
                </div>
                <div className="test-content">
                  <div className="test-tags">
                    <span className="subtle-tag">
                      {t.sourceDocumentId
                        ? "TỪ PDF · READING"
                        : `ĐỀ MẪU · ${t.year}`}
                    </span>
                    <span
                      className={
                        "badge " + (active ? "orange" : done ? "green" : "")
                      }
                    >
                      {active ? "Đang làm" : done ? "Hoàn thành" : "Chưa làm"}
                    </span>
                  </div>
                  <h2>{t.title}</h2>
                  {t.sourceDocumentId && (
                    <span
                      className={
                        "badge " +
                        (t.keyCounts?.reading === 100 ? "green" : "orange")
                      }
                    >
                      {t.keyCounts?.reading || 0}/100 đáp án ·{" "}
                      {t.keyCounts?.reading === 100
                        ? "Sẵn sàng chấm bài"
                        : "Chưa đủ đáp án"}
                    </span>
                  )}
                  <p>{t.description}</p>
                  <div className="test-meta">
                    <span>
                      <BookOpen size={15} />{" "}
                      {t.section === "reading"
                        ? 100
                        : section === "all"
                          ? t._count?.questions || 200
                          : "100"}{" "}
                      câu
                    </span>
                    <span>
                      <Clock size={15} />{" "}
                      {t.section === "reading" || section === "reading"
                        ? "75"
                        : section === "listening"
                          ? "45"
                          : "120"}{" "}
                      phút
                    </span>
                  </div>
                  {done && (
                    <small>
                      Gần nhất: {date(done.completedAt!)} · Đúng {done.correct}/
                      {done.gradable} câu xác nhận
                    </small>
                  )}
                  <div className="test-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        active
                          ? navigate("/exam/" + active.id)
                          : start(t, "practice")
                      }
                    >
                      <Play size={15} />
                      {active ? "Tiếp tục" : "Luyện tập"}
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => start(t, "exam")}
                    >
                      Thi thử
                    </Button>
                    {done && (
                      <Link to={"/result/" + done.id} aria-label="Xem kết quả">
                        <ArrowUpRight size={19} />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
      </div>
    </>
  );
}
function AttemptTable({
  attempts,
  tests = [],
}: {
  attempts: Attempt[];
  tests?: Test[];
}) {
  return attempts.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>BỘ ĐỀ</th>
            <th>NGÀY LÀM</th>
            <th>KẾT QUẢ</th>
            <th>TRẠNG THÁI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              <td>
                <strong>
                  {a.test?.title || tests.find((t) => t.id === a.testId)?.title}
                </strong>
                <small>
                  {a.section === "all" ? "Listening & Reading" : a.section} ·{" "}
                  {a.mode === "exam" ? "Thi thử" : "Luyện tập"}
                </small>
              </td>
              <td>{date(a.startedAt)}</td>
              <td>
                {a.status === "completed"
                  ? `${a.correct} / ${a.gradable} câu`
                  : `${Object.keys(a.answers).length} câu đã trả lời`}
              </td>
              <td>
                <span
                  className={
                    "badge " + (a.status === "completed" ? "green" : "orange")
                  }
                >
                  {a.status === "completed" ? "Hoàn thành" : "Đang làm"}
                </span>
              </td>
              <td>
                <Link
                  className="table-link"
                  to={`/${a.status === "completed" ? "result" : "exam"}/${a.id}`}
                >
                  {a.status === "completed" ? "Xem kết quả" : "Tiếp tục"}
                  <ArrowRight size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      <span className="empty-icon">
        <History size={24} />
      </span>
      <h3>Hành trình của bạn bắt đầu ở đây</h3>
      <p>Hoàn thành bài luyện đầu tiên để lưu lại kết quả.</p>
      <Link to="/tests">
        Khám phá bộ đề <ArrowRight size={15} />
      </Link>
    </div>
  );
}
function HistoryPage() {
  const { attempts, error } = useData();
  return (
    <>
      <PageHead
        eyebrow="YOUR ACTIVITY"
        title="Lịch sử làm bài"
        subtitle="Mỗi lần luyện tập đều được lưu lại. Tiếp tục hoặc xem lại bất kỳ lúc nào."
      />
      {error && <p>{error}</p>}
      <div className="card recent-card">
        <AttemptTable attempts={attempts} />
      </div>
    </>
  );
}
function Stats() {
  const { attempts } = useData();
  const done = attempts.filter((a) => a.status === "completed");
  return (
    <>
      <PageHead
        eyebrow="LEARNING INSIGHTS"
        title="Nhìn lại để tiến xa hơn"
        subtitle="Thống kê từ bài làm thực tế của bạn, chỉ tính các câu có đáp án xác nhận."
      />
      <Metrics attempts={attempts} />
      <ProgressChart attempts={attempts} />
      <div className="card stats-details">
        <h2>Tổng kết luyện tập</h2>
        <p>
          Điểm cao nhất:{" "}
          {done.some((a) => a.score)
            ? Math.max(...done.map((a) => a.score || 0))
            : "Chưa có điểm quy đổi"}
        </p>
        <p>
          Điểm trung bình:{" "}
          {done.some((a) => a.score)
            ? Math.round(
                done.reduce((n, a) => n + (a.score || 0), 0) /
                  done.filter((a) => a.score).length,
              )
            : "Chưa có điểm quy đổi"}
        </p>
        <p>
          Thời gian luyện tập:{" "}
          {Math.round(done.reduce((n, a) => n + a.elapsed, 0) / 60)} phút
        </p>
        <div className="notice">
          Chưa có bảng quy đổi TOEIC được xác nhận. Ứng dụng báo số câu đúng và
          tỷ lệ chính xác, không suy đoán điểm 10–990.
        </div>
      </div>
    </>
  );
}
function SettingsPage() {
  const [goal, setGoal] = useState(localStorage.getItem("toeic-goal") || "850"),
    [name, setName] = useState(
      localStorage.getItem("toeic-name") || "Bạn học TOEIC",
    );
  const notify = useUI((s) => s.notify);
  return (
    <>
      <PageHead
        eyebrow="MAKE IT YOURS"
        title="Cài đặt không gian học tập"
        subtitle="Một mục tiêu rõ ràng giúp mỗi buổi học có ý nghĩa hơn."
      />
      <form
        className="card settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          localStorage.setItem("toeic-goal", goal);
          localStorage.setItem("toeic-name", name);
          notify("Đã lưu cài đặt trên thiết bị.");
        }}
      >
        <h2>Hồ sơ & mục tiêu</h2>
        <label>
          Tên hiển thị
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Mục tiêu TOEIC
          <input
            type="number"
            min="10"
            max="990"
            step="5"
            required
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <Button type="submit">
          Lưu thay đổi <Check size={16} />
        </Button>
        <hr />
        <h2>Lưu trữ cục bộ</h2>
        <p>
          Bài làm, câu hỏi và tài liệu được lưu trong SQLite và thư mục uploads.
          Cài đặt cá nhân lưu trong trình duyệt này.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              const a = await api("/attempts");
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(a, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "toeic-history.json";
              link.click();
              URL.revokeObjectURL(url);
            } catch (e: any) {
              notify(e.message);
            }
          }}
        >
          Xuất lịch sử (JSON)
        </Button>
      </form>
    </>
  );
}
