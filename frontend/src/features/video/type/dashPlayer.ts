// dashPlayer.ts — Kieu du lieu cho useDashPlayer hook
//
// Chi so chuan cho paper so sanh H2 vs H3 trong DASH streaming:
//   SDT = Segment Download Time
//   TTFB = Time To First Byte (responseStart - requestStart)
//   Stall = su kien BUFFER_EMPTY tu dash.js
//   Jitter = |SDT_i - SDT_{i-1}|
//   Rebuffering Ratio = tongStallDuration / tongPlaybackDuration

import type { Representation } from "dashjs";
import type { RefObject } from "react";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";

// "auto" = ABR tu dong, number = index representation cu the
export type QualitySelection = "auto" | number;

// Muc do nghiem trong cua log
export type LogLevel = "INFO" | "WARN" | "ERRO" | "NET" | "SYS";

// Mot dong log trong console panel
export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  statsSnapshot: StreamStats;
  isAutoQuality: boolean;
  activeScenarioLabel: string;
}

// Tap hop day du cac chi so do luong tu dash.js va HTMLVideoElement
export interface StreamStats {
  // -- Chat luong video --
  /** Bitrate hien tai cua representation (kbps) */
  bitrateKbps: number;
  /** Throughput trung binh do duoc (kbps) */
  avgThroughputKbps: number;
  /** Muc buffer hien tai (giay) */
  bufferSeconds: number;
  /** Nhan do phan giai, vi du "1920x1080" */
  resolutionLabel: string;
  /** Toc do khung hinh thuc do (so) */
  fps: number;
  /** So khung hinh bi roi tich luy */
  droppedFrames: number;

  // -- Mang / Segment --
  /** Toc do tai segment = (bytes * 8) / SDT (kbps) */
  downloadSpeedKbps: number;
  /** Thoi gian tai segment cuoi - SDT (ms) */
  lastSegmentDurationMs: number;
  /** TTFB = responseStart - requestStart (ms) */
  ttfbMs: number;
  /** Jitter = |SDT_i - SDT_{i-1}| (ms) */
  jitterMs: number;

  // -- On dinh phat lai --
  /** So lan BUFFER_EMPTY event */
  stallCount: number;
  /** Tong thoi gian stall tich luy (ms) */
  stallDurationMs: number;
  /** Rebuffering Ratio = totalStallDuration / totalPlaybackDuration */
  rebufferingRatio: number;
  /** So lan chuyen doi chat luong */
  qualitySwitchCount: number;

  // -- Vi tri phat --
  /** Thoi gian phat hien tai (giay) */
  currentTime: number;
  /** Tong thoi luong video (giay) */
  duration: number;

  // -- Ngu canh --
  /** Giao thuc HTTP thuc te (HTTP/2, HTTP/3 (QUIC)) */
  protocolLabel: string;
  /** Loai ket noi vat ly: wifi, cellular, ethernet */
  networkType: string;
}

// Tham so dau vao cho hook
export interface UseDashPlayerArgs {
  manifestUrl: string | null | undefined;
  scenarios: readonly NetworkScenario[];
}

// Gia tri tra ve cua hook cho components
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
  resetStats: () => void;
}
