/**
 * dashPlayer.ts - Constants for useDashPlayer hook.
 */
import type { StreamStats } from "../type/dashPlayer";

// Max entries in quality log
export const MAX_QUALITY_LOG_ENTRIES = 20;

// Max entries in console log panel
export const MAX_LOG_ENTRIES = 200;

// Stats polling interval from dash.js (ms) — update every 1 second
export const STATS_POLL_INTERVAL_MS = 1000;

// Throttle NET log — only write 1 NET entry every 3 seconds
export const NET_LOG_THROTTLE_MS = 3000;

// Default state when no stream data is available
export const DEFAULT_STATS: StreamStats = {
  bitrateKbps: 0,
  avgThroughputKbps: 0,
  bufferSeconds: 0,
  resolutionLabel: "—",
  fpsLabel: "—",
  droppedFrames: 0,
  totalFrames: 0,
  protocolLabel: "DASH / HTTP3",
  downloadSpeedKbps: 0,
  lastSegmentSizeKB: 0,
  lastSegmentDurationMs: 0,
  ttfbMs: 0,
  jitterMs: 0,
  stallCount: 0,
  stallDurationMs: 0,
  rebufferCount: 0,
  rebufferDurationMs: 0,
  rebufferingRatio: 0,
  qualitySwitchCount: 0,
  totalDownloadedMB: 0,
  currentTime: 0,
  duration: 0,
  codecLabel: "—",
  qualityIndex: 0,
  qualityCount: 0,
  connectionType: "—",
  estimatedBandwidthMbps: 0,
};
