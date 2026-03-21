import { useMemo } from "react";
import { MdLiveTv } from "react-icons/md";
import type { StreamStats } from "../type/dashPlayer";
import { formatBitrateKbps } from "../hooks/useDashPlayer";

interface StreamTelemetryCardProps {
  stats: StreamStats;
  isPlaying: boolean;
}

// Format thoi gian mm:ss
function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StreamTelemetryCard({ stats, isPlaying }: StreamTelemetryCardProps) {
  const telemetryItems = useMemo(() => [
    { label: "RESOLUTION", value: stats.resolutionLabel, accent: false },
    { label: "BITRATE", value: formatBitrateKbps(stats.bitrateKbps), accent: "blue" },
    { label: "THROUGHPUT", value: formatBitrateKbps(stats.avgThroughputKbps), accent: "blue" },
    { label: "BUFFER", value: `${stats.bufferSeconds.toFixed(2)} s`, accent: false },
    { label: "FPS", value: `${stats.fpsLabel}`, accent: false },
    { label: "DROPPED", value: String(stats.droppedFrames), accent: stats.droppedFrames > 0 ? "red" : false },
    { label: "LATENCY", value: `${stats.latencyMs} ms`, accent: stats.latencyMs > 500 ? "red" : false },
    { label: "JITTER", value: `${stats.jitterMs} ms`, accent: stats.jitterMs > 100 ? "red" : false },
    { label: "RTT", value: `${stats.rttMs} ms`, accent: false },
    { label: "DL SPEED", value: formatBitrateKbps(stats.downloadSpeedKbps), accent: false },
    { label: "SEGMENT", value: `${stats.lastSegmentSizeKB.toFixed(1)} KB`, accent: false },
    { label: "DOWNLOADED", value: `${stats.totalDownloadedMB.toFixed(2)} MB`, accent: false },
    { label: "REBUFFER", value: `${stats.rebufferCount}× / ${(stats.rebufferDurationMs / 1000).toFixed(1)}s`, accent: stats.rebufferCount > 0 ? "red" : false },
    { label: "Q.SWITCHES", value: String(stats.qualitySwitchCount), accent: stats.qualitySwitchCount > 5 ? "red" : false },
    { label: "POSITION", value: `${formatTime(stats.currentTime)} / ${formatTime(stats.duration)}`, accent: false },
    { label: "CODEC", value: stats.codecLabel, accent: false },
    { label: "PROTOCOL", value: stats.protocolLabel, accent: "blue" },
    { label: "NETWORK", value: `${stats.connectionType} / ${stats.estimatedBandwidthMbps} Mbps`, accent: false },
  ], [stats]);

  return (
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
                  : accent === "red" ? "text-red-500"
                    : "text-slate-800"
                }`}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
