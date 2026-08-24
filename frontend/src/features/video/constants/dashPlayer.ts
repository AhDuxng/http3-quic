import type { StreamStats } from "../type/dashPlayer";

export const statsPollIntervalMs = 1000;

export const netLogThrottleMs = 3000;

export const defaultStats: StreamStats = {
  bitrateKbps: 0,
  averageBitrateKbps: 0,
  avgThroughputKbps: 0,
  bufferSeconds: 0,
  resolutionLabel: "—",
  fps: 0,
  droppedFrames: 0,
  freezeEventCount: 0,
  downloadSpeedKbps: 0,
  payloadRateKbps: 0,
  lastSegmentDurationMs: 0,
  ttfbMs: 0,
  segmentDownloadTimeVariationMs: 0,
  connectionSetupMs: 0,
  dnsMs: 0,
  connectMs: 0,
  secureHandshakeMs: 0,
  fragmentFailureOrAbandonRate: 0,
  fragmentRequestCount: 0,
  failedFragmentRequestCount: 0,
  abandonedFragmentRequestCount: 0,
  stallCount: 0,
  stallDurationMs: 0,
  rebufferingRatio: 0,
  qualitySwitchCount: 0,
  qualityUpSwitchCount: 0,
  qualityDownSwitchCount: 0,
  startupDelayMs: 0,
  currentTime: 0,
  duration: 0,
  totalPlaybackTime: 0,
  protocolLabel: "Detecting...",
  networkType: "unknown",
};
