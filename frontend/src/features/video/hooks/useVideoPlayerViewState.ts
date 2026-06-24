import { useEffect, useMemo } from "react";
import type { Representation } from "dashjs";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import { networkScenarios } from "../constants/networkScenarios";
import type { QualitySelection } from "../type/dashPlayer";

interface UseVideoPlayerViewStateArgs {
  activeScenarioId: NetworkScenarioId;
  isAutoQuality: boolean;
  qualitySelection: QualitySelection;
  representations: Representation[];
  protocolLabel: string;
  onProtocolChange?: (protocol: string) => void;
}

export function useVideoPlayerViewState({
  activeScenarioId,
  isAutoQuality,
  qualitySelection,
  representations,
  protocolLabel,
  onProtocolChange,
}: UseVideoPlayerViewStateArgs) {
  useEffect(() => {
    if (onProtocolChange && protocolLabel) onProtocolChange(protocolLabel);
  }, [protocolLabel, onProtocolChange]);

  const activeScenario: NetworkScenario = useMemo(
    () => networkScenarios.find((scenario) => scenario.id === activeScenarioId) ?? {
      id: "custom",
      label: "Custom",
      speedLabel: "No limit",
      maxBitrateKbps: null,
      description: "Custom",
    },
    [activeScenarioId],
  );

  const profileLabel = useMemo(() => {
    if (isAutoQuality) return "Auto";
    const selectedRepresentation = representations[qualitySelection as number];
    return selectedRepresentation?.height ? `${selectedRepresentation.height}p` : "Manual";
  }, [isAutoQuality, qualitySelection, representations]);

  return { activeScenario, profileLabel };
}
