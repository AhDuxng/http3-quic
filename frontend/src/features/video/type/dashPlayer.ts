/**
 * dashPlayer.ts - Type definitions for useDashPlayer hook.
 *
 * Metric naming follows academic conventions for adaptive streaming QoE research:
 *   - SDT (Segment Download Time): time to download one segment
 *   - TTFB (Time To First Byte): responseStart - requestStart
 *   - Stall: playback interruption due to buffer depletion (BUFFER_EMPTY event)
 *   - Rebuffer: HTML5 video "waiting" event (complementary measurement)
 *   - Jitter: |SDT_current - SDT_previous|
 *   - Rebuffering Ratio: totalStallDuration / totalPlaybackDuration
 */
import type { Representation } from "dashjs";
import type { RefObject } from "react";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";

// "auto" = ABR automatic, number = specific representation index
export type QualitySelection = "auto" | number;

// Log entry severity level
export type LogLevel = "INFO" | "WARN" | "ERRO" | "NET" | "SYS";

// A single console log entry
export interface LogEntry {
  id: number;
  timestamp: string; // format HH:mm:ss.cs
  level: LogLevel;
  message: string;
  statsSnapshot: StreamStats;
  isAutoQuality: boolean;
  activeScenarioLabel: string;
}

// A quality change record (for quality log panel)
export interface QualityLogItem {
  time: string;
  quality: string;
  bitrateKbps: number;
}

/**
 * Complete set of stream measurements from dash.js and HTMLVideoElement.
 *
 * Academic metric references:
 *   [1] QoE in Adaptive Streaming – IEEE, ACM surveys
 *   [2] QUIC vs TCP for DASH – arXiv, IEEE INFOCOM
 */
export interface StreamStats {
  // ── Video Quality Metrics ──
  /** Video Bitrate — bitrate of current representation (kbps) */
  bitrateKbps: number;
  /** Throughput — measured average throughput (kbps) */
  avgThroughputKbps: number;
  /** Buffer Occupancy — current buffer level (seconds) */
  bufferSeconds: number;
  /** Resolution label — e.g. "1920x1080" */
  resolutionLabel: string;
  /** Frame Rate — measured FPS */
  fpsLabel: string;
  /** Dropped Frames — cumulative dropped video frames */
  droppedFrames: number;
  /** Total Frames — cumulative total video frames rendered */
  totalFrames: number;
  /** Protocol — detected via Resource Timing nextHopProtocol */
  protocolLabel: string;
  /** Codec — e.g. "avc1.64001f" */
  codecLabel: string;
  /** Quality Index — 0-based index of current quality level */
  qualityIndex: number;
  /** Quality Count — total number of quality levels available */
  qualityCount: number;

  // ── Network / Segment Metrics ──
  /** Segment Download Speed — (bytesLoaded * 8) / SDT (kbps) */
  downloadSpeedKbps: number;
  /** Segment Size — size of most recently downloaded segment (KB) */
  lastSegmentSizeKB: number;
  /**
   * Segment Download Time (SDT) — total time to download last segment (ms).
   * Academic name: Segment Download Time.
   * Formula: endTime - startTime of segment request.
   */
  lastSegmentDurationMs: number;
  /**
   * Time To First Byte (TTFB) — time from request start to first byte received (ms).
   * Measured via PerformanceResourceTiming: responseStart - requestStart.
   * Fallback: firstByteDate - startDate from dash.js.
   */
  ttfbMs: number;
  /**
   * SDT Jitter — inter-segment download time variation (ms).
   * Formula: |SDT_current - SDT_previous|.
   */
  jitterMs: number;

  // ── Playback Stability Metrics ──
  /**
   * Stall Count — number of buffer depletion events (dash.js BUFFER_EMPTY).
   * This is the academically standard "stall event" metric.
   */
  stallCount: number;
  /**
   * Total Stall Duration — cumulative time in stalled state (ms).
   * Measured from BUFFER_EMPTY to BUFFER_LOADED.
   */
  stallDurationMs: number;
  /**
   * Rebuffer Count — number of HTML5 video "waiting" events.
   * Complementary to stallCount; captures browser-level buffering events.
   */
  rebufferCount: number;
  /**
   * Total Rebuffer Duration — cumulative waiting → playing time (ms).
   */
  rebufferDurationMs: number;
  /**
   * Rebuffering Ratio — totalStallDuration / totalPlaybackDuration.
   * Standard QoE metric; lower is better. Range [0, 1].
   */
  rebufferingRatio: number;
  /** Quality Switch Count — number of quality level changes */
  qualitySwitchCount: number;
  /** Total Downloaded — cumulative bytes downloaded (MB) */
  totalDownloadedMB: number;

  // ── Playback Position ──
  /** Current playback time (seconds) */
  currentTime: number;
  /** Total media duration (seconds) */
  duration: number;

  // ── Network Context ──
  /** Connection Type — from Network Information API (e.g. "4g", "wifi") */
  connectionType: string;
  /** Estimated Bandwidth — from navigator.connection.downlink (Mbps) */
  estimatedBandwidthMbps: number;
}

// Hook input parameters
export interface UseDashPlayerArgs {
  manifestUrl: string | null | undefined;
  scenarios: readonly NetworkScenario[];
}

// Hook return value for components
export interface UseDashPlayerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  representations: Representation[];
  isPlaying: boolean;
  stats: StreamStats;
  activeScenarioId: NetworkScenarioId;
  qualitySelection: QualitySelection;
  isAutoQuality: boolean;
  qualityLog: QualityLogItem[];
  logs: LogEntry[];
  applyScenario: (scenario: NetworkScenario) => void;
  setQualitySelection: (value: QualitySelection) => void;
  togglePlayPause: () => void;
  resetStats: () => void;
}
