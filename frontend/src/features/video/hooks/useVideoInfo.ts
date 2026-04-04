import { useEffect, useState } from "react";
import type { VideoInfo } from "../../../type/video";

// Explicit return type for the hook - helps consumers know exactly what is returned
interface UseVideoInfoResult {
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  error: string | null;
}

export function useVideoInfo(): UseVideoInfoResult {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup mechanism: marks if the component is still active
    // If component unmounts before fetch finishes, do not set state
    let isActive = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        // Call backend API to fetch video metadata
        const response = await fetch("/api/video-info");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load video info`);
        }

        const data = (await response.json()) as VideoInfo;

        // Only update state if the component is still mounted
        if (!isActive) return;
        setVideoInfo(data);
      } catch (e) {
        if (!isActive) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    load();

    // Return cleanup function: mark as inactive upon unmount
    return () => {
      isActive = false;
    };
  }, []); // Only run once on mount

  return { videoInfo, isLoading, error };
}
