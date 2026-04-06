// dashPlayer.ts — Hang so cho useDashPlayer hook
import type { StreamStats } from "../type/dashPlayer";

// Chu ky polling stats tu dash.js (ms) — cap nhat moi 1 giay
export const STATS_POLL_INTERVAL_MS = 1000;

// Gioi han log NET — chi ghi 1 dong NET moi 3 giay
export const NET_LOG_THROTTLE_MS = 3000;

// Trang thai mac dinh khi chua co du lieu stream
export const DEFAULT_STATS: StreamStats = {
  bitrateKbps: 0,
  avgThroughputKbps: 0,
  bufferSeconds: 0,
  resolutionLabel: "—",
  fps: 0,
  droppedFrames: 0,
  downloadSpeedKbps: 0,
  lastSegmentDurationMs: 0,
  ttfbMs: 0,
  jitterMs: 0,
  stallCount: 0,
  stallDurationMs: 0,
  rebufferingRatio: 0,
  qualitySwitchCount: 0,
  currentTime: 0,
  duration: 0,
  protocolLabel: "Detecting...",
  networkType: "unknown",
};
