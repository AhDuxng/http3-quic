// VideoPlayer.tsx - Component chinh hien thi DASH player va cac panel dieu khien.
// Bo cuc doc: [Video | Sidebar] phia tren, [Stream Telemetry card] phia duoi.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { FaPlay, FaWifi, FaSearch, FaDownload, FaNetworkWired, FaTerminal, FaEllipsisV, FaCog } from "react-icons/fa";
import { MdLiveTv, MdHighQuality } from "react-icons/md";
import { NETWORK_SCENARIOS, SCENARIO_ICONS } from "../constants/networkScenarios";
import { useDashPlayer } from "../hooks/useDashPlayer";
import { formatBitrateKbps } from "../hooks/useDashPlayer";
import type { LogLevel } from "../type/dashPlayer";

// Props component
interface VideoPlayerProps {
  manifestUrl: string;
}

// Handle de App.jsx goi reset tu ben ngoai qua ref
export interface VideoPlayerHandle {
  reset: () => void;
}

// Map mau va label hien thi cho tung cap do log
const LOG_LEVEL_STYLE: Record<LogLevel, { color: string; bg: string; label: string }> = {
  INFO: { color: "text-emerald-600", bg: "bg-emerald-50",  label: "INFO" },
  WARN: { color: "text-amber-600",   bg: "bg-amber-50",    label: "WARN" },
  ERRO: { color: "text-red-600",     bg: "bg-red-50",      label: "ERRO" },
  NET:  { color: "text-blue-600",    bg: "bg-blue-50",     label: "NET"  },
  SYS:  { color: "text-slate-500",   bg: "bg-slate-100",   label: "SYS"  },
};

