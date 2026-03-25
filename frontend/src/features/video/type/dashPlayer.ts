/**
 * dashPlayer.ts - Kieu du lieu noi bo cho useDashPlayer hook.
 */
import type { Representation } from "dashjs";
import type { RefObject } from "react";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";

// "auto" = ABR tu dong, number = index representation cu the
export type QualitySelection = "auto" | number;

// Cap do cua ban ghi console log
export type LogLevel = "INFO" | "WARN" | "ERRO" | "NET" | "SYS";

// Mot ban ghi trong console log panel
export interface LogEntry {
  id: number;
  timestamp: string; // dinh dang HH:mm:ss.cs
  level: LogLevel;
  message: string;
}

// Mot ban ghi thay doi chat luong (dung cho quality log panel)
export interface QualityLogItem {
  time: string;
  quality: string;
  bitrateKbps: number;
}

// Toan bo thong so stream lay tu dash.js va HTMLVideoElement
export interface StreamStats {
  bitrateKbps: number;
  avgThroughputKbps: number; // throughput trung binh (kbps)
  bufferSeconds: number;
  resolutionLabel: string;
  fpsLabel: string;
  droppedFrames: number;
  totalFrames: number;
  protocolLabel: string;
  // --- Cac truong mo rong ---
  latencyMs: number;           // do tre tai segment gan nhat (ms)
  downloadSpeedKbps: number;   // toc do tai thuc te (kbps)
  lastSegmentSizeKB: number;   // kich thuoc segment cuoi (KB)
  lastSegmentDurationMs: number; // thoi gian tai segment cuoi (ms)
  currentTime: number;         // thoi gian phat hien tai (s)
  duration: number;            // tong thoi luong video (s)
  codecLabel: string;          // codec dang dung
  qualityIndex: number;        // index quality hien tai
  qualityCount: number;        // tong so quality levels
  // --- Thong so mang mo rong ---
  jitterMs: number;            // bien thien latency giua cac segment (ms)
  rttMs: number;               // round-trip time uoc tinh (ms)
  rebufferCount: number;       // so lan video bi dung cho buffer
  rebufferDurationMs: number;  // tong thoi gian bi stall (ms)
  qualitySwitchCount: number;  // so lan chuyen doi quality
  totalDownloadedMB: number;   // tong dung luong da tai (MB)
  connectionType: string;      // loai ket noi mang (wifi/4g/ethernet)
  estimatedBandwidthMbps: number; // bang thong uoc tinh cua trinh duyet (Mbps)
}

// Tham so dau vao cua hook
export interface UseDashPlayerArgs {
  manifestUrl: string | null | undefined;
  scenarios: readonly NetworkScenario[];
}

// Gia tri hook tra ve cho component
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
