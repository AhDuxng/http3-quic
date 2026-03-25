/**
 * dashPlayer.ts - Hang so noi bo cho useDashPlayer hook.
 */
import type { StreamStats } from "../type/dashPlayer";

// So entry toi da trong quality log
export const MAX_QUALITY_LOG_ENTRIES = 20;

// So entry toi da trong console log panel
export const MAX_LOG_ENTRIES = 200;

// Chu ky polling stats tu dash.js (ms) - cap nhat moi 1 giay
export const STATS_POLL_INTERVAL_MS = 1000;

// Moi 3 giay moi ghi 1 ban ghi NET (tranh log qua nhieu)
export const NET_LOG_THROTTLE_MS = 3000;

// State mac dinh khi chua co du lieu stream
export const DEFAULT_STATS: StreamStats = {
  bitrateKbps: 0,
  avgThroughputKbps: 0,
  bufferSeconds: 0,
  resolutionLabel: "—",
  fpsLabel: "—",
  droppedFrames: 0,
  totalFrames: 0,
  protocolLabel: "DASH / HTTP3",
  latencyMs: 0,
  downloadSpeedKbps: 0,
  lastSegmentSizeKB: 0,
  lastSegmentDurationMs: 0,
  currentTime: 0,
  duration: 0,
  codecLabel: "—",
  qualityIndex: 0,
  qualityCount: 0,
  // Thong so mang mo rong
  jitterMs: 0,
  rttMs: 0,
  rebufferCount: 0,
  rebufferDurationMs: 0,
  qualitySwitchCount: 0,
  totalDownloadedMB: 0,
  connectionType: "—",
  estimatedBandwidthMbps: 0,
};
