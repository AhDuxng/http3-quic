// useVideoInfo.ts — Hook lay metadata video tu backend API
import { useEffect, useState } from "react";
import type { VideoInfo } from "../../../type/video";

// Kieu tra ve cua hook
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
    // Cleanup: danh dau component con active khong
    let isActive = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        // Goi API backend lay metadata video
        const response = await fetch("/api/video-info");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load video info`);
        }

        const data = (await response.json()) as VideoInfo;
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

    // Danh dau inactive khi unmount
    return () => { isActive = false; };
  }, []); // Chi chay 1 lan khi mount

  return { videoInfo, isLoading, error };
}
