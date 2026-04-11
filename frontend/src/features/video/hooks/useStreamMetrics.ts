// useStreamMetrics.ts — Thu thap chi so tu segment events va polling
//
// Chua logic tinh toan: SDT, TTFB, Jitter, Throughput, FPS, Buffer
// Tach rieng khoi player init/events de giu useDashPlayer gon

import { useCallback, useMemo, useRef } from "react";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { StreamStats } from "../type/dashPlayer";
import { getTTFBFromPerformanceAPI, detectProtocol, getNetworkType } from "../utils/performanceApi";

// Lay bitrate (kbps) tu representation
export function getRepBitrateKbps(rep: Representation): number {
  return typeof rep.bitrateInKbit === "number"
    ? rep.bitrateInKbit
    : Math.round((rep.bandwidth ?? 0) / 1000);
}

// Tao nhan do phan giai "WxH"
export function getResolutionLabel(rep: Representation): string {
  return rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
}

interface UseStreamMetricsArgs {
  updateStats: (updater: (prev: StreamStats) => StreamStats) => void;
  statsRef: React.RefObject<StreamStats>;
}

export function useStreamMetrics({ updateStats, statsRef }: UseStreamMetricsArgs) {
  // Mau throughput gan day (cua so truot 10s)
  const segmentSamplesRef = useRef<Array<{ atMs: number; bits: number; durationMs: number; kbps: number }>>([]);
  // SDT truoc do — de tinh jitter
  const prevSDTRef = useRef<number | null>(null);
  // Dem so lan chuyen quality
  const qualitySwitchCountRef = useRef(0);
  // Mau FPS truoc do
  const frameSampleRef = useRef<{ timeSec: number; totalFrames: number } | null>(null);

  // Xu ly khi tai xong mot segment — tinh SDT, TTFB, Jitter, Throughput
  const processSegment = useCallback((req: any, event: any) => {
    // === LAY BYTES ===
    let bytesLoaded = 0;
    if (Number.isFinite(req?.bytesLoaded) && req.bytesLoaded > 0) {
      bytesLoaded = req.bytesLoaded;
    } else if (Number.isFinite(req?.bytesTotal) && req.bytesTotal > 0) {
      bytesLoaded = req.bytesTotal;
    } else if (event?.response instanceof ArrayBuffer) {
      bytesLoaded = event.response.byteLength;
    } else if (Number.isFinite(event?.response?.byteLength) && event.response.byteLength > 0) {
      bytesLoaded = event.response.byteLength;
    }

    // === LAY THOI GIAN ===
    let startTime = 0;
    let endTime = 0;

    // Uu tien req.startDate (dash.js v5+)
    if (req?.startDate) {
      startTime = req.startDate instanceof Date ? req.startDate.getTime() : new Date(req.startDate).getTime();
    }
    if (!startTime && req?.requestStartDate) {
      startTime = new Date(req.requestStartDate).getTime();
    }
    if (!startTime && req?.firstByteDate) {
      startTime = req.firstByteDate instanceof Date ? req.firstByteDate.getTime() : new Date(req.firstByteDate).getTime();
    }

    if (req?.endDate) {
      endTime = req.endDate instanceof Date ? req.endDate.getTime() : new Date(req.endDate).getTime();
    }
    if (!endTime && req?.requestEndDate) {
      endTime = new Date(req.requestEndDate).getTime();
    }
    if (!endTime) endTime = Date.now();

    let durationMs = startTime > 0 && endTime > startTime ? endTime - startTime : 0;

    // Fallback: trace array tu dash.js
    if (durationMs === 0 && Array.isArray(req?.trace) && req.trace.length > 0) {
      let traceDuration = 0;
      for (const t of req.trace) traceDuration += (t.d ?? t.duration ?? 0);
      if (traceDuration > 0) durationMs = traceDuration;
    }

    // Fallback: Performance Resource Timing API
    if (durationMs === 0 && req?.url) {
      try {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].name.includes(req.url) || req.url.includes(entries[i].name)) {
            const perfDur = entries[i].responseEnd - entries[i].requestStart;
            if (perfDur > 0) { durationMs = Math.round(perfDur); break; }
          }
        }
      } catch { /* Performance API khong kha dung */ }
    }

    if (bytesLoaded === 0) return { bytesLoaded: 0, durationMs: 0 };

    const downloadSpeedKbps = durationMs > 0 ? (bytesLoaded * 8) / durationMs : 0;

    // Luu mau throughput
    if (downloadSpeedKbps > 0) {
      const nowMs = Date.now();
      segmentSamplesRef.current.push({
        atMs: nowMs,
        bits: bytesLoaded * 8,
        durationMs,
        kbps: downloadSpeedKbps,
      });
      segmentSamplesRef.current = segmentSamplesRef.current.filter((s) => nowMs - s.atMs <= 10_000);
    }

    // JITTER = |SDT_hien_tai - SDT_truoc|
    let jitterMs = 0;
    if (durationMs > 0 && prevSDTRef.current !== null) {
      jitterMs = Math.abs(durationMs - prevSDTRef.current);
    }
    if (durationMs > 0) prevSDTRef.current = durationMs;

    // TTFB tu Performance API, fallback dash.js
    let ttfbMs = 0;
    if (req?.url) ttfbMs = getTTFBFromPerformanceAPI(req.url);
    if (ttfbMs === 0 && req?.firstByteDate && startTime > 0) {
      const firstByteTime = req.firstByteDate instanceof Date
        ? req.firstByteDate.getTime()
        : new Date(req.firstByteDate).getTime();
      if (firstByteTime > startTime) ttfbMs = Math.round(firstByteTime - startTime);
    }

    updateStats((prev) => ({
      ...prev,
      lastSegmentDurationMs: durationMs,
      downloadSpeedKbps,
      jitterMs,
      ttfbMs,
    }));

    return { bytesLoaded, durationMs };
  }, [updateStats]);

  // Tang dem chuyen quality
  const incrementQualitySwitch = useCallback(() => {
    qualitySwitchCountRef.current += 1;
    updateStats((prev) => ({ ...prev, qualitySwitchCount: qualitySwitchCountRef.current }));
    return qualitySwitchCountRef.current;
  }, [updateStats]);

  // Polling: cap nhat stats realtime tu player va video element
  const pollStats = useCallback((
    video: HTMLVideoElement,
    player: MediaPlayerClass,
    stallAccumulatedMs: number,
  ) => {
    try {
      const vq = video.getVideoPlaybackQuality?.();
      const bufferRaw = player.getBufferLength("video");
      const bufferSeconds = typeof bufferRaw === "number" ? bufferRaw : 0;

      // FPS = delta(frames) / delta(time)
      let fps = 0;
      if (vq && Number.isFinite(video.currentTime)) {
        const totalFrames = vq.totalVideoFrames ?? 0;
        const nowSec = video.currentTime;
        const prev = frameSampleRef.current;
        if (prev && nowSec > prev.timeSec && totalFrames >= prev.totalFrames) {
          fps = parseFloat(((totalFrames - prev.totalFrames) / (nowSec - prev.timeSec)).toFixed(1));
        }
        frameSampleRef.current = { timeSec: nowSec, totalFrames };
      }

      // Throughput trung binh trong cua so truot 10s
      let avgThroughputKbps = 0;
      const nowMs = Date.now();
      const recentSamples = segmentSamplesRef.current
        .filter((s) => nowMs - s.atMs <= 10_000);

      if (recentSamples.length > 0) {
        const totalBits = recentSamples.reduce((sum, s) => sum + s.bits, 0);
        const totalDurationMs = recentSamples.reduce((sum, s) => sum + s.durationMs, 0);
        avgThroughputKbps = totalDurationMs > 0 ? totalBits / totalDurationMs : 0;
      } else {
        try {
          const t = player.getAverageThroughput?.("video");
          if (typeof t === "number" && t > 0) avgThroughputKbps = t;
        } catch { /* API khong kha dung */ }
      }

      const currentTime = video.currentTime ?? 0;
      const duration = video.duration ?? 0;
      const protocolLabel = detectProtocol("/media");
      const networkType = getNetworkType();

      // Rebuffering Ratio = tongStallMs / tongPlaybackMs
      const totalPlaybackMs = currentTime * 1000;
      const rebufferingRatio = totalPlaybackMs > 0
        ? Math.round((stallAccumulatedMs / totalPlaybackMs) * 10000) / 10000
        : 0;

      updateStats((prev) => ({
        ...prev,
        bufferSeconds,
        avgThroughputKbps,
        fps,
        droppedFrames: vq?.droppedVideoFrames ?? 0,
        currentTime,
        duration: Number.isFinite(duration) ? duration : 0,
        protocolLabel,
        networkType,
        rebufferingRatio,
      }));
    } catch { /* player da bi huy */ }
  }, [updateStats]);

  // Reset toan bo
  const reset = useCallback(() => {
    segmentSamplesRef.current = [];
    prevSDTRef.current = null;
    qualitySwitchCountRef.current = 0;
    frameSampleRef.current = null;
  }, []);

  return useMemo(() => ({ processSegment, incrementQualitySwitch, pollStats, reset }),
    [processSegment, incrementQualitySwitch, pollStats, reset]);
}
