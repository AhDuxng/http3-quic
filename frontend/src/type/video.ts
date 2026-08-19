export type NetworkScenarioId =
  | "unconfigured"
  | "real_network"
  | "fiber"
  | "mobile4g"
  | "mobile4g_slow"
  | "migration_test"
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
