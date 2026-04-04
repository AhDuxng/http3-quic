// csvExporter.ts — Tao noi dung CSV va TXT tu log entries

import type { LogEntry, StreamStats } from "../type/dashPlayer";
import { formatBitrateKbps, formatTime } from "./formatters";

// Thu tu cot CSV chuan cho paper 
const CSV_HEADER = [
  "Timestamp", "Level", "Message", "Protocol", "NetworkType",
  "Bitrate_kbps", "Resolution", "Throughput_kbps", "Buffer_s", "FPS",
  "TTFB_ms", "SDT_ms", "Jitter_ms", "DownloadSpeed_kbps",
  "StallCount", "StallDuration_ms", "RebufferingRatio",
  "DroppedFrames", "QualitySwitchCount",
  "CurrentTime_s", "Duration_s", "IsAutoQuality", "ActiveScenario",
].join(",");

// Tao CSV tu danh sach log entries
export function generateCSV(logs: LogEntry[]): string {
  const rows = logs.map((l) => {
    const s = l.statsSnapshot;
    return [
      l.timestamp, l.level, `"${l.message.replace(/"/g, '""')}"`,
      s.protocolLabel, s.networkType,
      s.bitrateKbps, s.resolutionLabel, s.avgThroughputKbps,
      s.bufferSeconds.toFixed(2), s.fps.toFixed(1),
      s.ttfbMs.toFixed(2), s.lastSegmentDurationMs, s.jitterMs.toFixed(2),
      s.downloadSpeedKbps.toFixed(2),
      s.stallCount, s.stallDurationMs, s.rebufferingRatio.toFixed(4),
      s.droppedFrames, s.qualitySwitchCount,
      s.currentTime.toFixed(2), s.duration.toFixed(2),
      l.isAutoQuality, l.activeScenarioLabel,
    ].join(",");
  });
  return `${CSV_HEADER}\n${rows.join("\n")}`;
}

// Thong tin chi tiet cau hinh phien do
interface DetailedLogParams {
  stats: StreamStats;
  isAutoQuality: boolean;
  scenarioLabel: string;
  scenarioSpeed: string;
  representations: Array<{ width?: number; height?: number; bitrateInKbit?: number; bandwidth?: number }>;
  logs: LogEntry[];
}

// Tao bao cao TXT chi tiet
export function generateDetailedLog(p: DetailedLogParams): string {
  const sep = "═".repeat(70);
  const sections = [
    sep,
    "  ADTUBE STREAM ANALYZER — MEASUREMENT LOG",
    `  Generated: ${new Date().toISOString()}`,
    sep,
    "",
    "── STREAM STATS ──",
    `  Resolution:        ${p.stats.resolutionLabel}`,
    `  Bitrate:           ${formatBitrateKbps(p.stats.bitrateKbps)}`,
    `  Throughput:        ${formatBitrateKbps(p.stats.avgThroughputKbps)}`,
    `  Buffer:            ${p.stats.bufferSeconds.toFixed(2)} s`,
    `  FPS:               ${p.stats.fps.toFixed(1)}`,
    `  Dropped Frames:    ${p.stats.droppedFrames}`,
    `  Protocol:          ${p.stats.protocolLabel}`,
    "",
    "── NETWORK METRICS ──",
    `  TTFB:              ${p.stats.ttfbMs.toFixed(2)} ms`,
    `  Jitter (SDT):      ${p.stats.jitterMs.toFixed(2)} ms`,
    `  Segment DL Time:   ${p.stats.lastSegmentDurationMs} ms`,
    `  Download Speed:    ${formatBitrateKbps(p.stats.downloadSpeedKbps)}`,
    "",
    "── PLAYBACK STABILITY ──",
    `  Stall Count:       ${p.stats.stallCount}`,
    `  Stall Duration:    ${(p.stats.stallDurationMs / 1000).toFixed(3)} s`,
    `  Rebuffering Ratio: ${(p.stats.rebufferingRatio * 100).toFixed(2)}%`,
    `  Quality Switches:  ${p.stats.qualitySwitchCount}`,
    `  Playback:          ${formatTime(p.stats.currentTime)} / ${formatTime(p.stats.duration)}`,
    `  Quality Mode:      ${p.isAutoQuality ? "Auto ABR" : "Manual"}`,
    `  Scenario:          ${p.scenarioLabel} (${p.scenarioSpeed})`,
    `  Network Type:      ${p.stats.networkType}`,
    "",
    "── QUALITY LEVELS ──",
    ...p.representations.map((rep, i) => {
      const kbps = typeof rep.bitrateInKbit === "number"
        ? rep.bitrateInKbit
        : Math.round((rep.bandwidth ?? 0) / 1000);
      const res = rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
      return `  [${i}] ${res} @ ${formatBitrateKbps(kbps)}`;
    }),
    "",
    "── EVENT LOG ──",
    ...p.logs.map(
      (l) => `  [${l.timestamp}] [${l.level}] [${l.statsSnapshot.protocolLabel}] ${l.message}`,
    ),
    "", sep,
  ];
  return sections.join("\n");
}
