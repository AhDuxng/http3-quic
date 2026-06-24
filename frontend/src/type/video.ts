export type NetworkScenarioId =
  | "fiber"
  | "mobile4g"
  | "mobile4g_slow"
  | "umts3g"
  | "slow3g"
  | "edge2g"
  | "custom";

export interface NetworkScenario {
  id: NetworkScenarioId;
  label: string;
  speedLabel: string;
  maxBitrateKbps: number | null;
  delayMs?: number;
  lossPercent?: number;
  description: string;
}
