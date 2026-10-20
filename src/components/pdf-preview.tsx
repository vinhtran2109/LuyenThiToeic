import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPreview({ src }: { src: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(500),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(180, entry.contentRect.width - 24)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPdf(undefined);
    setPage(1);
    setZoom(1);
    setLoading(true);
    setError("");
    let active = true;
    const task = getDocument({
      url: src,
      rangeChunkSize: 1024 * 1024,
      disableAutoFetch: true,
      disableStream: true,
    });
    task.promise
      .then((doc) => {
        if (active) setPdf(doc);
      })
      .catch((e) => {
        if (active) {
          setError("Không mở được PDF: " + e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [src]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true,
      render: RenderTask | undefined;
    setLoading(true);
    setError("");
    pdf
      .getPage(page)
      .then(async (p) => {
        if (!active) return;
        const base = p.getViewport({ scale: 1 });
        const scale = (width / base.width) * zoom;
        const viewport = p.getViewport({ scale });
        const node = canvas.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        node.width = Math.floor(viewport.width * dpr);
        node.height = Math.floor(viewport.height * dpr);
        node.style.width = `${viewport.width}px`;
        node.style.height = `${viewport.height}px`;
        render = p.render({
          canvasContext: node.getContext("2d")!,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        await render.promise;
        if (active) setLoading(false);
        p.cleanup();
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException") {
          setError("Không hiển thị được trang này: " + e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, width, zoom]);
  return (
    <div className="pdf-preview" ref={container}>
      <div className="pdf-toolbar">
        <button
          type="button"
          aria-label="Trang PDF trước"
          disabled={!pdf || page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <label>
          Trang{" "}
          <input
            aria-label="Trang PDF"
            type="number"
            min="1"
            max={pdf?.numPages || 1}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (pdf && Number.isInteger(n) && n >= 1 && n <= pdf.numPages)
                setPage(n);
            }}
          />{" "}
          / {pdf?.numPages || "…"}
        </label>
        <button
          type="button"
          aria-label="Trang PDF tiếp"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((n) => n + 1)}
        >
          <ChevronRight size={17} />
        </button>
        <span className="pdf-toolbar-spacer" />
        <button
          type="button"
          aria-label="Thu nhỏ PDF"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <ZoomOut size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Phóng to PDF"
          disabled={zoom >= 2}
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
        >
          <ZoomIn size={16} />
        </button>
        <a href={src} target="_blank" rel="noreferrer" aria-label="Mở PDF gốc">
          <ExternalLink size={16} />
        </a>
      </div>
      <div className="pdf-canvas-area" aria-busy={loading}>
        {loading && !error && (
          <div className="pdf-loading" role="status">
            Đang hiển thị trang {page}…
          </div>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          aria-label={`Trang ${page} của PDF gốc`}
          style={{ visibility: loading || error ? "hidden" : "visible" }}
        />
      </div>
    </div>
  );
}
