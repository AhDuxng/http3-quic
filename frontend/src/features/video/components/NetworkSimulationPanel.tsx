import { useState } from "react";
import { FaNetworkWired, FaEdit, FaCheck } from "react-icons/fa";
import { NETWORK_SCENARIOS, SCENARIO_ICONS } from "../constants/networkScenarios";
import { formatBitrateKbps } from "../hooks/useDashPlayer";
import type { NetworkScenario } from "../../../type/video";
import type { QualitySelection, StreamStats } from "../type/dashPlayer";

interface NetworkSimulationPanelProps {
  stats: StreamStats;
  representations: any[];
  isAutoQuality: boolean;
  activeScenarioId: string;
  qualitySelection: QualitySelection;
  setQualitySelection: (val: QualitySelection) => void;
  applyScenario: (scenario: NetworkScenario) => void;
  isManualMode: boolean;
  setIsManualMode: (val: boolean | ((old: boolean) => boolean)) => void;
}

export function NetworkSimulationPanel({
  stats,
  representations,
  isAutoQuality,
  activeScenarioId,
  qualitySelection,
  setQualitySelection,
  applyScenario,
  isManualMode,
  setIsManualMode
}: NetworkSimulationPanelProps) {
  const [customNet, setCustomNet] = useState({ bitrate: "", delay: "", loss: "" });
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);

  // Xy ly ap dung kich ban mang Custom
  const applyCustomNet = () => {
    applyScenario({
      id: "custom" as any,
      label: "Custom",
      speedLabel: customNet.bitrate ? `${customNet.bitrate} kbps` : "No limit",
      maxBitrateKbps: customNet.bitrate ? Number(customNet.bitrate) : null,
      delayMs: customNet.delay ? Number(customNet.delay) : 0,
      lossPercent: customNet.loss ? Number(customNet.loss) : 0,
      description: "Custom user settings",
    });
  };

  const activeScenario = NETWORK_SCENARIOS.find((s) => s.id === activeScenarioId) ?? NETWORK_SCENARIOS[0];

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <FaNetworkWired className="text-slate-400 w-3 h-3" />
          <span className="text-[11px] font-bold tracking-widest text-slate-600">
            NETWORK SIMULATION
          </span>
        </div>
        {/* Toggle giua Auto (scenario) va Manual (quality dropdown) */}
        <button
          onClick={() => setIsManualMode((v) => !v)}
          className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
        >
          {isManualMode ? "AUTO MODE" : "MANUAL CONTROL"}
        </button>
      </div>

      {isManualMode ? (
        /* Che do Manual: chon chat luong thu cong */
        <div className="p-3">
          <select
            value={qualitySelection}
            onChange={(e) => {
              const v = e.target.value;
              setQualitySelection(v === "auto" ? "auto" : Number.parseInt(v, 10));
            }}
            className="w-full text-sm border border-slate-200 rounded px-2.5 py-2 outline-none focus:border-blue-400"
          >
            <option value="auto">Auto ABR ({formatBitrateKbps(stats.bitrateKbps)})</option>
            {representations.map((rep, i) => (
              <option key={i} value={i}>
                {rep.height ? `${rep.height}p` : "—"} — {formatBitrateKbps(
                  typeof rep.bitrateInKbit === "number"
                    ? rep.bitrateInKbit
                    : Math.round((rep.bandwidth ?? 0) / 1000)
                )}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Mode:{" "}
            <span className={isAutoQuality ? "text-emerald-500" : "text-blue-500"}>
              {isAutoQuality ? "Auto ABR" : "Manual"}
            </span>
          </p>
        </div>
      ) : (
        /* Che do Auto: danh sach kich ban mang */
        <div className="divide-y divide-slate-50">
          {NETWORK_SCENARIOS.map((scenario) => {
            const Icon = SCENARIO_ICONS[scenario.id];
            const isActive = activeScenarioId === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => applyScenario(scenario)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-500" : "text-slate-400"}`} />}
                <span className={`flex-1 text-sm ${isActive ? "text-blue-700 font-semibold" : "text-slate-700"}`}>
                  {scenario.label}
                  {isActive && activeScenario?.maxBitrateKbps == null && (
                    <span className="ml-1 text-[10px] text-emerald-500 font-normal">(Default)</span>
                  )}
                </span>
                <span className={`text-[11px] font-mono ${isActive ? "text-blue-500 font-semibold" : "text-slate-400"}`}>
                  {scenario.speedLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* === Custom Scenario Form === */}
      {!isManualMode && (
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <FaEdit className="text-slate-400" />
              CUSTOM SETTINGS
            </span>
            <button
              type="button"
              onClick={() => setIsCustomExpanded(!isCustomExpanded)}
              className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold"
            >
              {activeScenarioId === "custom" ? "ACTIVE" : isCustomExpanded ? "HIDE" : "SHOW"}
            </button>
          </div>
          
          {(isCustomExpanded || activeScenarioId === "custom") && (
            <div className="space-y-2 mt-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Max Bitrate (kbps)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={customNet.bitrate}
                    onChange={(e) => setCustomNet({ ...customNet, bitrate: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Delay (ms)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={customNet.delay}
                    onChange={(e) => setCustomNet({ ...customNet, delay: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Loss (%)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1"
                    value={customNet.loss}
                    onChange={(e) => setCustomNet({ ...customNet, loss: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={applyCustomNet}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold text-white transition-colors ${
                  activeScenarioId === "custom" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                <FaCheck className="w-3 h-3" />
                Áp dụng
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
