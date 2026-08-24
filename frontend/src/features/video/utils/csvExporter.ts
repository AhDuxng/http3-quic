import type {
  LogEntry,
  PlaybackQoeSample,
  SegmentQosRecord,
  StreamStats,
} from "../type/dashPlayer";
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
    ["EventId", "Replay", "TimestampUTC", "Stream", "Segment", "Level", "Message", "Protocol", "NetworkType", "IsAutoQuality", "ActiveScenario"],
    logs.map((log) => [
      log.id,
      log.replay,
      log.timestamp,
      log.streamTitle,
      log.segmentLabel,
      log.level,
      log.message,
      log.statsSnapshot.protocolLabel,
      log.statsSnapshot.networkType,
      log.isAutoQuality,
      log.activeScenarioLabel,
    ]),
  );
}

export function generateQosCsv(records: SegmentQosRecord[]): string {
  return buildCsv(
    [
      "RequestRecordId", "Replay", "TimestampUTC", "Stream", "Segment", "QoSScope",
      "MediaType", "RequestType", "RepresentationId", "QualityIndex",
      "Status", "HTTPStatus", "URL", "Protocol", "NetworkType",
      "BytesLoaded", "EncodedBodySize_bytes", "TransferSize_bytes",
      "ResourceTimingSizeDelta_bytes", "DownloadTime_ms", "DownloadSpeed_kbps",
      "EncodedPayloadRate_kbps", "TTFB_ms", "SegmentDownloadTimeVariation_ms",
      "ConnectionSetup_ms", "DNS_ms", "Connect_ms", "SecureHandshake_ms",
    ],
    records.map((record) => [
      record.id,
      record.replay,
      record.timestamp,
      record.streamTitle,
      record.segmentLabel,
      "video-media-only",
      record.mediaType,
      record.requestType,
      record.representationId ?? "",
      record.qualityIndex ?? "",
      record.status,
      record.responseStatus || "",
      record.url,
      record.protocolLabel,
      record.networkType,
      record.bytesLoaded,
      record.encodedBodySizeBytes,
      record.transferSizeBytes,
      record.resourceTimingSizeDeltaBytes,
      record.downloadTimeMs,
      record.downloadSpeedKbps.toFixed(2),
      record.payloadRateKbps.toFixed(2),
      record.ttfbMs.toFixed(2),
      record.segmentDownloadTimeVariationMs.toFixed(2),
      record.connectionSetupMs.toFixed(2),
      record.dnsMs.toFixed(2),
      record.connectMs.toFixed(2),
      record.secureHandshakeMs.toFixed(2),
    ]),
  );
}

