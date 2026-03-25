/**
 * video.ts - Kieu du lieu dung chung toan ung dung.
 */

// Metadata co ban cua video stream
export interface VideoInfo {
  title: string;
  description: string;
  manifestUrl: string;
}

// Thong tin mot video MP4 chia theo bitrate (tu media-2)
export interface Media2Video {
  id: string;
  label: string;       // vd: "1008 kbps"
  bitrateBps: number;
  url: string;         // vd: "/media-2/bunny_1008699bps/BigBuckBunny_4snonSeg.mp4"
}

// ID cua kich ban mang - union type dam bao chi dung gia tri hop le
export type NetworkScenarioId =
  | "fiber"
  | "mobile4g"
  | "mobile4g_slow"
  | "umts3g"
  | "slow3g"
  | "edge2g"
  | "custom";

// Cau hinh mot kich ban mang mo phong
export interface NetworkScenario {
  id: NetworkScenarioId;
  label: string;
  speedLabel: string;            // Hien thi toc do, vi du "20 Mbps"
  maxBitrateKbps: number | null; // null = khong gioi han
  delayMs?: number;              // Do tre (Ping)
  lossPercent?: number;          // Ty le mat goi tin (%)
  description: string;
}

