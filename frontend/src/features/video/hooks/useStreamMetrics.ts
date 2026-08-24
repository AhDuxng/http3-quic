import { useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { StreamStats } from "../type/dashPlayer";
import { detectProtocol, getNetworkType } from "../utils/performanceApi";
import {
  calculateAverageThroughputKbps,
  calculateFragmentFailureOrAbandonRate,
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
  const bitrateObservedSecRef = useRef(0);
  const bitrateSampleRef = useRef<BitrateSample | null>(null);
  const frozenSampleRef = useRef<FrozenSample | null>(null);
  const freezeEventCountRef = useRef(0);
  const completedPlaybackTimeRef = useRef(0);

  const updateLossProxy = useCallback(() => {
    const total = fragmentRequestCountRef.current;
    const failed = failedFragmentRequestCountRef.current;
    const abandoned = abandonedFragmentRequestCountRef.current;
    const fragmentFailureOrAbandonRate = calculateFragmentFailureOrAbandonRate(total, failed, abandoned);
    updateStats((prev) => ({
      ...prev,
      fragmentRequestCount: total,
      failedFragmentRequestCount: failed,
      abandonedFragmentRequestCount: abandoned,
      fragmentFailureOrAbandonRate,
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

  const markFirstFrame = useCallback((renderedAtMs = performance.now()) => {
    if (playRequestedAtMsRef.current === null || statsRef.current.startupDelayMs > 0) return;
    const startupDelayMs = calculateStartupDelayMs(playRequestedAtMsRef.current, renderedAtMs);
    updateStats((prev) => ({ ...prev, startupDelayMs }));
  }, [statsRef, updateStats]);

  const processSegment = useCallback((
    req: any,
    event: any,
    wallDurationMs?: number | null,
    dashHttpRequest?: any,
    commit = true,
  ) => {
    // Chi do request, khong do mat goi hay overhead transport.
    const segmentMetrics = calculateSegmentQosMetrics({
      req,
      event,
      wallDurationMs,
      previousSegmentDurationMs: previousSegmentDurationRef.current,
      resourcePrefix: protocolUrlFragment,
      dashHttpRequest,
    });
    const { bytesLoaded, durationMs } = segmentMetrics;
    if (!commit || bytesLoaded === 0) return segmentMetrics;

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
      payloadRateKbps: segmentMetrics.payloadRateKbps,
      segmentDownloadTimeVariationMs: segmentMetrics.segmentDownloadTimeVariationMs,
      ttfbMs: segmentMetrics.ttfbMs,
      dnsMs: segmentMetrics.dnsMs,
      connectMs: segmentMetrics.connectMs,
      secureHandshakeMs: segmentMetrics.secureHandshakeMs,
      connectionSetupMs: segmentMetrics.connectionSetupMs,
    }));

    return segmentMetrics;
  }, [protocolUrlFragment, updateStats]);

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
      const dashMetrics = player.getDashMetrics();
      const bufferRaw = dashMetrics.getCurrentBufferLevel("video");
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
        currentMediaTimeSec: currentTime,
        bitrateIntegralKbpsSec: bitrateIntegralRef.current,
        bitrateObservedSec: bitrateObservedSecRef.current,
      });
      bitrateIntegralRef.current = bitrateResult.bitrateIntegralKbpsSec;
      bitrateObservedSecRef.current = bitrateResult.bitrateObservedSec;
      bitrateSampleRef.current = bitrateResult.nextSample;

      // QoE: phat hien frozen frame xap xi khi video dang phat nhung media time gan nhu khong doi.
      const frozenResult = calculateFrozenFrame({
        previousSample: frozenSampleRef.current,
        currentTime,
        currentTimeMs: perfNow,
        isVideoAdvancing: !video.paused
          && !video.ended
          && !video.seeking
          && video.readyState >= 2
          && bufferSeconds > 0.05,
        currentFreezeEventCount: freezeEventCountRef.current,
      });
      freezeEventCountRef.current = frozenResult.freezeEventCount;
      frozenSampleRef.current = frozenResult.nextSample;

      if (playRequestedAtMsRef.current !== null && statsRef.current.startupDelayMs === 0 && currentTime > 0) {
        markFirstFrame();
      }

      // QoE: tinh ty le rebuffering bang tong thoi gian stall chia cho tong thoi gian phien xem do duoc.
      const totalPlaybackTime = completedPlaybackTimeRef.current + currentTime;
      const rebufferingRatio = calculateRebufferingRatio(totalPlaybackTime, stallAccumulatedMs);

      updateStats((prev) => ({
        ...prev,
        bufferSeconds,
        avgThroughputKbps,
        averageBitrateKbps: bitrateResult.averageBitrateKbps,
        fps: fpsResult.fps,
        droppedFrames: playbackQuality?.droppedVideoFrames ?? 0,
        freezeEventCount: freezeEventCountRef.current,
        currentTime,
        duration: Number.isFinite(duration) ? duration : 0,
        totalPlaybackTime,
        protocolLabel,
        networkType,
        rebufferingRatio,
        stallDurationMs: stallAccumulatedMs,
      }));
    } catch {
      return;
    }
  }, [markFirstFrame, protocolUrlFragment, statsRef, updateStats]);

  const completeReplay = useCallback((playbackTimeSec: number, stallAccumulatedMs: number) => {
    const completedSeconds = Number.isFinite(playbackTimeSec) && playbackTimeSec > 0
      ? playbackTimeSec
      : 0;
    completedPlaybackTimeRef.current += completedSeconds;
    updateStats((prev) => ({
      ...prev,
      totalPlaybackTime: completedPlaybackTimeRef.current,
      rebufferingRatio: calculateRebufferingRatio(
        completedPlaybackTimeRef.current,
        stallAccumulatedMs,
      ),
    }));
  }, [updateStats]);

  const beginReplay = useCallback(() => {
    // Dat lai mau rieng cua moi replay.
    segmentSamplesRef.current = [];
    previousSegmentDurationRef.current = null;
    frameSampleRef.current = null;
    bitrateSampleRef.current = null;
    frozenSampleRef.current = null;
    playRequestedAtMsRef.current = null;
    updateStats((prev) => ({ ...prev, startupDelayMs: 0, currentTime: 0 }));
  }, [updateStats]);

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
    bitrateObservedSecRef.current = 0;
    bitrateSampleRef.current = null;
    frozenSampleRef.current = null;
    freezeEventCountRef.current = 0;
    completedPlaybackTimeRef.current = 0;
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
    beginReplay,
    completeReplay,
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
    beginReplay,
    completeReplay,
    reset,
  ]);
}
