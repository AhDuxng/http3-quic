export type QualitySwitchDirection = "up" | "down" | "same" | "unknown";

export interface FrameSample {
  timeSec: number;
  totalFrames: number;
}

export interface BitrateSample {
  mediaTimeSec: number;
  bitrateKbps: number;
}

export interface FrozenSample {
  atMs: number;
  currentTime: number;
  isFrozen: boolean;
}

export interface QualitySwitchTotals {
  qualitySwitchCount: number;
  qualityUpSwitchCount: number;
  qualityDownSwitchCount: number;
}

export function calculateStartupDelayMs(playRequestedAtMs: number | null, nowMs = performance.now()) {
  // QoE: do tre khoi phat = thoi diem frame dau tien hien thi - thoi diem nguoi dung bam play.
  return playRequestedAtMs === null ? 0 : Math.max(0, Math.round(nowMs - playRequestedAtMs));
}

export function calculateQualitySwitchTotals(
  direction: QualitySwitchDirection,
  current: QualitySwitchTotals,
): QualitySwitchTotals {
  // QoE: dem so lan ABR doi chat luong da render, tach rieng so lan tang/giam chat luong.
  if (direction !== "up" && direction !== "down") return current;

  return {
    qualitySwitchCount: current.qualitySwitchCount + 1,
    qualityUpSwitchCount: current.qualityUpSwitchCount + (direction === "up" ? 1 : 0),
    qualityDownSwitchCount: current.qualityDownSwitchCount + (direction === "down" ? 1 : 0),
  };
}

export function calculateFps(
  playbackQuality: VideoPlaybackQuality | undefined,
  currentTime: number,
  previousSample: FrameSample | null,
) {
  // QoE: FPS = so frame render them / do lech thoi gian phat.
  const totalFrames = playbackQuality?.totalVideoFrames ?? 0;
  if (!previousSample || currentTime <= previousSample.timeSec || totalFrames < previousSample.totalFrames) {
    return { fps: 0, nextSample: { timeSec: currentTime, totalFrames } };
  }

  return {
    fps: parseFloat(((totalFrames - previousSample.totalFrames) / (currentTime - previousSample.timeSec)).toFixed(1)),
    nextSample: { timeSec: currentTime, totalFrames },
  };
}

export function calculateAverageBitrate(args: {
  previousSample: BitrateSample | null;
  currentBitrateKbps: number;
  currentMediaTimeSec: number;
  bitrateIntegralKbpsSec: number;
  bitrateObservedSec: number;
}) {
  // Tinh bitrate theo thoi gian media chay.
  let bitrateIntegralKbpsSec = args.bitrateIntegralKbpsSec;
  let bitrateObservedSec = args.bitrateObservedSec;

  if (args.previousSample && args.previousSample.bitrateKbps > 0) {
    const mediaElapsedSec = args.currentMediaTimeSec - args.previousSample.mediaTimeSec;
    if (mediaElapsedSec > 0 && mediaElapsedSec < 10) {
      bitrateIntegralKbpsSec += args.previousSample.bitrateKbps * mediaElapsedSec;
      bitrateObservedSec += mediaElapsedSec;
    }
  }

  return {
    bitrateIntegralKbpsSec,
    bitrateObservedSec,
    averageBitrateKbps: bitrateObservedSec > 0
      ? bitrateIntegralKbpsSec / bitrateObservedSec
      : args.currentBitrateKbps,
    nextSample: {
      mediaTimeSec: args.currentMediaTimeSec,
      bitrateKbps: args.currentBitrateKbps,
    },
  };
}

export function calculateFrozenFrame(args: {
  previousSample: FrozenSample | null;
  currentTime: number;
  currentTimeMs: number;
  isVideoAdvancing: boolean;
  currentFreezeEventCount: number;
}) {
  // Moi dot dung hinh chi dem mot lan, bo qua rebuffer.
  if (!args.isVideoAdvancing) {
    return {
      freezeEventCount: args.currentFreezeEventCount,
      nextSample: { atMs: args.currentTimeMs, currentTime: args.currentTime, isFrozen: false },
    };
  }

  if (
    args.previousSample
    && !args.previousSample.isFrozen
    && Math.abs(args.currentTime - args.previousSample.currentTime) < 0.03
    && args.currentTimeMs - args.previousSample.atMs > 2500
  ) {
    return {
      freezeEventCount: args.currentFreezeEventCount + 1,
      nextSample: { ...args.previousSample, isFrozen: true },
    };
  }

  if (!args.previousSample || Math.abs(args.currentTime - args.previousSample.currentTime) >= 0.03) {
    return {
      freezeEventCount: args.currentFreezeEventCount,
      nextSample: { atMs: args.currentTimeMs, currentTime: args.currentTime, isFrozen: false },
    };
  }

  return {
    freezeEventCount: args.currentFreezeEventCount,
    nextSample: args.previousSample,
  };
}

export function calculateRebufferingRatio(totalPlaybackSec: number, stallAccumulatedMs: number) {
  // QoE: ty le rebuffering = tong thoi gian stall / (thoi gian dang phat + tong thoi gian stall).
  const playbackMs = totalPlaybackSec * 1000;
  const measuredSessionMs = playbackMs + stallAccumulatedMs;
  return measuredSessionMs > 0
    ? Math.round((stallAccumulatedMs / measuredSessionMs) * 10000) / 10000
    : 0;
}