// Format thoi gian mm:ss
function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ manifestUrl }, ref) => {
    const {
      videoRef, representations, isPlaying, stats,
      activeScenarioId, qualitySelection, isAutoQuality,
      logs, applyScenario, setQualitySelection, togglePlayPause, resetStats,
    } = useDashPlayer({ manifestUrl, scenarios: NETWORK_SCENARIOS });

    // Expose resetStats cho parent (App.jsx) qua ref
    useImperativeHandle(ref, () => ({ reset: resetStats }), [resetStats]);

    // UI-only state: bo loc log, che do man hinh
    const [logFilter, setLogFilter] = useState("");
    const [isManualMode, setIsManualMode] = useState(false);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const qualityMenuRef = useRef<HTMLDivElement>(null);

    // Dong menu khi click ra ngoai
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target as Node)) {
          setShowQualityMenu(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Tim kich ban dang active de hien thi label
    const activeScenario = useMemo(
      () => NETWORK_SCENARIOS.find((s) => s.id === activeScenarioId) ?? NETWORK_SCENARIOS[0],
      [activeScenarioId],
    );

    // Profile hien thi trong overlay video
    const profileLabel = isAutoQuality
      ? "Auto"
      : representations[qualitySelection as number]?.height
        ? `${representations[qualitySelection as number].height}p`
        : "Manual";

    // Loc log theo tu khoa nguoi dung nhap
    const filteredLogs = useMemo(() => {
      if (!logFilter.trim()) return logs;
      const kw = logFilter.toLowerCase();
      return logs.filter(
        (l) => l.message.toLowerCase().includes(kw) || l.level.toLowerCase().includes(kw),
      );
    }, [logs, logFilter]);

    // Tao CSV log xuat day du thong so do dac
    const generateFullLogCSV = () => {
      const header = [
        "Timestamp",
        "Level",
        "Message",
        "Resolution",
        "Bitrate_kbps",
        "Throughput_kbps",
        "Buffer_s",
        "FPS",
        "DroppedFrames",
        "TotalFrames",
        "Latency_ms",
        "DownloadSpeed_kbps",
        "SegmentSize_KB",
        "SegmentDuration_ms",
        "CurrentTime_s",
        "Duration_s",
        "Codec",
        "QualityIndex",
        "QualityCount",
        "Protocol",
        "IsAutoQuality",
        "ActiveScenario",
      ].join(",");

      const rows = filteredLogs.map((l) =>
        [
          l.timestamp,
          l.level,
          `"${l.message.replace(/"/g, '""')}"`,
          stats.resolutionLabel,
          stats.bitrateKbps,
          stats.avgThroughputKbps,
          stats.bufferSeconds.toFixed(2),
          stats.fpsLabel,
          stats.droppedFrames,
          stats.totalFrames,
          stats.latencyMs,
          stats.downloadSpeedKbps,
          stats.lastSegmentSizeKB,
          stats.lastSegmentDurationMs,
          stats.currentTime.toFixed(2),
          stats.duration.toFixed(2),
          stats.codecLabel,
          stats.qualityIndex,
          stats.qualityCount,
          stats.protocolLabel,
          isAutoQuality,
          activeScenario.label,
        ].join(","),
      );

      return `${header}\n${rows.join("\n")}`;
    };

    // Tao plain-text log chi tiet
    const generateDetailedLog = () => {
      const separator = "═".repeat(70);
      const sections = [
        separator,
        `  ADTUBE STREAM ANALYZER - MEASUREMENT LOG`,
        `  Generated: ${new Date().toISOString()}`,
        separator,
        "",
        "── CURRENT STREAM STATS ──",
        `  Resolution:        ${stats.resolutionLabel}`,
        `  Bitrate:           ${formatBitrateKbps(stats.bitrateKbps)}`,
        `  Throughput:        ${formatBitrateKbps(stats.avgThroughputKbps)}`,
        `  Buffer:            ${stats.bufferSeconds.toFixed(2)} s`,
        `  FPS:               ${stats.fpsLabel}`,
        `  Dropped Frames:    ${stats.droppedFrames}`,
        `  Total Frames:      ${stats.totalFrames}`,
        `  Protocol:          ${stats.protocolLabel}`,
        `  Codec:             ${stats.codecLabel}`,
        `  Quality Level:     ${stats.qualityIndex + 1} / ${stats.qualityCount}`,
        `  Latency:           ${stats.latencyMs} ms`,
        `  Download Speed:    ${formatBitrateKbps(stats.downloadSpeedKbps)}`,
        `  Last Segment Size: ${stats.lastSegmentSizeKB.toFixed(1)} KB`,
        `  Last Seg Duration: ${stats.lastSegmentDurationMs} ms`,
        `  Playback Position: ${formatTime(stats.currentTime)} / ${formatTime(stats.duration)}`,
        `  Quality Mode:      ${isAutoQuality ? "Auto ABR" : "Manual"}`,
        `  Network Scenario:  ${activeScenario.label} (${activeScenario.speedLabel})`,
        "",
        "── AVAILABLE QUALITY LEVELS ──",
        ...representations.map((rep, i) => {
          const kbps = typeof rep.bitrateInKbit === "number"
            ? rep.bitrateInKbit
            : Math.round((rep.bandwidth ?? 0) / 1000);
          const res = rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
          return `  [${i}] ${res} @ ${formatBitrateKbps(kbps)}`;
        }),
        "",
        "── EVENT LOG ──",
        ...filteredLogs.map((l) => `  [${l.timestamp}] [${l.level}] ${l.message}`),
        "",
        separator,
      ];
      return sections.join("\n");
    };

    const telemetryItems = useMemo(() => [
      { label: "RESOLUTION",      value: stats.resolutionLabel,                              accent: false },
      { label: "BITRATE",         value: formatBitrateKbps(stats.bitrateKbps),               accent: "blue" },
      { label: "THROUGHPUT",      value: formatBitrateKbps(stats.avgThroughputKbps),         accent: "blue" },
      { label: "BUFFER",          value: `${stats.bufferSeconds.toFixed(2)} s`,              accent: false },
      { label: "FPS",             value: `${stats.fpsLabel}`,                                accent: false },
      { label: "DROPPED",         value: String(stats.droppedFrames),                        accent: stats.droppedFrames > 0 ? "red" : false },
      { label: "LATENCY",         value: `${stats.latencyMs} ms`,                           accent: stats.latencyMs > 500 ? "red" : false },
      { label: "DL SPEED",        value: formatBitrateKbps(stats.downloadSpeedKbps),         accent: false },
      { label: "SEGMENT",         value: `${stats.lastSegmentSizeKB.toFixed(1)} KB`,         accent: false },
      { label: "POSITION",        value: `${formatTime(stats.currentTime)} / ${formatTime(stats.duration)}`, accent: false },
      { label: "CODEC",           value: stats.codecLabel,                                   accent: false },
      { label: "PROTOCOL",        value: stats.protocolLabel,                                accent: "blue" },
    ], [stats]);

    return (
      <div className="flex flex-col gap-4 w-full">

        {/* ===== HANG TREN: Video + Sidebar ===== */}
        <div className="flex flex-col lg:flex-row gap-4 w-full">

        {/* COT TRAI: Video */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Khu vuc video den */}
          <div className="relative bg-black rounded-lg overflow-hidden w-full group">
            <video
              ref={videoRef}
              className="w-full h-auto aspect-video cursor-pointer object-contain"
              controls
              controlsList="nodownload"
              onClick={togglePlayPause}
            />

            {/* Badge giao thuc - goc tren trai */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
              <FaWifi className="text-blue-400 w-3 h-3" />
              <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
                HTTP/3 (QUIC)
              </span>
            </div>

            {/* Stats overlay - goc tren phai */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
              <span className="text-green-400 text-[11px] font-mono font-semibold">
                {stats.resolutionLabel} @ {formatBitrateKbps(stats.bitrateKbps)}
              </span>
            </div>

            {/* Overlay play khi video dang pause */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label="Play video"
                className="absolute inset-0 flex items-center justify-center bg-black/20"
              >
                <span className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                  <FaPlay className="w-5 h-5 text-gray-800 ml-0.5" />
                </span>
              </button>
            )}

            {/* Overlay thong tin stream - phia duoi */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none">
              <div className="flex items-end justify-between">
                <span className="text-white text-xs font-mono opacity-90">
                  Stream: {manifestUrl.split("/").pop() ?? "stream.mpd"}
                </span>
                <span className="text-blue-300 text-xs font-medium">
                  {profileLabel} | Buffer: {stats.bufferSeconds.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Nut 3 cham canh nut phong to - Quality Menu */}
            <div ref={qualityMenuRef} className="absolute bottom-12 right-2" style={{ zIndex: 40 }}>
              <button
                type="button"
                onClick={() => setShowQualityMenu((v) => !v)}
                className="w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
                aria-label="Video settings"
              >
                <FaCog className="w-3.5 h-3.5 text-white" />
              </button>

              {/* Quality dropdown menu */}
              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden pointer-events-auto">
                  {/* Header */}
                  <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                    <MdHighQuality className="text-blue-400 w-4 h-4" />
                    <span className="text-white text-xs font-semibold tracking-wider">QUALITY</span>
                  </div>

                  {/* Auto option */}
                  <button
                    type="button"
                    onClick={() => {
                      setQualitySelection("auto");
                      setShowQualityMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                      isAutoQuality
                        ? "bg-blue-600/30 text-blue-300"
                        : "text-gray-300 hover:bg-gray-800/80"
                    }`}
                  >
                    <span className="text-sm">Auto</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {formatBitrateKbps(stats.avgThroughputKbps)}
                    </span>
                    {isAutoQuality && (
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full ml-1" />
                    )}
                  </button>

                  {/* Quality levels */}
                  <div className="max-h-48 overflow-y-auto">
                    {[...representations].reverse().map((rep, _revIdx) => {
                      const originalIdx = representations.length - 1 - _revIdx;
                      const kbps = typeof rep.bitrateInKbit === "number"
                        ? rep.bitrateInKbit
                        : Math.round((rep.bandwidth ?? 0) / 1000);
                      const isSelected = !isAutoQuality && qualitySelection === originalIdx;
                      return (
                        <button
                          key={originalIdx}
                          type="button"
                          onClick={() => {
                            setQualitySelection(originalIdx);
                            setShowQualityMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? "bg-blue-600/30 text-blue-300"
                              : "text-gray-300 hover:bg-gray-800/80"
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {rep.height ? `${rep.height}p` : "—"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-mono">
                              {formatBitrateKbps(kbps)}
                            </span>
                            {isSelected && (
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* END COT TRAI */}


        {/* COT PHAI: Sidebar */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">

          {/* --- Panel: Network Simulation --- */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FaNetworkWired className="text-slate-400 w-3 h-3" />
                <span className="text-[11px] font-bold tracking-widest text-slate-600">
                  NETWORK SIMULATION
                </span>
              </div>
              {/* Toggle giua Auto (scenario) va Manual (quality dropdown) */}
              <button
                onClick={() => setIsManualMode((v) => !v)}
                className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
              >
                {isManualMode ? "AUTO MODE" : "MANUAL CONTROL"}
              </button>
            </div>

            {isManualMode ? (
              /* Che do Manual: chon chat luong thu cong */
              <div className="p-3">
                <select
                  value={qualitySelection}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQualitySelection(v === "auto" ? "auto" : Number.parseInt(v, 10));
                  }}
                  className="w-full text-sm border border-slate-200 rounded px-2.5 py-2 outline-none focus:border-blue-400"
                >
                  <option value="auto">Auto ABR ({formatBitrateKbps(stats.bitrateKbps)})</option>
                  {representations.map((rep, i) => (
                    <option key={i} value={i}>
                      {rep.height ? `${rep.height}p` : "—"} — {formatBitrateKbps(
                        typeof rep.bitrateInKbit === "number"
                          ? rep.bitrateInKbit
                          : Math.round((rep.bandwidth ?? 0) / 1000)
                      )}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Mode:{" "}
                  <span className={isAutoQuality ? "text-emerald-500" : "text-blue-500"}>
                    {isAutoQuality ? "Auto ABR" : "Manual"}
                  </span>
                </p>
              </div>
            ) : (
              /* Che do Auto: danh sach kich ban mang */
              <div className="divide-y divide-slate-50">
                {NETWORK_SCENARIOS.map((scenario) => {
                  const Icon    = SCENARIO_ICONS[scenario.id];
                  const isActive = activeScenarioId === scenario.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => applyScenario(scenario)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-500" : "text-slate-400"}`} />
                      <span className={`flex-1 text-sm ${isActive ? "text-blue-700 font-semibold" : "text-slate-700"}`}>
                        {scenario.label}
                        {isActive && activeScenario?.maxBitrateKbps == null && (
                          <span className="ml-1 text-[10px] text-emerald-500 font-normal">(Default)</span>
                        )}
                      </span>
                      <span className={`text-[11px] font-mono ${isActive ? "text-blue-500 font-semibold" : "text-slate-400"}`}>
                        {scenario.speedLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* --- Panel: Console Logs --- */}
          <div className="bg-white rounded-lg border border-slate-200 flex flex-col h-[360px] shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <FaTerminal className="text-slate-400 w-3 h-3" />
                <span className="text-[11px] font-bold tracking-widest text-slate-600">
                  CONSOLE LOGS
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ({filteredLogs.length})
                </span>
              </div>
              {/* Nut tai xuong log */}
              <div className="flex items-center gap-2">
                {/* Download CSV */}
                <button
                  onClick={() => {
                    if (filteredLogs.length === 0) return;
                    const csv = generateFullLogCSV();
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `adtube-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  title="Download metrics CSV"
                  className="text-slate-300 hover:text-emerald-500 transition-colors"
                >
                  <span className="text-[9px] font-bold">CSV</span>
                </button>
                {/* Download TXT */}
                <button
                  onClick={() => {
                    if (filteredLogs.length === 0) return;
                    const textContent = generateDetailedLog();
                    const blob = new Blob([textContent], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `adtube-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  title="Download detailed logs"
                  className="text-slate-300 hover:text-blue-500 transition-colors"
                >
                  <FaDownload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Danh sach log - cuon doc */}
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-50">
              {filteredLogs.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-6">No logs yet.</p>
              ) : (
                filteredLogs.map((log) => {
                  const style = LOG_LEVEL_STYLE[log.level];
                  return (
                    <div key={log.id} className="flex gap-2 px-3 py-2 hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <span className="text-slate-400 text-[10px] font-mono whitespace-nowrap pt-0.5">
                        {log.timestamp}
                      </span>
                      {/* Badge cap do */}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 h-fit ${style.color} ${style.bg}`}>
                        {style.label}
                      </span>
                      {/* Noi dung log */}
                      <span className="text-slate-600 text-[11px] leading-relaxed break-words min-w-0">
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Thanh loc log */}
            <div className="shrink-0 px-3 py-2 border-t border-slate-100">
              <div className="flex items-center gap-2 bg-slate-50 rounded px-2.5 py-1.5">
                <FaSearch className="text-slate-300 w-3 h-3 shrink-0" />
                <input
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  placeholder="Filter session logs..."
                  className="bg-transparent text-[11px] text-slate-600 placeholder-slate-300 w-full outline-none"
                />
              </div>
            </div>
          </div>
        </div>
        </div>
        {/* END HANG TREN */}


        {/* ===== CARD TELEMETRY - fullwidth phia duoi ===== */}
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          {/* Tieu de card */}
          <div className="bg-slate-700 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MdLiveTv className="text-slate-300 w-3.5 h-3.5" />
              <span className="text-slate-200 text-[11px] font-bold tracking-widest">
                STREAM TELEMETRY
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              <span className="text-slate-400 text-[10px]">REAL-TIME DATA FEED</span>
            </div>
          </div>

          {/* Hang thong so stats - scroll ngang khi khong du rong */}
          <div className="overflow-x-auto">
            <div className="grid grid-flow-col auto-cols-[7.5rem] divide-x divide-slate-100 w-max min-w-full">
              {telemetryItems.map(({ label, value, accent }) => (
                <div key={label} className="px-4 py-3">
                  <div className="text-[9px] text-slate-400 font-semibold tracking-widest mb-1">
                    {label}
                  </div>
                  <div className={`text-sm font-bold font-mono ${
                    accent === "blue" ? "text-blue-600"
                    : accent === "red"  ? "text-red-500"
                    : "text-slate-800"
                  }`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
