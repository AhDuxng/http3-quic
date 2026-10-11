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

  const onBufferEmpty = useCallback((eligible: boolean) => {
    if (!eligible || stallStartRef.current !== null) return false;
    stallStartRef.current = performance.now();
    stallCountRef.current += 1;
    updateStats((prev) => ({ ...prev, stallCount: stallCountRef.current }));
    return true;
  }, [updateStats]);

  const onBufferLoaded = useCallback((): number => {
    if (stallStartRef.current === null) return 0;
    const duration = Math.max(0, performance.now() - stallStartRef.current);
    stallAccumulatedMsRef.current += duration;
    stallStartRef.current = null;
    updateStats((prev) => ({ ...prev, stallDurationMs: stallAccumulatedMsRef.current }));
    return duration;
  }, [updateStats]);

  // Dong stall dang mo tai moc cutoffMs; phan sau moc khong tinh, stall bat dau sau moc thi bo ca luot dem.
  const closeStallAt = useCallback((cutoffMs: number) => {
    if (stallStartRef.current === null) return;
    const stallStart = stallStartRef.current;
    stallStartRef.current = null;
    if (stallStart >= cutoffMs) {
      stallCountRef.current = Math.max(0, stallCountRef.current - 1);
    } else {
      stallAccumulatedMsRef.current += cutoffMs - stallStart;
    }
    updateStats((prev) => ({
      ...prev,
      stallCount: stallCountRef.current,
      stallDurationMs: stallAccumulatedMsRef.current,
    }));
  }, [updateStats]);

  const getSnapshot = useCallback((): StallTrackerRefs => {
    const activeDuration = stallStartRef.current === null
      ? 0
      : Math.max(0, performance.now() - stallStartRef.current);
    return {
      stallCount: stallCountRef.current,
      stallAccumulatedMs: stallAccumulatedMsRef.current + activeDuration,
    };
  }, []);

  const reset = useCallback(() => {
    stallCountRef.current = 0;
    stallAccumulatedMsRef.current = 0;
    stallStartRef.current = null;
  }, []);

  return useMemo(() => ({ onBufferEmpty, onBufferLoaded, closeStallAt, getSnapshot, reset }),
    [onBufferEmpty, onBufferLoaded, closeStallAt, getSnapshot, reset]);
}
