import { useState, useMemo } from "react";
import { FaTerminal, FaDownload, FaSearch } from "react-icons/fa";
import type { LogEntry, LogLevel, StreamStats } from "../type/dashPlayer";
import type { NetworkScenario } from "../../../type/video";
import { formatBitrateKbps } from "../hooks/useDashPlayer";

interface ConsoleLogsPanelProps {
  logs: LogEntry[];
  stats: StreamStats;
  representations: any[];
  isAutoQuality: boolean;
  activeScenario: NetworkScenario;
}

const LOG_LEVEL_STYLE: Record<LogLevel, { color: string; bg: string; label: string }> = {
  INFO: { color: "text-emerald-600", bg: "bg-emerald-50", label: "INFO" },
  WARN: { color: "text-amber-600", bg: "bg-amber-50", label: "WARN" },
  ERRO: { color: "text-red-600", bg: "bg-red-50", label: "ERRO" },
  NET: { color: "text-blue-600", bg: "bg-blue-50", label: "NET" },
  SYS: { color: "text-slate-500", bg: "bg-slate-100", label: "SYS" },
};

function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ConsoleLogsPanel({
  logs,
  stats,
  representations,
  isAutoQuality,
  activeScenario
}: ConsoleLogsPanelProps) {
  const [logFilter, setLogFilter] = useState("");

  const filteredLogs = useMemo(() => {
    if (!logFilter.trim()) return logs;
    const kw = logFilter.toLowerCase();
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(kw)
        || l.level.toLowerCase().includes(kw)
        || l.statsSnapshot.protocolLabel.toLowerCase().includes(kw),
    );
  }, [logs, logFilter]);

  /**
   * Generate CSV with academically correct column names.
   *
   * Column naming conventions follow adaptive streaming QoE literature:
   *   SDT = Segment Download Time
   *   TTFB = Time To First Byte
   *   Stall = buffer depletion event (BUFFER_EMPTY)
   *   Rebuffer = HTML5 waiting event
   */
  const generateFullLogCSV = () => {
    const header = [
      "Timestamp", "Level", "Message", "Resolution", "Bitrate_kbps",
      "Throughput_kbps", "Buffer_s", "FPS", "DroppedFrames", "TotalFrames",
      "TTFB_ms", "Jitter_ms", "SegmentDownloadTime_ms", "DownloadSpeed_kbps",
      "SegmentSize_KB", "TotalDownloaded_MB",
      "StallCount", "StallDuration_ms",
      "RebufferCount", "RebufferDuration_ms", "RebufferingRatio",
      "QualitySwitchCount",
      "CurrentTime_s", "Duration_s", "Codec", "QualityIndex",
      "QualityCount", "Protocol", "ConnectionType",
      "EstimatedBandwidth_Mbps", "IsAutoQuality", "ActiveScenario",
    ].join(",");

    const rows = filteredLogs.map((l) => {
      const snap = l.statsSnapshot;
      return [
        l.timestamp, l.level, `"${l.message.replace(/"/g, '""')}"`,
        snap.resolutionLabel, snap.bitrateKbps, snap.avgThroughputKbps,
        snap.bufferSeconds.toFixed(2), snap.fpsLabel, snap.droppedFrames,
        snap.totalFrames, snap.ttfbMs.toFixed(2), snap.jitterMs.toFixed(2),
        snap.lastSegmentDurationMs, snap.downloadSpeedKbps.toFixed(2),
        snap.lastSegmentSizeKB.toFixed(1), snap.totalDownloadedMB.toFixed(2),
        snap.stallCount, snap.stallDurationMs,
        snap.rebufferCount, snap.rebufferDurationMs,
        snap.rebufferingRatio.toFixed(4),
        snap.qualitySwitchCount,
        snap.currentTime.toFixed(2), snap.duration.toFixed(2),
        snap.codecLabel, snap.qualityIndex, snap.qualityCount,
        snap.protocolLabel, snap.connectionType, snap.estimatedBandwidthMbps,
        l.isAutoQuality, l.activeScenarioLabel,
      ].join(",");
    });

    return `${header}\n${rows.join("\n")}`;
  };

  const generateDetailedLog = () => {
    const separator = "═".repeat(70);
    const sections = [
      separator,
      `  ADTUBE STREAM ANALYZER - MEASUREMENT LOG`,
      `  Generated: ${new Date().toISOString()}`,
      separator,
      "",
      "── CURRENT STREAM STATS ──",
      `  Resolution:          ${stats.resolutionLabel}`,
      `  Bitrate:             ${formatBitrateKbps(stats.bitrateKbps)}`,
      `  Throughput:          ${formatBitrateKbps(stats.avgThroughputKbps)}`,
      `  Buffer Occupancy:    ${stats.bufferSeconds.toFixed(2)} s`,
      `  FPS:                 ${stats.fpsLabel}`,
      `  Dropped Frames:      ${stats.droppedFrames}`,
      `  Total Frames:        ${stats.totalFrames}`,
      `  Protocol:            ${stats.protocolLabel}`,
      `  Codec:               ${stats.codecLabel}`,
      `  Quality Level:       ${stats.qualityIndex + 1} / ${stats.qualityCount}`,
      "",
      "── NETWORK METRICS ──",
      `  TTFB:                ${stats.ttfbMs.toFixed(2)} ms`,
      `  Jitter (SDT):        ${stats.jitterMs.toFixed(2)} ms`,
      `  Segment DL Time:     ${stats.lastSegmentDurationMs} ms`,
      `  Download Speed:      ${formatBitrateKbps(stats.downloadSpeedKbps)}`,
      `  Last Segment Size:   ${stats.lastSegmentSizeKB.toFixed(1)} KB`,
      `  Total Downloaded:    ${stats.totalDownloadedMB.toFixed(2)} MB`,
      "",
      "── PLAYBACK STABILITY ──",
      `  Stall Count:         ${stats.stallCount} (BUFFER_EMPTY events)`,
      `  Stall Duration:      ${(stats.stallDurationMs / 1000).toFixed(3)} s`,
      `  Rebuffer Count:      ${stats.rebufferCount} (waiting events)`,
      `  Rebuffer Duration:   ${(stats.rebufferDurationMs / 1000).toFixed(3)} s`,
      `  Rebuffering Ratio:   ${(stats.rebufferingRatio * 100).toFixed(2)}%`,
      `  Quality Switches:    ${stats.qualitySwitchCount}`,
      `  Playback Position:   ${formatTime(stats.currentTime)} / ${formatTime(stats.duration)}`,
      `  Quality Mode:        ${isAutoQuality ? "Auto ABR" : "Manual"}`,
      `  Network Scenario:    ${activeScenario.label} (${activeScenario.speedLabel})`,
      `  Connection Type:     ${stats.connectionType}`,
      `  Est. Bandwidth:      ${stats.estimatedBandwidthMbps} Mbps`,
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
      ...filteredLogs.map(
        (l) => `  [${l.timestamp}] [${l.level}] [${l.statsSnapshot.protocolLabel}] ${l.message}`,
      ),
      "",
      separator,
    ];
    return sections.join("\n");
  };

  return (
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
        <div className="flex items-center gap-2">
          {/* Download CSV */}
          <button
            onClick={() => {
              if (filteredLogs.length === 0) return;
              const csv = generateFullLogCSV();
              const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
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

      {/* Log list - vertical scroll */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-50">
        {filteredLogs.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">No logs yet.</p>
        ) : (
          filteredLogs.map((log) => {
            const style = LOG_LEVEL_STYLE[log.level];
            return (
              <div key={log.id} className="grid grid-cols-[64px_44px_96px_minmax(0,1fr)] gap-2 px-3 py-2 hover:bg-slate-50 transition-colors items-start">
                <span className="text-slate-400 text-[10px] font-mono whitespace-nowrap pt-0.5">
                  {log.timestamp}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 h-fit ${style.color} ${style.bg}`}>
                  {style.label}
                </span>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 whitespace-nowrap"
                  title="Network protocol"
                >
                  {log.statsSnapshot.protocolLabel}
                </span>
                <span className="text-slate-600 text-[11px] leading-relaxed break-words min-w-0">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Log filter bar */}
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
  );
}
