import { createElement, memo, useMemo } from "react";
import type { Representation } from "dashjs";
import { FaNetworkWired, FaEdit, FaCheck } from "react-icons/fa";
import { networkScenarios, scenarioIcons } from "../constants/networkScenarios";
import { formatBitrateKbps } from "../hooks/useDashPlayer";
import { useNetworkScenarioForm } from "../hooks/useNetworkScenarioForm";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import type { QualitySelection } from "../type/dashPlayer";
import { PanelHeader } from "./shared/PanelHeader";

interface NetworkSimulationPanelProps {
  currentBitrateKbps: number;
  representations: Representation[];
  isAutoQuality: boolean;
  activeScenarioId: NetworkScenarioId;
  qualitySelection: QualitySelection;
  setQualitySelection: (value: QualitySelection) => void;
  applyScenario: (scenario: NetworkScenario) => void;
  isManualMode: boolean;
  setIsManualMode: (value: boolean | ((previousValue: boolean) => boolean)) => void;
}

function NetworkSimulationPanelComponent({
  currentBitrateKbps, representations, isAutoQuality, activeScenarioId,
  qualitySelection, setQualitySelection, applyScenario,
  isManualMode, setIsManualMode,
}: NetworkSimulationPanelProps) {
  const {
    customNet,
    isCustomExpanded,
    updateCustomNet,
    applyCustomNet,
    toggleCustomExpanded,
  } = useNetworkScenarioForm({ applyScenario });

  const activeScenario = useMemo(
    () => networkScenarios.find((scenario) => scenario.id === activeScenarioId) ?? networkScenarios[0],
    [activeScenarioId],
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0">
      <PanelHeader
        icon={<FaNetworkWired className="text-slate-400 w-3 h-3" />}
        title="NETWORK SIMULATION"
        actions={(
          <button onClick={() => setIsManualMode((previousValue) => !previousValue)}
            className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors">
            {isManualMode ? "AUTO MODE" : "MANUAL CONTROL"}
          </button>
        )}
      />

      {isManualMode ? (
        <div className="p-3">
          <select
            value={qualitySelection}
            onChange={(event) => {
              const selectedValue = event.target.value;
              setQualitySelection(selectedValue === "auto" ? "auto" : Number.parseInt(selectedValue, 10));
            }}
            className="w-full text-sm border border-slate-200 rounded px-2.5 py-2 outline-none focus:border-blue-400"
          >
            <option value="auto">Auto ABR ({formatBitrateKbps(currentBitrateKbps)})</option>
            {representations.map((representation, index) => (
              <option key={index} value={index}>
                {representation.height ? `${representation.height}p` : "—"} — {formatBitrateKbps(
                  typeof representation.bitrateInKbit === "number"
                    ? representation.bitrateInKbit
                    : Math.round((representation.bandwidth ?? 0) / 1000)
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
        <div className="divide-y divide-slate-50">
          {networkScenarios.map((scenario) => {
            const scenarioIcon = scenarioIcons[scenario.id];
            const isActive = activeScenarioId === scenario.id;
            return (
              <button key={scenario.id} type="button" onClick={() => applyScenario(scenario)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isActive ? "bg-blue-50" : "hover:bg-slate-50"
                }`}>
                {scenarioIcon && createElement(scenarioIcon, {
                  className: `w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-500" : "text-slate-400"}`,
                })}
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

      {!isManualMode && (
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <FaEdit className="text-slate-400" /> CUSTOM SETTINGS
            </span>
            <button type="button" onClick={toggleCustomExpanded}
              className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">
              {activeScenarioId === "custom" ? "ACTIVE" : isCustomExpanded ? "HIDE" : "SHOW"}
            </button>
          </div>
          {(isCustomExpanded || activeScenarioId === "custom") && (
            <div className="space-y-2 mt-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Max Bitrate (kbps)</label>
                  <input type="number" placeholder="vd 1000" value={customNet.bitrate}
                    onChange={(event) => updateCustomNet("bitrate", event.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Delay (ms)</label>
                  <input type="number" placeholder="vd 50" value={customNet.delay}
                    onChange={(event) => updateCustomNet("delay", event.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 block mb-1">Loss (%)</label>
                  <input type="number" placeholder="vd 1" value={customNet.loss}
                    onChange={(event) => updateCustomNet("loss", event.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400" />
                </div>
              </div>
              <button type="button" onClick={applyCustomNet}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold text-white transition-colors ${
                  activeScenarioId === "custom" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-500 hover:bg-blue-600"
                }`}>
                <FaCheck className="w-3 h-3" /> Ap dung
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const NetworkSimulationPanel = memo(NetworkSimulationPanelComponent);
NetworkSimulationPanel.displayName = "NetworkSimulationPanel";
