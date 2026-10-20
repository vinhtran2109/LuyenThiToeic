import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";
import type { DraftSegment } from "../../server/audio-domain";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
export function AudioWaveform({
  url,
  peaksPath,
  duration,
  segments,
  slot,
  zoom,
  initialCursor,
  onCursor,
  onRange,
  onSelect,
  previewSignal,
}: {
  url: string;
  peaksPath: string;
  duration: number;
  segments: DraftSegment[];
  slot: number;
  zoom: number;
  initialCursor: number;
  onCursor: (n: number) => void;
  onRange: (slot: number, start: number, end: number) => void;
  onSelect: (slot: number) => void;
  previewSignal: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    wsRef = useRef<WaveSurfer | undefined>(undefined),
    regionsRef = useRef<ReturnType<typeof Regions.create> | undefined>(
      undefined,
    ),
    previewEnd = useRef<number | null>(null),
    changing = useRef(false),
    callbacks = useRef({ onCursor, onRange, onSelect });
  callbacks.current = { onCursor, onRange, onSelect };
  const [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const selected = segments.find((s) => s.slot === slot);
  useEffect(() => {
    if (!host.current) return;
    setReady(false);
    setError("");
    const abort = new AbortController();
    const regions = Regions.create();
    const ws = WaveSurfer.create({
      container: host.current,
      height: 150,
      waveColor: "#a0b39b",
      progressColor: "#426d56",
      cursorColor: "#c39555",
      barWidth: 2,
      barGap: 1,
      normalize: true,
      mediaControls: false,
      dragToSeek: true,
      minPxPerSec: zoom,
      plugins: [regions, Timeline.create()],
    });
    wsRef.current = ws;
    regionsRef.current = regions;
    let last = 0;
    ws.on("ready", () => {
      setReady(true);
      ws.setTime(Math.min(initialCursor, duration));
    });
    ws.on("error", (e) => setError(e.message));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => {
      setPlaying(false);
      previewEnd.current = null;
    });
    ws.on("timeupdate", (t) => {
      if (previewEnd.current !== null && t >= previewEnd.current) {
        ws.pause();
        previewEnd.current = null;
      }
      if (Date.now() - last > 180) {
        last = Date.now();
        callbacks.current.onCursor(t);
      }
    });
    regions.on("region-clicked", (r, e) => {
      e.stopPropagation();
      callbacks.current.onSelect(Number(r.id));
    });
    regions.on("region-updated", (r) => {
      if (!changing.current)
        callbacks.current.onRange(
          Number(r.id),
          Math.round(r.start * 1000) / 1000,
          Math.round(r.end * 1000) / 1000,
        );
    });
    fetch(peaksPath, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("Không tải được waveform.");
        return r.json();
      })
      .then((peaks) => {
        if (!abort.signal.aborted) return ws.load(url, peaks, duration);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      abort.abort();
      ws.destroy();
      wsRef.current = undefined;
      regionsRef.current = undefined;
    };
  }, [url, peaksPath, duration]);
  useEffect(() => {
    if (ready) wsRef.current?.zoom(zoom);
  }, [zoom, ready]);
  useEffect(() => {
    const plugin = regionsRef.current;
    if (!ready || !plugin) return;
    changing.current = true;
    plugin.clearRegions();
    for (const s of segments)
      if (s.start !== null && s.end !== null && s.end > s.start)
        plugin.addRegion({
          id: String(s.slot),
          start: s.start,
          end: s.end,
          drag: true,
          resize: true,
          minLength: 0.05,
          content: `${s.questionStart}${s.questionEnd !== s.questionStart ? "–" + s.questionEnd : ""}`,
          color:
            s.slot === slot
              ? "#bf9c554d"
              : s.confirmed
                ? "#52836535"
                : "#7794af22",
        });
    changing.current = false;
  }, [segments, slot, ready]);
  useEffect(() => {
    if (
      previewSignal &&
      ready &&
      selected?.start !== null &&
      selected?.end !== null &&
      selected
    ) {
      previewEnd.current = selected.end;
      void wsRef.current
        ?.play(selected.start, selected.end)
        .catch((e) => setError(e.message));
    }
  }, [previewSignal]);
  return (
    <>
      <div
        className="waveform-host"
        ref={host}
        aria-label="Waveform audio có thể kéo điểm đầu và cuối"
      />
      {error && <p className="notice error">{error}</p>}
      <div className="wave-player-controls">
        <Button
          variant="outline"
          disabled={!ready}
          onClick={() => {
            previewEnd.current = null;
            void wsRef.current?.playPause().catch((e) => setError(e.message));
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
          {playing ? "Pause" : "Play"}
        </Button>
        <button
          className="icon-btn"
          aria-label="Về đầu audio"
          onClick={() => {
            previewEnd.current = null;
            wsRef.current?.setTime(0);
            callbacks.current.onCursor(0);
          }}
        >
          <RotateCcw size={16} />
        </button>
        <label>
          Tốc độ
          <select
            aria-label="Tốc độ nghe thử"
            defaultValue="1"
            onChange={(e) => wsRef.current?.setPlaybackRate(+e.target.value)}
          >
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
          </select>
        </label>
        <label>
          Âm lượng
          <input
            aria-label="Âm lượng audio"
            type="range"
            min="0"
            max="1"
            step="0.05"
            defaultValue="1"
            onChange={(e) => wsRef.current?.setVolume(+e.target.value)}
          />
        </label>
        {!ready && <small>Đang tải dữ liệu waveform…</small>}
      </div>
    </>
  );
}
