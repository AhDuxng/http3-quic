import { useCallback, useMemo, useRef } from "react";
import type { StreamStats } from "../type/dashPlayer";

export interface StallTrackerRefs {
  stallCount: number;
  stallAccumulatedMs: number;
}

interface UseStallTrackerArgs {
  updateStats: (updater: (prev: StreamStats) => StreamStats) => void;
}

export function useStallTracker({ updateStats }: UseStallTrackerArgs) {
  const stallCountRef = useRef(0);
  const stallAccumulatedMsRef = useRef(0);
  const stallStartRef = useRef<number | null>(null);

  const onBufferEmpty = useCallback(() => {
    stallStartRef.current = Date.now();
    stallCountRef.current += 1;
    updateStats((prev) => ({ ...prev, stallCount: stallCountRef.current }));
  }, [updateStats]);

  const onBufferLoaded = useCallback((): number => {
    if (stallStartRef.current === null) return 0;
    const duration = Date.now() - stallStartRef.current;
    stallAccumulatedMsRef.current += duration;
    stallStartRef.current = null;
    updateStats((prev) => ({ ...prev, stallDurationMs: stallAccumulatedMsRef.current }));
    return duration;
  }, [updateStats]);

  const getSnapshot = useCallback((): StallTrackerRefs => ({
    stallCount: stallCountRef.current,
    stallAccumulatedMs: stallAccumulatedMsRef.current,
  }), []);

  const reset = useCallback(() => {
    stallCountRef.current = 0;
    stallAccumulatedMsRef.current = 0;
    stallStartRef.current = null;
  }, []);

  return useMemo(() => ({ onBufferEmpty, onBufferLoaded, getSnapshot, reset }),
    [onBufferEmpty, onBufferLoaded, getSnapshot, reset]);
}
