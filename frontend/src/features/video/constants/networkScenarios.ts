/**
 * networkScenarios.ts - Danh sach kich ban mang va icon mapping.
 */
import type { ComponentType } from "react";
import { FaWifi, FaMobileAlt, FaBroadcastTower, FaCog } from "react-icons/fa";
import type { NetworkScenario } from "../../../type/video";
import type { NetworkScenarioId } from "../../../type/video";

// Danh sach kich ban mang (tu nhanh nhat den cham nhat)
export const NETWORK_SCENARIOS: readonly NetworkScenario[] = [
  {
    id: "fiber",
    label: "Fiber Optic",
    speedLabel: "100+ Mbps",
    maxBitrateKbps: null,
    delayMs: 2,             // Ping rat thap
    lossPercent: 0,
    description: "Khong gioi han bang thong, phan hoi tuc thi",
  },
  {
    id: "mobile4g",
    label: "Mobile 4G High",
    speedLabel: "20 Mbps",
    maxBitrateKbps: 20000,
    delayMs: 40,            // Ping tam on
    lossPercent: 0.1,       // Mat goi tin vo cung nho
    description: "<= 20000 kbps, do tre trung binh 40ms",
  },
  {
    id: "mobile4g_slow",
    label: "Mobile 4G Limited",
    speedLabel: "5 Mbps",
    maxBitrateKbps: 5000,
    delayMs: 100,           // Mang kem
    lossPercent: 0.5,
    description: "<= 5000 kbps, do tre 100ms",
  },
  {
    id: "umts3g",
    label: "3G / UMTS Legacy",
    speedLabel: "1.5 Mbps",
    maxBitrateKbps: 1500,
    delayMs: 200,           // Mang 3G kha lag
    lossPercent: 1,         // Rung lac nhe
    description: "<= 1500 kbps, do tre 200ms",
  },
  {
    id: "slow3g",
    label: "Slow 3G + Lag",
    speedLabel: "500 kbps",
    maxBitrateKbps: 500,
    delayMs: 400,           // Ping rat cao
    lossPercent: 2,         // Mat 2% goi tin
    description: "<= 500 kbps, do tre 400ms, mat goi 2%",
  },
  {
    id: "edge2g",
    label: "2G / EDGE",
    speedLabel: "250 kbps",
    maxBitrateKbps: 250,
    delayMs: 800,           // Gan 1 giay cho moi request
    lossPercent: 5,         // Cuc ky kem, mat 5%
    description: "<= 250 kbps, do tre 800ms, mat goi 5%",
  },
] as const;

// Map id -> icon component (UI concern, dat o constants de VideoPlayer dung)
export const SCENARIO_ICONS: Record<NetworkScenarioId, ComponentType<{ className?: string }>> = {
  fiber:          FaWifi,
  mobile4g:       FaMobileAlt,
  mobile4g_slow:  FaMobileAlt,
  umts3g:         FaBroadcastTower,
  slow3g:         FaBroadcastTower,
  edge2g:         FaBroadcastTower,
  custom:         FaCog,
};
