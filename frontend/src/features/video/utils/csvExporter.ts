import type { LogEntry, StreamStats } from "../type/dashPlayer";
import { formatBitrateKbps, formatTime } from "./formatters";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}

export function generateLogsCsv(logs: LogEntry[]): string {
  return buildCsv(
    ["Timestamp", "Stream", "Level", "Message", "Protocol", "NetworkType", "IsAutoQuality", "ActiveScenario"],
    logs.map((log) => [
      log.timestamp,
      log.streamTitle,
      log.level,
      log.message,
      log.statsSnapshot.protocolLabel,
      log.statsSnapshot.networkType,
      log.isAutoQuality,
      log.activeScenarioLabel,
    ]),
  );
}

export function generateQosCsv(logs: LogEntry[]): string {
  return buildCsv(
    [
      "Timestamp", "Stream", "Protocol", "NetworkType",
      "AvgThroughput_kbps", "DownloadSpeed_kbps", "Goodput_kbps",
      "TTFB_ms", "SegmentDownloadTime_ms", "Jitter_ms",
      "OverheadRatio", "ConnectionSetup_ms", "DNS_ms", "TCP_ms", "TLS_ms",
      "LossProxyRate", "FragmentRequests", "FailedFragments", "AbandonedFragments",
      "Buffer_s",
    ],
    logs.map((log) => {
      const stats = log.statsSnapshot;
      return [
        log.timestamp,
        log.streamTitle,
        stats.protocolLabel,
        stats.networkType,
        stats.avgThroughputKbps.toFixed(2),
        stats.downloadSpeedKbps.toFixed(2),
        stats.goodputKbps.toFixed(2),
        stats.ttfbMs.toFixed(2),
        stats.lastSegmentDurationMs,
        stats.jitterMs.toFixed(2),
        stats.overheadRatio.toFixed(4),
        stats.connectionSetupMs.toFixed(2),
        stats.dnsMs.toFixed(2),
        stats.tcpMs.toFixed(2),
        stats.tlsMs.toFixed(2),
        stats.lossProxyRate.toFixed(4),
        stats.fragmentRequestCount,
        stats.failedFragmentRequestCount,
        stats.abandonedFragmentRequestCount,
        stats.bufferSeconds.toFixed(2),
      ];
    }),
  );
}

export function generateQoeCsv(logs: LogEntry[]): string {
  return buildCsv(
    [
      "Timestamp", "Stream", "Bitrate_kbps", "AverageBitrate_kbps", "Resolution",
      "FPS", "DroppedFrames", "FrozenFrames", "StartupDelay_ms",
      "StallCount", "StallDuration_ms", "RebufferingRatio",
      "QualitySwitchCount", "QualityUpSwitchCount", "QualityDownSwitchCount",
      "CurrentTime_s", "Duration_s", "IsAutoQuality", "ActiveScenario",
    ],
    logs.map((log) => {
      const stats = log.statsSnapshot;
      return [
        log.timestamp,
        log.streamTitle,
        stats.bitrateKbps,
        stats.averageBitrateKbps.toFixed(2),
        stats.resolutionLabel,
        stats.fps.toFixed(1),
        stats.droppedFrames,
        stats.frozenFrameCount,
        stats.startupDelayMs,
        stats.stallCount,
        stats.stallDurationMs,
        stats.rebufferingRatio.toFixed(4),
        stats.qualitySwitchCount,
        stats.qualityUpSwitchCount,
        stats.qualityDownSwitchCount,
        stats.currentTime.toFixed(2),
        stats.duration.toFixed(2),
        log.isAutoQuality,
        log.activeScenarioLabel,
      ];
    }),
  );
}

export function generateCSV(logs: LogEntry[]): string {
  return generateLogsCsv(logs);
}

interface DetailedLogParams {
  stats: StreamStats;
  isAutoQuality: boolean;
  scenarioLabel: string;
  scenarioSpeed: string;
  representations: Array<{ width?: number; height?: number; bitrateInKbit?: number; bandwidth?: number }>;
  logs: LogEntry[];
  streamTitle: string;
}

