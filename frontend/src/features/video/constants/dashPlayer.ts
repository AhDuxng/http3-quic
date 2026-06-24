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
  frozenFrameCount: 0,
  downloadSpeedKbps: 0,
  goodputKbps: 0,
  lastSegmentDurationMs: 0,
  ttfbMs: 0,
  jitterMs: 0,
  overheadRatio: 0,
  connectionSetupMs: 0,
  dnsMs: 0,
  tcpMs: 0,
  tlsMs: 0,
  lossProxyRate: 0,
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
  protocolLabel: "Detecting...",
  networkType: "unknown",
};
