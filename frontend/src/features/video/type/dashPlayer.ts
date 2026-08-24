import type { Representation } from "dashjs";
import type { RefObject } from "react";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";

export type QualitySelection = "auto" | number;
export type StartupDelayMethod =
  | "not-measured"
  | "first-rendered-frame"
  | "loadeddata-fallback"
  | "playing-fallback"
  | "playhead-fallback";

export type LogLevel = "INFO" | "WARN" | "ERRO" | "NET" | "SYS";

export interface LogEntry {
  id: number;
  replay: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  statsSnapshot: StreamStats;
  isAutoQuality: boolean;
  activeScenarioLabel: string;
  streamTitle: string;
  manifestUrl: string;
  segmentSeconds: number | null;
  segmentLabel: string;
}

export interface StreamStats {
  bitrateKbps: number;
  averageBitrateKbps: number;
  avgThroughputKbps: number;
  bufferSeconds: number;
  resolutionLabel: string;
  fps: number;
  droppedFrames: number;
  freezeEventCount: number;

  downloadSpeedKbps: number;
  payloadRateKbps: number;
  lastSegmentDurationMs: number;
  ttfbMs: number;
  segmentDownloadTimeVariationMs: number;
  connectionSetupMs: number;
  dnsMs: number;
  connectMs: number;
  secureHandshakeMs: number;
  fragmentFailureOrAbandonRate: number;
  fragmentRequestCount: number;
  failedFragmentRequestCount: number;
  abandonedFragmentRequestCount: number;

  stallCount: number;
  stallDurationMs: number;
  rebufferingRatio: number;
  qualitySwitchCount: number;
  qualityUpSwitchCount: number;
  qualityDownSwitchCount: number;
  startupDelayToFirstFrameMs: number;
  startupDelayMethod: StartupDelayMethod;

  currentTime: number;
  duration: number;
  totalPlaybackTime: number;

  protocolLabel: string;
  networkType: string;
}

export type SegmentRequestStatus = "completed" | "failed" | "abandoned";

export interface SegmentQosRecord {
  id: number;
  replay: number;
  timestamp: string;
  streamTitle: string;
  segmentLabel: string;
  url: string;
  mediaType: "video";
  requestType: string;
  representationId: string | null;
  qualityIndex: number | null;
  status: SegmentRequestStatus;
  responseStatus: number;
  protocolLabel: string;
  networkType: string;
  bytesLoaded: number;
  encodedBodySizeBytes: number;
  transferSizeBytes: number;
  resourceTimingSizeDeltaBytes: number;
  downloadTimeMs: number;
  downloadSpeedKbps: number;
  payloadRateKbps: number;
  ttfbMs: number;
  segmentDownloadTimeVariationMs: number;
  connectionSetupMs: number;
  dnsMs: number;
  connectMs: number;
  secureHandshakeMs: number;
}

export interface PlaybackQoeSample {
  id: number;
  replay: number;
  timestamp: string;
  streamTitle: string;
  segmentLabel: string;
  isPlaying: boolean;
  isAutoQuality: boolean;
  activeScenarioLabel: string;
  qualitySemantics: "video-quality-change-rendered-session-cumulative-initial-selection-excluded";
  stats: StreamStats;
}

export interface UseDashPlayerArgs {
  manifestUrl: string | null | undefined;
  scenarios: readonly NetworkScenario[];
  streamTitle?: string;
  segmentSeconds?: number | null;
}

export interface UseDashPlayerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  representations: Representation[];
  isPlaying: boolean;
  isFragmentLoading: boolean;
  stats: StreamStats;
  activeScenarioId: NetworkScenarioId;
  qualitySelection: QualitySelection;
  isAutoQuality: boolean;
  logs: LogEntry[];
  getSegmentQosRecords: () => SegmentQosRecord[];
  getPlaybackQoeSamples: () => PlaybackQoeSample[];
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
