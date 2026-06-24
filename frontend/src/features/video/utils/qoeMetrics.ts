export type QualitySwitchDirection = "up" | "down" | "same" | "unknown";

export interface FrameSample {
  timeSec: number;
  totalFrames: number;
}

export interface BitrateSample {
  atMs: number;
  bitrateKbps: number;
}

export interface FrozenSample {
  atMs: number;
  currentTime: number;
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
  currentTimeMs: number;
  shouldAccumulate: boolean;
  bitrateIntegralKbpsMs: number;
  bitrateObservedMs: number;
}) {
  // QoE: bitrate trung binh co trong so thoi gian = tong(bitrate_i * thoi_luong_i) / tong thoi gian quan sat.
  let bitrateIntegralKbpsMs = args.bitrateIntegralKbpsMs;
  let bitrateObservedMs = args.bitrateObservedMs;

  if (args.previousSample && args.shouldAccumulate && args.previousSample.bitrateKbps > 0) {
    const elapsedMs = args.currentTimeMs - args.previousSample.atMs;
    if (elapsedMs > 0 && elapsedMs < 10_000) {
      bitrateIntegralKbpsMs += args.previousSample.bitrateKbps * elapsedMs;
      bitrateObservedMs += elapsedMs;
    }
  }

  return {
    bitrateIntegralKbpsMs,
    bitrateObservedMs,
    averageBitrateKbps: bitrateObservedMs > 0
      ? bitrateIntegralKbpsMs / bitrateObservedMs
      : args.currentBitrateKbps,
    nextSample: {
      atMs: args.currentTimeMs,
      bitrateKbps: args.currentBitrateKbps,
    },
  };
}

export function calculateFrozenFrame(args: {
  previousSample: FrozenSample | null;
  currentTime: number;
  currentTimeMs: number;
  isVideoAdvancing: boolean;
  currentFrozenFrameCount: number;
}) {
  // QoE: frozen frame xap xi tang khi thoi gian thuc troi qua nhung media time gan nhu dung yen.
  if (!args.isVideoAdvancing) {
    return {
      frozenFrameCount: args.currentFrozenFrameCount,
      nextSample: { atMs: args.currentTimeMs, currentTime: args.currentTime },
    };
  }

  if (
    args.previousSample
    && Math.abs(args.currentTime - args.previousSample.currentTime) < 0.03
    && args.currentTimeMs - args.previousSample.atMs > 2500
  ) {
    return {
      frozenFrameCount: args.currentFrozenFrameCount + 1,
      nextSample: { atMs: args.currentTimeMs, currentTime: args.currentTime },
    };
  }

  if (!args.previousSample || Math.abs(args.currentTime - args.previousSample.currentTime) >= 0.03) {
    return {
      frozenFrameCount: args.currentFrozenFrameCount,
      nextSample: { atMs: args.currentTimeMs, currentTime: args.currentTime },
    };
  }

  return {
    frozenFrameCount: args.currentFrozenFrameCount,
    nextSample: args.previousSample,
  };
}

export function calculateRebufferingRatio(currentTimeSec: number, stallAccumulatedMs: number) {
  // QoE: ty le rebuffering = tong thoi gian stall / (thoi gian dang phat + tong thoi gian stall).
  const playbackMs = currentTimeSec * 1000;
  const measuredSessionMs = playbackMs + stallAccumulatedMs;
  return measuredSessionMs > 0
    ? Math.round((stallAccumulatedMs / measuredSessionMs) * 10000) / 10000
    : 0;
}
