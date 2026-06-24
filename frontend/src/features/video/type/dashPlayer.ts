import type { Representation } from "dashjs";
import type { RefObject } from "react";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";

export type QualitySelection = "auto" | number;

export type LogLevel = "INFO" | "WARN" | "ERRO" | "NET" | "SYS";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  statsSnapshot: StreamStats;
  isAutoQuality: boolean;
  activeScenarioLabel: string;
  streamTitle: string;
}

export interface StreamStats {
  bitrateKbps: number;
  averageBitrateKbps: number;
  avgThroughputKbps: number;
  bufferSeconds: number;
  resolutionLabel: string;
  fps: number;
  droppedFrames: number;
  frozenFrameCount: number;

  downloadSpeedKbps: number;
  goodputKbps: number;
  lastSegmentDurationMs: number;
  ttfbMs: number;
  jitterMs: number;
  overheadRatio: number;
  connectionSetupMs: number;
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  lossProxyRate: number;
  fragmentRequestCount: number;
  failedFragmentRequestCount: number;
  abandonedFragmentRequestCount: number;

  stallCount: number;
  stallDurationMs: number;
  rebufferingRatio: number;
  qualitySwitchCount: number;
  qualityUpSwitchCount: number;
  qualityDownSwitchCount: number;
  startupDelayMs: number;

  currentTime: number;
  duration: number;

  protocolLabel: string;
  networkType: string;
}

export interface UseDashPlayerArgs {
  manifestUrl: string | null | undefined;
  scenarios: readonly NetworkScenario[];
  streamTitle?: string;
}

export interface UseDashPlayerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  representations: Representation[];
  isPlaying: boolean;
  stats: StreamStats;
  activeScenarioId: NetworkScenarioId;
  qualitySelection: QualitySelection;
  isAutoQuality: boolean;
  logs: LogEntry[];
  applyScenario: (scenario: NetworkScenario) => void;
  setQualitySelection: (value: QualitySelection) => void;
  togglePlayPause: () => void;
  play: () => void;
  pause: () => void;
  resetStats: () => void;
  getStatsSnapshot: () => StreamStats;
  replayCount: number;
  currentReplay: number;
  isReplayDone: boolean;
  setReplayCount: (count: number) => void;
}
