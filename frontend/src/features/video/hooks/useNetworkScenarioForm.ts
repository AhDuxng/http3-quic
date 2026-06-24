import { useCallback, useState } from "react";
import type { NetworkScenario } from "../../../type/video";

type CustomNetField = "bitrate" | "delay" | "loss";

interface UseNetworkScenarioFormArgs {
  applyScenario: (scenario: NetworkScenario) => void;
}

export function useNetworkScenarioForm({ applyScenario }: UseNetworkScenarioFormArgs) {
  const [customNet, setCustomNet] = useState({ bitrate: "", delay: "", loss: "" });
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);

  const updateCustomNet = useCallback((field: CustomNetField, value: string) => {
    setCustomNet((previousValue) => ({ ...previousValue, [field]: value }));
  }, []);

  const applyCustomNet = useCallback(() => {
    applyScenario({
      id: "custom",
      label: "Custom",
      speedLabel: customNet.bitrate ? `${customNet.bitrate} kbps` : "No limit",
      maxBitrateKbps: customNet.bitrate ? Number(customNet.bitrate) : null,
      delayMs: customNet.delay ? Number(customNet.delay) : 0,
      lossPercent: customNet.loss ? Number(customNet.loss) : 0,
      description: "Custom user settings",
    });
  }, [applyScenario, customNet]);

  const toggleCustomExpanded = useCallback(() => {
    setIsCustomExpanded((previousValue) => !previousValue);
  }, []);

  return {
    customNet,
    isCustomExpanded,
    updateCustomNet,
    applyCustomNet,
    toggleCustomExpanded,
  };
}