export function generateQoeCsv(samples: PlaybackQoeSample[]): string {
  return buildCsv(
    [
      "PlaybackSampleId", "Replay", "TimestampUTC", "Stream", "Segment", "IsPlaying",
      "RenderedVideoBitrate_kbps", "ViewedAverageRenderedVideoBitrate_kbps", "RenderedVideoResolution",
      "FPS", "DroppedFrames", "FreezeEvents",
      "StartupDelayToFirstRenderedFrame_ms", "StartupDelayMethod",
      "StallCount", "StallDuration_ms", "RebufferingRatio",
      "RenderedVideoQualitySwitchCount", "RenderedVideoQualityUpSwitchCount",
      "RenderedVideoQualityDownSwitchCount", "QualitySemantics",
      "CurrentTime_s", "TotalPlaybackTime_s", "Duration_s", "Buffer_s",
      "VideoMediaFragmentFailureOrAbandonRate", "VideoMediaFragmentRequests",
      "FailedVideoMediaFragments", "AbandonedVideoMediaFragments",
      "IsAutoQuality", "ActiveScenario",
    ],
    samples.map((sample) => {
      const stats = sample.stats;
      return [
        sample.id,
        sample.replay,
        sample.timestamp,
        sample.streamTitle,
        sample.segmentLabel,
        sample.isPlaying,
        stats.bitrateKbps,
        stats.averageBitrateKbps.toFixed(2),
        stats.resolutionLabel,
        stats.fps.toFixed(1),
        stats.droppedFrames,
        stats.freezeEventCount,
        stats.startupDelayToFirstFrameMs,
        stats.startupDelayMethod,
        stats.stallCount,
        stats.stallDurationMs,
        stats.rebufferingRatio.toFixed(4),
        stats.qualitySwitchCount,
        stats.qualityUpSwitchCount,
        stats.qualityDownSwitchCount,
        sample.qualitySemantics,
        stats.currentTime.toFixed(2),
        stats.totalPlaybackTime.toFixed(2),
        stats.duration.toFixed(2),
        stats.bufferSeconds.toFixed(2),
        stats.fragmentFailureOrAbandonRate.toFixed(4),
        stats.fragmentRequestCount,
        stats.failedFragmentRequestCount,
        stats.abandonedFragmentRequestCount,
        sample.isAutoQuality,
        sample.activeScenarioLabel,
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
  const segmentLabel = params.logs[0]?.segmentLabel ?? "—";
  const manifestUrl = params.logs[0]?.manifestUrl ?? "—";
  const sections = [
    separator,
    "  ADTUBE STREAM ANALYZER - MEASUREMENT LOG",
    `  Stream: ${params.streamTitle}`,
    `  Segment: ${segmentLabel}`,
    `  Manifest: ${manifestUrl}`,
    `  Generated: ${new Date().toISOString()}`,
    separator,
    "",
    "-- STREAM STATS --",
    `  Resolution:        ${params.stats.resolutionLabel}`,
    `  Rendered Video Bitrate: ${formatBitrateKbps(params.stats.bitrateKbps)}`,
    `  Viewed Average Bitrate: ${formatBitrateKbps(params.stats.averageBitrateKbps)}`,
    `  Throughput:        ${formatBitrateKbps(params.stats.avgThroughputKbps)}`,
    `  Payload Rate:      ${formatBitrateKbps(params.stats.payloadRateKbps)}`,
    `  Buffer:            ${params.stats.bufferSeconds.toFixed(2)} s`,
    `  FPS:               ${params.stats.fps.toFixed(1)}`,
    `  Dropped Frames:    ${params.stats.droppedFrames}`,
    `  Freeze Events:     ${params.stats.freezeEventCount}`,
    `  Protocol:          ${params.stats.protocolLabel}`,
    "",
    "-- NETWORK METRICS --",
    `  TTFB:              ${params.stats.ttfbMs.toFixed(2)} ms`,
    `  SDT Variation:     ${params.stats.segmentDownloadTimeVariationMs.toFixed(2)} ms`,
    `  Segment Wall Time: ${params.stats.lastSegmentDurationMs} ms`,
    `  Download Speed:    ${formatBitrateKbps(params.stats.downloadSpeedKbps)}`,
    `  Setup/DNS/Connect/Secure: ${params.stats.connectionSetupMs.toFixed(2)} / ${params.stats.dnsMs.toFixed(2)} / ${params.stats.connectMs.toFixed(2)} / ${params.stats.secureHandshakeMs.toFixed(2)} ms`,
    `  Request Failure/Abandon Rate: ${(params.stats.fragmentFailureOrAbandonRate * 100).toFixed(2)}%`,
    "  Note: browser telemetry does not expose QUIC packet loss or wire overhead.",
    "",
    "-- PLAYBACK STABILITY --",
    `  Startup to First Frame: ${params.stats.startupDelayToFirstFrameMs || 0} ms (${params.stats.startupDelayMethod})`,
    `  Stall Count:       ${params.stats.stallCount}`,
    `  Stall Duration:    ${(params.stats.stallDurationMs / 1000).toFixed(3)} s`,
    `  Rebuffering Ratio: ${(params.stats.rebufferingRatio * 100).toFixed(2)}%`,
    `  Rendered Video Quality Switches: ${params.stats.qualitySwitchCount} (${params.stats.qualityUpSwitchCount} up / ${params.stats.qualityDownSwitchCount} down; initial excluded)`,
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
      (log) => `  [R${log.replay}] [${log.timestamp}] [${log.level}] [${log.segmentLabel}] [${log.statsSnapshot.protocolLabel}] ${log.message}`,
    ),
    "",
    separator,
  ];
  return sections.join("\n");
}
