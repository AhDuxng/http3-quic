/**
 * networkScenarios.ts - List of network scenarios and icon mapping.
 */
import type { ComponentType } from "react";
import { FaWifi, FaMobileAlt, FaBroadcastTower, FaCog } from "react-icons/fa";
import type { NetworkScenario } from "../../../type/video";
import type { NetworkScenarioId } from "../../../type/video";

// List of network scenarios (from fastest to slowest)
export const NETWORK_SCENARIOS: readonly NetworkScenario[] = [
  {
    id: "fiber",
    label: "Fiber Optic",
    speedLabel: "100+ Mbps",
    maxBitrateKbps: null,
    delayMs: 2,             // Very low ping
    lossPercent: 0,
    description: "Unlimited bandwidth, instant response",
  },
  {
    id: "mobile4g",
    label: "Mobile 4G High",
    speedLabel: "20 Mbps",
    maxBitrateKbps: 20000,
    delayMs: 40,            // Good ping
    lossPercent: 0.1,       // Extremely low packet loss
    description: "<= 20000 kbps, average delay 40ms",
  },
  {
    id: "mobile4g_slow",
    label: "Mobile 4G Limited",
    speedLabel: "5 Mbps",
    maxBitrateKbps: 5000,
    delayMs: 100,           // Poor network
    lossPercent: 0.5,
    description: "<= 5000 kbps, delay 100ms",
  },
  {
    id: "umts3g",
    label: "3G / UMTS Legacy",
    speedLabel: "1.5 Mbps",
    maxBitrateKbps: 1500,
    delayMs: 200,           // 3G network, quite laggy
    lossPercent: 1,         // Slight jitter
    description: "<= 1500 kbps, delay 200ms",
  },
  {
    id: "slow3g",
    label: "Slow 3G + Lag",
    speedLabel: "500 kbps",
    maxBitrateKbps: 500,
    delayMs: 400,           // Very high ping
    lossPercent: 2,         // 2% packet loss
    description: "<= 500 kbps, delay 400ms, loss 2%",
  },
  {
    id: "edge2g",
    label: "2G / EDGE",
    speedLabel: "250 kbps",
    maxBitrateKbps: 250,
    delayMs: 800,           // Almost 1 second per request
    lossPercent: 5,         // Extremely poor, 5% loss
    description: "<= 250 kbps, delay 800ms, loss 5%",
  },
] as const;

// Map id -> icon component (UI concern, placed in constants for VideoPlayer to use)
export const SCENARIO_ICONS: Record<NetworkScenarioId, ComponentType<{ className?: string }>> = {
  fiber:          FaWifi,
  mobile4g:       FaMobileAlt,
  mobile4g_slow:  FaMobileAlt,
  umts3g:         FaBroadcastTower,
  slow3g:         FaBroadcastTower,
  edge2g:         FaBroadcastTower,
  custom:         FaCog,
};
