import { useCallback, useEffect, useState } from "react";

export function useReplayControl(
  replayCount: number,
  setReplayCount: (count: number) => void,
) {
  const [replayInput, setReplayInput] = useState(String(replayCount));

  useEffect(() => {
    setReplayInput(String(replayCount));
  }, [replayCount]);

  const updateReplayCount = useCallback((value: string) => {
    setReplayInput(value);
    const replayNumber = Number.parseInt(value, 10);
    if (!Number.isNaN(replayNumber) && replayNumber >= 0) {
      setReplayCount(replayNumber);
    }
  }, [setReplayCount]);

  return { replayInput, updateReplayCount };
}