export function generateDetailedLog(params: DetailedLogParams): string {
  const separator = "=".repeat(70);
  const sections = [
    separator,
    "  ADTUBE STREAM ANALYZER - MEASUREMENT LOG",
    `  Stream: ${params.streamTitle}`,
    `  Generated: ${new Date().toISOString()}`,
    separator,
    "",
    "-- STREAM STATS --",
    `  Resolution:        ${params.stats.resolutionLabel}`,
    `  Bitrate:           ${formatBitrateKbps(params.stats.bitrateKbps)}`,
    `  Average Bitrate:   ${formatBitrateKbps(params.stats.averageBitrateKbps)}`,
    `  Throughput:        ${formatBitrateKbps(params.stats.avgThroughputKbps)}`,
    `  Goodput:           ${formatBitrateKbps(params.stats.goodputKbps)}`,
    `  Buffer:            ${params.stats.bufferSeconds.toFixed(2)} s`,
    `  FPS:               ${params.stats.fps.toFixed(1)}`,
    `  Dropped Frames:    ${params.stats.droppedFrames}`,
    `  Frozen Frames:     ${params.stats.frozenFrameCount}`,
    `  Protocol:          ${params.stats.protocolLabel}`,
    "",
    "-- NETWORK METRICS --",
    `  TTFB:              ${params.stats.ttfbMs.toFixed(2)} ms`,
    `  Jitter (SDT):      ${params.stats.jitterMs.toFixed(2)} ms`,
    `  Segment DL Time:   ${params.stats.lastSegmentDurationMs} ms`,
    `  Download Speed:    ${formatBitrateKbps(params.stats.downloadSpeedKbps)}`,
    `  Overhead Ratio:    ${(params.stats.overheadRatio * 100).toFixed(2)}%`,
    `  Setup/DNS/TCP/TLS: ${params.stats.connectionSetupMs.toFixed(2)} / ${params.stats.dnsMs.toFixed(2)} / ${params.stats.tcpMs.toFixed(2)} / ${params.stats.tlsMs.toFixed(2)} ms`,
    `  Loss Proxy:        ${(params.stats.lossProxyRate * 100).toFixed(2)}%`,
    "",
    "-- PLAYBACK STABILITY --",
    `  Startup Delay:     ${params.stats.startupDelayMs || 0} ms`,
    `  Stall Count:       ${params.stats.stallCount}`,
    `  Stall Duration:    ${(params.stats.stallDurationMs / 1000).toFixed(3)} s`,
    `  Rebuffering Ratio: ${(params.stats.rebufferingRatio * 100).toFixed(2)}%`,
    `  Quality Switches:  ${params.stats.qualitySwitchCount} (${params.stats.qualityUpSwitchCount} up / ${params.stats.qualityDownSwitchCount} down)`,
    `  Playback:          ${formatTime(params.stats.currentTime)} / ${formatTime(params.stats.duration)}`,
    `  Quality Mode:      ${params.isAutoQuality ? "Auto ABR" : "Manual"}`,
    `  Scenario:          ${params.scenarioLabel} (${params.scenarioSpeed})`,
    `  Network Type:      ${params.stats.networkType}`,
    "",
    "-- QUALITY LEVELS --",
    ...params.representations.map((representation, index) => {
      const kbps = typeof representation.bitrateInKbit === "number"
        ? representation.bitrateInKbit
        : Math.round((representation.bandwidth ?? 0) / 1000);
      const resolution = representation.width && representation.height ? `${representation.width}x${representation.height}` : "-";
      return `  [${index}] ${resolution} @ ${formatBitrateKbps(kbps)}`;
    }),
    "",
    "-- EVENT LOG --",
    ...params.logs.map(
      (log) => `  [${log.timestamp}] [${log.level}] [${log.statsSnapshot.protocolLabel}] ${log.message}`,
    ),
    "",
    separator,
  ];
  return sections.join("\n");
}
