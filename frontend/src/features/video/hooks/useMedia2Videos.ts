// useMedia2Videos.ts — Hook lay danh sach video MP4 tu media-2
import { useEffect, useState } from "react";
import type { Media2Video } from "../../../type/video";

interface UseMedia2VideosResult {
  videos: Media2Video[];
  isLoading: boolean;
  error: string | null;
}

export function useMedia2Videos(): UseMedia2VideosResult {
  const [videos, setVideos] = useState<Media2Video[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/media2-videos");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load media-2 videos`);
        }

        const data = (await response.json()) as Media2Video[];
        if (!isActive) return;
        setVideos(data);
      } catch (e) {
        if (!isActive) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    load();
    return () => { isActive = false; };
  }, []);

  return { videos, isLoading, error };
}
