import { useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { StreamStats } from "../type/dashPlayer";
import { detectProtocol, getNetworkType } from "../utils/performanceApi";
import {
  calculateAverageThroughputKbps,
  calculateLossProxyRate,
  calculateSegmentQosMetrics,
  type SegmentSample,
} from "../utils/qosMetrics";
import {
  calculateAverageBitrate,
  calculateFps,
  calculateFrozenFrame,
  calculateQualitySwitchTotals,
  calculateRebufferingRatio,
  calculateStartupDelayMs,
  type BitrateSample,
  type FrameSample,
  type FrozenSample,
  type QualitySwitchDirection,
} from "../utils/qoeMetrics";

export function getRepBitrateKbps(rep: Representation): number {
  return typeof rep.bitrateInKbit === "number"
    ? rep.bitrateInKbit
    : Math.round((rep.bandwidth ?? 0) / 1000);
}

export function getResolutionLabel(rep: Representation): string {
  return rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
}

interface UseStreamMetricsArgs {
  updateStats: (updater: (prev: StreamStats) => StreamStats) => void;
  statsRef: RefObject<StreamStats>;
  protocolUrlFragment?: string;
}

export function useStreamMetrics({ updateStats, statsRef, protocolUrlFragment }: UseStreamMetricsArgs) {
  const segmentSamplesRef = useRef<SegmentSample[]>([]);
  const previousSegmentDurationRef = useRef<number | null>(null);
  const qualitySwitchCountRef = useRef(0);
  const qualityUpSwitchCountRef = useRef(0);
  const qualityDownSwitchCountRef = useRef(0);
  const frameSampleRef = useRef<FrameSample | null>(null);
  const fragmentRequestCountRef = useRef(0);
  const failedFragmentRequestCountRef = useRef(0);
  const abandonedFragmentRequestCountRef = useRef(0);
  const playRequestedAtMsRef = useRef<number | null>(null);
  const bitrateIntegralRef = useRef(0);
  const bitrateObservedMsRef = useRef(0);
  const bitrateSampleRef = useRef<BitrateSample | null>(null);
  const frozenSampleRef = useRef<FrozenSample | null>(null);
  const frozenFrameCountRef = useRef(0);

  const updateLossProxy = useCallback(() => {
    const total = fragmentRequestCountRef.current;
    const failed = failedFragmentRequestCountRef.current;
    const abandoned = abandonedFragmentRequestCountRef.current;
    const lossProxyRate = calculateLossProxyRate(total, failed, abandoned);
    updateStats((prev) => ({
      ...prev,
      fragmentRequestCount: total,
      failedFragmentRequestCount: failed,
      abandonedFragmentRequestCount: abandoned,
      lossProxyRate,
    }));
  }, [updateStats]);

  const recordFragmentRequest = useCallback(() => {
    fragmentRequestCountRef.current += 1;
    updateLossProxy();
  }, [updateLossProxy]);

  const recordFragmentFailure = useCallback(() => {
    failedFragmentRequestCountRef.current += 1;
    updateLossProxy();
  }, [updateLossProxy]);

  const recordFragmentAbandon = useCallback(() => {
    abandonedFragmentRequestCountRef.current += 1;
    updateLossProxy();
  }, [updateLossProxy]);

  const markPlayRequested = useCallback(() => {
    if (playRequestedAtMsRef.current === null) {
      playRequestedAtMsRef.current = performance.now();
    }
  }, []);

  const markFirstFrame = useCallback(() => {
    if (playRequestedAtMsRef.current === null || statsRef.current.startupDelayMs > 0) return;
    const startupDelayMs = calculateStartupDelayMs(playRequestedAtMsRef.current);
    updateStats((prev) => ({ ...prev, startupDelayMs }));
  }, [statsRef, updateStats]);

  const processSegment = useCallback((req: any, event: any) => {
    // QoS: tinh metric theo tung segment: toc do tai, goodput, jitter, TTFB, overhead, DNS/TCP/TLS/setup.
    const segmentMetrics = calculateSegmentQosMetrics({
      req,
      event,
      previousSegmentDurationMs: previousSegmentDurationRef.current,
    });
    const { bytesLoaded, durationMs } = segmentMetrics;
    if (bytesLoaded === 0) return { bytesLoaded: 0, durationMs: 0 };

    if (segmentMetrics.downloadSpeedKbps > 0) {
      const nowMs = Date.now();
      segmentSamplesRef.current.push({
        atMs: nowMs,
        bits: bytesLoaded * 8,
        durationMs,
        kbps: segmentMetrics.downloadSpeedKbps,
      });
      segmentSamplesRef.current = segmentSamplesRef.current.filter((sample) => nowMs - sample.atMs <= 10_000);
    }

    if (durationMs > 0) previousSegmentDurationRef.current = durationMs;

    updateStats((prev) => ({
      ...prev,
      lastSegmentDurationMs: durationMs,
      downloadSpeedKbps: segmentMetrics.downloadSpeedKbps,
      goodputKbps: segmentMetrics.goodputKbps,
      jitterMs: segmentMetrics.jitterMs,
      ttfbMs: segmentMetrics.ttfbMs,
      overheadRatio: segmentMetrics.overheadRatio,
      dnsMs: segmentMetrics.dnsMs,
      tcpMs: segmentMetrics.tcpMs,
      tlsMs: segmentMetrics.tlsMs,
      connectionSetupMs: segmentMetrics.connectionSetupMs,
    }));

    return { bytesLoaded, durationMs };
  }, [updateStats]);

  const incrementQualitySwitch = useCallback((direction: QualitySwitchDirection = "unknown") => {
    // QoE: tinh so lan doi chat luong, gom tong so lan va so lan tang/giam chat luong.
    const totals = calculateQualitySwitchTotals(direction, {
      qualitySwitchCount: qualitySwitchCountRef.current,
      qualityUpSwitchCount: qualityUpSwitchCountRef.current,
      qualityDownSwitchCount: qualityDownSwitchCountRef.current,
    });
    qualitySwitchCountRef.current = totals.qualitySwitchCount;
    qualityUpSwitchCountRef.current = totals.qualityUpSwitchCount;
    qualityDownSwitchCountRef.current = totals.qualityDownSwitchCount;
    updateStats((prev) => ({
      ...prev,
      qualitySwitchCount: qualitySwitchCountRef.current,
      qualityUpSwitchCount: qualityUpSwitchCountRef.current,
      qualityDownSwitchCount: qualityDownSwitchCountRef.current,
    }));
    return qualitySwitchCountRef.current;
  }, [updateStats]);

  const pollStats = useCallback((
    video: HTMLVideoElement,
    player: MediaPlayerClass,
    stallAccumulatedMs: number,
  ) => {
    try {
      const playbackQuality = video.getVideoPlaybackQuality?.();
      const bufferRaw = player.getBufferLength("video");
      const bufferSeconds = typeof bufferRaw === "number" ? bufferRaw : 0;
      const currentTime = video.currentTime ?? 0;
      const duration = video.duration ?? 0;

      // QoE: tinh FPS tu do lech so frame render tren do lech thoi gian phat.
      const fpsResult = calculateFps(playbackQuality, currentTime, frameSampleRef.current);
      frameSampleRef.current = fpsResult.nextSample;

      // QoS: tinh throughput trung binh tren cac segment vua tai gan day.
      const nowMs = Date.now();
      const recentSamples = segmentSamplesRef.current.filter((sample) => nowMs - sample.atMs <= 10_000);
      const avgThroughputKbps = calculateAverageThroughputKbps(recentSamples, player);

      const perfNow = performance.now();
      const protocolLabel = detectProtocol(protocolUrlFragment);
      const networkType = getNetworkType();

      // QoE: tinh bitrate trung binh co trong so theo thoi gian xem that.
      const bitrateResult = calculateAverageBitrate({
        previousSample: bitrateSampleRef.current,
        currentBitrateKbps: statsRef.current.bitrateKbps,
        currentTimeMs: perfNow,
        shouldAccumulate: !video.paused && !video.ended,
        bitrateIntegralKbpsMs: bitrateIntegralRef.current,
        bitrateObservedMs: bitrateObservedMsRef.current,
      });
      bitrateIntegralRef.current = bitrateResult.bitrateIntegralKbpsMs;
      bitrateObservedMsRef.current = bitrateResult.bitrateObservedMs;
      bitrateSampleRef.current = bitrateResult.nextSample;

      // QoE: phat hien frozen frame xap xi khi video dang phat nhung media time gan nhu khong doi.
      const frozenResult = calculateFrozenFrame({
        previousSample: frozenSampleRef.current,
        currentTime,
        currentTimeMs: perfNow,
        isVideoAdvancing: !video.paused && !video.ended && video.readyState >= 2,
        currentFrozenFrameCount: frozenFrameCountRef.current,
      });
      frozenFrameCountRef.current = frozenResult.frozenFrameCount;
      frozenSampleRef.current = frozenResult.nextSample;

      if (playRequestedAtMsRef.current !== null && statsRef.current.startupDelayMs === 0 && currentTime > 0) {
        markFirstFrame();
      }

      // QoE: tinh ty le rebuffering bang tong thoi gian stall chia cho tong thoi gian phien xem do duoc.
      const rebufferingRatio = calculateRebufferingRatio(currentTime, stallAccumulatedMs);

      updateStats((prev) => ({
        ...prev,
        bufferSeconds,
        avgThroughputKbps,
        averageBitrateKbps: bitrateResult.averageBitrateKbps,
        fps: fpsResult.fps,
        droppedFrames: playbackQuality?.droppedVideoFrames ?? 0,
        frozenFrameCount: frozenFrameCountRef.current,
        currentTime,
        duration: Number.isFinite(duration) ? duration : 0,
        protocolLabel,
        networkType,
        rebufferingRatio,
      }));
    } catch {
      return;
    }
  }, [markFirstFrame, protocolUrlFragment, statsRef, updateStats]);

  const reset = useCallback(() => {
    segmentSamplesRef.current = [];
    previousSegmentDurationRef.current = null;
    qualitySwitchCountRef.current = 0;
    qualityUpSwitchCountRef.current = 0;
    qualityDownSwitchCountRef.current = 0;
    frameSampleRef.current = null;
    fragmentRequestCountRef.current = 0;
    failedFragmentRequestCountRef.current = 0;
    abandonedFragmentRequestCountRef.current = 0;
    playRequestedAtMsRef.current = null;
    bitrateIntegralRef.current = 0;
    bitrateObservedMsRef.current = 0;
    bitrateSampleRef.current = null;
    frozenSampleRef.current = null;
    frozenFrameCountRef.current = 0;
  }, []);

  return useMemo(() => ({
    processSegment,
    incrementQualitySwitch,
    pollStats,
    recordFragmentRequest,
    recordFragmentFailure,
    recordFragmentAbandon,
    markPlayRequested,
    markFirstFrame,
    reset,
  }), [
    processSegment,
    incrementQualitySwitch,
    pollStats,
    recordFragmentRequest,
    recordFragmentFailure,
    recordFragmentAbandon,
    markPlayRequested,
    markFirstFrame,
    reset,
  ]);
}
