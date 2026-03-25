import { useEffect, useState } from "react";
import type { VideoInfo } from "../../../type/video";

// Kieu tra ve ro rang cua hook - giup consumer biet chinh xac co gi
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
    // Co che cleanup: danh dau component con active hay khong
    // Neu component unmount truoc khi fetch xong, khong set state
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

        // Chi cap nhat state neu component van con mount
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

    // Tra ve cleanup function: danh dau la inactive khi unmount
    return () => {
      isActive = false;
    };
  }, []); // Chi chay mot lan khi mount

  return { videoInfo, isLoading, error };
}
