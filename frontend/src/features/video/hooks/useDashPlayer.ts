import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPlayer } from "dashjs";
import type { MediaPlayerClass, QualityChangeRenderedEvent, Representation } from "dashjs";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import type {
  QualitySelection, StreamStats, LogEntry, LogLevel, SegmentQosRecord, PlaybackQoeSample,
  UseDashPlayerArgs, UseDashPlayerResult,
} from "../type/dashPlayer";
import { statsPollIntervalMs, netLogThrottleMs, defaultStats } from "../constants/dashPlayer";
import { formatTimestamp } from "../utils/formatters";
import { formatBitrateKbps } from "../utils/formatters";
import { detectProtocol, formatNextHopProtocol, getNetworkType } from "../utils/performanceApi";
import { getRepBitrateKbps, getResolutionLabel, useStreamMetrics } from "./useStreamMetrics";
import { useStallTracker } from "./useStallTracker";

const defaultReplayCount = 1;
const dashRetryPolicy = {
  intervalsMs: {
    manifest: 1_000,
    initializationSegment: 1_500,
    mediaSegment: 1_500,
  },
  attempts: {
    manifest: 5,
    initializationSegment: 5,
    mediaSegment: 6,
  },
} as const;

const dashFragmentErrorCodes = new Set([17, 18, 27]);

function getRequestUrl(request: any) {
  return request?.url ?? "unknown";
}

function getFragmentTrackingKey(request: any) {
  const rawUrl = getRequestUrl(request);
  try {
    const url = new URL(rawUrl, window.location.href);
    // Bo tham so thu nghiem de gom cac lan retry.
    url.searchParams.delete("exp_run");
    url.searchParams.delete("exp_req");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function getLatestDashHttpRequest(player: MediaPlayerClass, request: any) {
  try {
    const requests = player.getDashMetrics().getHttpRequests("video");
    const targetKey = getFragmentTrackingKey(request);
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      const candidate = requests[index] as any;
      if (getFragmentTrackingKey(candidate) === targetKey) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function getRequestType(request: any) {
  return String(request?.type ?? "").toLowerCase();
}

function isVideoMediaRequest(request: any) {
  if (!request) return false;
  return request.mediaType === "video" && getRequestType(request) === "mediasegment";
}

function getRequestRepresentation(
  player: MediaPlayerClass,
  request: any,
  dashHttpRequest: any,
) {
  const rawQualityIndex = request?.quality ?? dashHttpRequest?._quality;
  const qualityIndex = rawQualityIndex !== undefined
    && rawQualityIndex !== null
    && rawQualityIndex !== ""
    && Number.isInteger(Number(rawQualityIndex))
    ? Number(rawQualityIndex)
    : null;
  const directId = request?.representationId;
  if (directId !== undefined && directId !== null && String(directId).trim()) {
    return { representationId: String(directId), qualityIndex };
  }

  if (qualityIndex === null) return { representationId: null, qualityIndex };
  try {
    const reps = player.getRepresentationsByType("video");
    const representation = reps.find((rep) => rep.index === qualityIndex) ?? reps[qualityIndex];
    return { representationId: representation?.id ?? null, qualityIndex };
  } catch {
    return { representationId: null, qualityIndex };
  }
}

function isFragmentFailure(errorCode: unknown, message: unknown) {
  return dashFragmentErrorCodes.has(Number(errorCode))
    || String(message ?? "").toLowerCase().includes("fragment");
}

function formatFragmentFailureDetails(event: any) {
  const status = Number(
    event?.error?.data?.response?.status
      ?? event?.response?.status
      ?? event?.request?.responsecode,
  );
  const retryAttempts = Number(event?.request?.retryAttempts);
  const details: string[] = [];
  if (Number.isFinite(status) && status > 0) details.push(`HTTP ${status}`);
  if (Number.isFinite(retryAttempts) && retryAttempts > 0) {
    details.push(`${retryAttempts} retries exhausted`);
  }
  return details.length > 0 ? ` (${details.join(", ")})` : "";
}

function parseSegmentSecondsFromManifest(manifestUrl: string | null | undefined) {
  const segmentDirectoryMatch = manifestUrl?.match(/\/(\d+)sec\//);
  const segmentFilenameMatch = manifestUrl?.match(/_(\d+)s(?:_|\.mpd)/);
  const rawSegment = segmentDirectoryMatch?.[1] ?? segmentFilenameMatch?.[1];
  if (!rawSegment) return null;
  const parsedSegment = Number(rawSegment);
  return Number.isFinite(parsedSegment) && parsedSegment > 0 ? parsedSegment : null;
}

function formatSegmentLabel(segmentSeconds: number | null) {
  return segmentSeconds ? `${segmentSeconds}s` : "—";
}

function getManifestResourcePrefix(manifestUrl: string | null | undefined) {
  const parts = (manifestUrl ?? "").split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "video") {
    return `/${parts.slice(0, 3).join("/")}/`;
  }
  return manifestUrl ?? undefined;
}

function createRepresentationsSignature(representations: Representation[]) {
  return representations
    .map((representation) => [
      representation.id ?? "",
      representation.width ?? 0,
      representation.height ?? 0,
      getRepBitrateKbps(representation),
    ].join(":"))
    .join("|");
}

export function useDashPlayer(args: UseDashPlayerArgs): UseDashPlayerResult {
  const { manifestUrl, scenarios, streamTitle = "Video", segmentSeconds } = args;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<MediaPlayerClass | null>(null);
  const logIdRef = useRef(0);
  const lastNetLogRef = useRef(0);
  const playerSessionIdRef = useRef(0);

  const [representations, setRepresentations] = useState<Representation[]>([]);
  const [qualitySelection, setQualitySelectionState] = useState<QualitySelection>("auto");
  const [isAutoQuality, setIsAutoQuality] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<NetworkScenarioId>("unconfigured");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFragmentLoading, setIsFragmentLoading] = useState(false);
  const [stats, setStats] = useState<StreamStats>(defaultStats);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const segmentQosRecordsRef = useRef<SegmentQosRecord[]>([]);
  const playbackQoeSamplesRef = useRef<PlaybackQoeSample[]>([]);
  const segmentRecordIdRef = useRef(0);
  const playbackSampleIdRef = useRef(0);
  const statsRef = useRef<StreamStats>(defaultStats);
  const isAutoQualityRef = useRef(true);
  const activeScenarioIdRef = useRef<NetworkScenarioId>(activeScenarioId);
  const representationsSignatureRef = useRef("");

  const [replayCount, setReplayCount] = useState(defaultReplayCount);
  const [currentReplay, setCurrentReplay] = useState(1);
  const [isReplayDone, setIsReplayDone] = useState(false);
  const replayCountRef = useRef(replayCount);
  const currentReplayRef = useRef(1);
  const isReplayDoneRef = useRef(false);

  useEffect(() => { replayCountRef.current = replayCount; }, [replayCount]);
  useEffect(() => { currentReplayRef.current = currentReplay; }, [currentReplay]);
  useEffect(() => { isReplayDoneRef.current = isReplayDone; }, [isReplayDone]);

  const scenarioById = useMemo(() => {
    const map = new Map<NetworkScenarioId, NetworkScenario>();
    for (const scenario of scenarios) map.set(scenario.id, scenario);
    return map;
  }, [scenarios]);

  const updateStats = useCallback((updater: (prev: StreamStats) => StreamStats) => {
    if (isReplayDoneRef.current) return;
    const next = updater(statsRef.current);
    if (Object.is(next, statsRef.current)) return;
    statsRef.current = next;
    setStats(next);
  }, []);

  const getStatsSnapshot = useCallback(() => statsRef.current, []);
  const getSegmentQosRecords = useCallback(() => segmentQosRecordsRef.current.slice(), []);
  const getPlaybackQoeSamples = useCallback(() => playbackQoeSamplesRef.current.slice(), []);

  const protocolUrlFragment = useMemo(() => {
    return getManifestResourcePrefix(manifestUrl);
  }, [manifestUrl]);
  const metrics = useStreamMetrics({ updateStats, statsRef, protocolUrlFragment });
  const stall = useStallTracker({ updateStats });
  const logSegmentSeconds = useMemo(
    () => segmentSeconds ?? parseSegmentSecondsFromManifest(manifestUrl),
    [manifestUrl, segmentSeconds],
  );
  const logSegmentLabel = useMemo(() => formatSegmentLabel(logSegmentSeconds), [logSegmentSeconds]);

  const addLog = useCallback((
    level: LogLevel,
    message: string,
    patch?: Partial<StreamStats>,
    sessionId = playerSessionIdRef.current,
  ) => {
    if (isReplayDoneRef.current) return;
    if (sessionId !== playerSessionIdRef.current) return;

    const label = scenarioById.get(activeScenarioIdRef.current)?.label ?? "Not applied";
    const entry: LogEntry = {
      id: ++logIdRef.current,
      replay: currentReplayRef.current,
      timestamp: formatTimestamp(new Date()),
      level, message,
      statsSnapshot: { ...statsRef.current, ...(patch ?? {}) },
      isAutoQuality: isAutoQualityRef.current, activeScenarioLabel: label,
      streamTitle,
      manifestUrl: manifestUrl ?? "",
      segmentSeconds: logSegmentSeconds,
      segmentLabel: logSegmentLabel,
    };
    setLogs((prev) => [entry, ...prev]);
  }, [logSegmentLabel, logSegmentSeconds, manifestUrl, scenarioById, streamTitle]);

  const syncReps = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const reps = player.getRepresentationsByType("video");
      if (Array.isArray(reps) && reps.length > 0) {
        const nextSignature = createRepresentationsSignature(reps);
        if (nextSignature !== representationsSignatureRef.current) {
          representationsSignatureRef.current = nextSignature;
          setRepresentations(reps);
        }
      }
      const current = player.getCurrentRepresentationForType("video");
      if (!current) return;
      const bitrateKbps = getRepBitrateKbps(current);
      const resolutionLabel = getResolutionLabel(current);
      updateStats((prev) => {
        if (prev.bitrateKbps === bitrateKbps && prev.resolutionLabel === resolutionLabel) return prev;
        return { ...prev, bitrateKbps, resolutionLabel };
      });
    } catch {
      return;
    }
  }, [updateStats]);

  const resetMeasurementState = useCallback(() => {
    setStats(defaultStats);
    statsRef.current = defaultStats;
    setLogs([]);
    segmentQosRecordsRef.current = [];
    playbackQoeSamplesRef.current = [];
    segmentRecordIdRef.current = 0;
    playbackSampleIdRef.current = 0;
    setRepresentations([]);
    representationsSignatureRef.current = "";
    metrics.reset();
    stall.reset();
    logIdRef.current = 0;
    lastNetLogRef.current = 0;
    setCurrentReplay(1);
    currentReplayRef.current = 1;
    setIsReplayDone(false);
    isReplayDoneRef.current = false;
    setIsPlaying(false);
    setIsFragmentLoading(false);
  }, [metrics, stall]);

  const resetStats = useCallback(() => {
    resetMeasurementState();

    if (playerRef.current) {
      playerRef.current.seek(0);
      playerRef.current.play();
    }
  }, [resetMeasurementState]);

  useEffect(() => { isAutoQualityRef.current = isAutoQuality; }, [isAutoQuality]);
  useEffect(() => { activeScenarioIdRef.current = activeScenarioId; }, [activeScenarioId]);

  useEffect(() => {
    if (!manifestUrl) return;
    const sessionId = playerSessionIdRef.current + 1;
    playerSessionIdRef.current = sessionId;
    resetMeasurementState();
    const addSessionLog = (level: LogLevel, message: string, patch?: Partial<StreamStats>) => {
      addLog(level, message, patch, sessionId);
    };

    const player = MediaPlayer().create();
    playerRef.current = player;
    const isCurrentSession = () => sessionId === playerSessionIdRef.current && playerRef.current === player;
    const networkConnection = (navigator as any).connection;
    let previousNetworkType = getNetworkType();
    const onNetworkChange = () => {
      if (!isCurrentSession()) return;
      const nextNetworkType = getNetworkType();
      if (nextNetworkType === previousNetworkType) return;
      const oldNetworkType = previousNetworkType;
      previousNetworkType = nextNetworkType;
      addSessionLog(
        "SYS",
        `NETWORK CHANGE: ${oldNetworkType} -> ${nextNetworkType}`,
        { networkType: nextNetworkType },
      );
    };
    networkConnection?.addEventListener?.("change", onNetworkChange);
    const activeFragmentRequests = new Set<unknown>();
    const countedFragmentRequests = new Set<unknown>();
    const terminalFragmentRequests = new Set<unknown>();
    const recordedFragmentRequests = new Set<unknown>();
    const fragmentStartByRequest = new Map<unknown, number>();
    const fragmentStartByKey = new Map<string, number>();
    const markFragmentStarted = (request: unknown) => {
      const startedAt = performance.now();
      if (!fragmentStartByRequest.has(request)) fragmentStartByRequest.set(request, startedAt);
      const key = getFragmentTrackingKey(request);
      if (!fragmentStartByKey.has(key)) fragmentStartByKey.set(key, startedAt);
    };
    const markFragmentFinished = (request: unknown) => {
      activeFragmentRequests.delete(request);
      if (activeFragmentRequests.size === 0) setIsFragmentLoading(false);
      const key = getFragmentTrackingKey(request);
      const requestStartedAt = fragmentStartByRequest.get(request);
      const keyStartedAt = fragmentStartByKey.get(key);
      const startedAt = requestStartedAt === undefined
        ? keyStartedAt
        : keyStartedAt === undefined
          ? requestStartedAt
          : Math.min(requestStartedAt, keyStartedAt);
      fragmentStartByRequest.delete(request);
      fragmentStartByKey.delete(key);
      return startedAt === undefined ? null : Math.max(0, performance.now() - startedAt);
    };
    const recordFragmentFailureOnce = (request: unknown) => {
      if (!request || terminalFragmentRequests.has(request)) return;
      terminalFragmentRequests.add(request);
      metrics.recordFragmentFailure();
    };
    const recordFragmentAbandonOnce = (request: unknown) => {
      if (!request || terminalFragmentRequests.has(request)) return;
      terminalFragmentRequests.add(request);
      metrics.recordFragmentAbandon();
    };
    const runId = crypto.randomUUID();
    let requestId = 0;
    player.addRequestInterceptor(async (request) => {
      if (!request.url.includes("/video/")) return request;

      const requestUrl = new URL(request.url, window.location.href);
      requestUrl.searchParams.set("exp_run", runId);
      requestUrl.searchParams.set("exp_req", String(++requestId));
      request.url = requestUrl.toString();
      return request;
    });
    player.updateSettings({
      streaming: {
        retryIntervals: {
          MPD: dashRetryPolicy.intervalsMs.manifest,
          MediaSegment: dashRetryPolicy.intervalsMs.mediaSegment,
          InitializationSegment: dashRetryPolicy.intervalsMs.initializationSegment,
        },
        retryAttempts: {
          MPD: dashRetryPolicy.attempts.manifest,
          MediaSegment: dashRetryPolicy.attempts.mediaSegment,
          InitializationSegment: dashRetryPolicy.attempts.initializationSegment,
        },
        abr: { autoSwitchBitrate: { video: true }, initialBitrate: { video: 500 } },
      },
    });
    player.initialize(videoRef.current ?? undefined, manifestUrl, false);
    addSessionLog("SYS", `${streamTitle}: player initialized. Loading manifest...`);
    addSessionLog(
      "SYS",
      `Retry policy: MPD ${dashRetryPolicy.attempts.manifest}, init ${dashRetryPolicy.attempts.initializationSegment}, media ${dashRetryPolicy.attempts.mediaSegment}.`,
    );

    const onManifestLoaded = () => {
      if (!isCurrentSession()) return;
      addSessionLog("SYS", `${streamTitle}: manifest loaded.`);
    };

    const onStreamInitialized = () => {
      if (!isCurrentSession()) return;
      syncReps();
      try {
        const reps = player.getRepresentationsByType("video");
        const count = Array.isArray(reps) ? reps.length : 0;
        addSessionLog("SYS", `${streamTitle}: stream initialized. ${count} quality level(s).`);
      } catch {
        return;
      }
    };

    const onQualityRendered = (event: QualityChangeRenderedEvent) => {
      if (!isCurrentSession()) return;
      if (event?.mediaType !== "video") return;
      syncReps();
      try {
        const currentRepresentation = event.newRepresentation
          ?? player.getCurrentRepresentationForType("video");
        if (currentRepresentation) {
          const currentBitrateKbps = getRepBitrateKbps(currentRepresentation);
          const currentPixels = (currentRepresentation.width ?? 0) * (currentRepresentation.height ?? 0);
          const currentKey = currentRepresentation.id
            || `${currentBitrateKbps}:${currentRepresentation.width ?? 0}x${currentRepresentation.height ?? 0}`;
          const oldRepresentation = event.oldRepresentation;
          const oldQuality = oldRepresentation
            ? {
                key: oldRepresentation.id
                  || `${getRepBitrateKbps(oldRepresentation)}:${oldRepresentation.width ?? 0}x${oldRepresentation.height ?? 0}`,
                bitrateKbps: getRepBitrateKbps(oldRepresentation),
                pixels: (oldRepresentation.width ?? 0) * (oldRepresentation.height ?? 0),
              }
            : null;
          const direction = !oldQuality
            ? "unknown"
            : currentKey === oldQuality.key
              ? "same"
              : currentBitrateKbps > oldQuality.bitrateKbps
              ? "up"
              : currentBitrateKbps < oldQuality.bitrateKbps
                ? "down"
                : currentPixels > oldQuality.pixels
                  ? "up"
                  : currentPixels < oldQuality.pixels
                    ? "down"
                    : "lateral";
          const qualityLabel = currentRepresentation.height ? `${currentRepresentation.height}p` : "—";
          if (!oldQuality) {
            addSessionLog("INFO",
              `Initial rendered video quality ${qualityLabel} @ ${formatBitrateKbps(currentBitrateKbps)}.`);
            return;
          }
          if (direction === "same" || direction === "unknown") return;
          const count = metrics.incrementQualitySwitch(direction);
          const directionLabel = direction === "down"
            ? "reduced"
            : direction === "up"
              ? "upgraded"
              : "changed";
          const level = direction === "down" ? "WARN" : "INFO";
          addSessionLog(level as any,
            `Rendered video quality ${directionLabel} to ${qualityLabel} @ ${formatBitrateKbps(currentBitrateKbps)}.`,
            { qualitySwitchCount: count });
        }
      } catch {
        return;
      }
    };

    const recordSegmentQos = (
      request: any,
      event: any,
      wallDurationMs: number | null,
      status: SegmentQosRecord["status"],
    ) => {
      if (!request || !isVideoMediaRequest(request)) return null;
      if (recordedFragmentRequests.has(request)) return null;
      recordedFragmentRequests.add(request);

      const dashHttpRequest = getLatestDashHttpRequest(player, request);
      const measured = metrics.processSegment(
        request,
        event,
        wallDurationMs,
        dashHttpRequest,
        status === "completed",
      );
      const protocolLabel = formatNextHopProtocol(measured.nextHopProtocol);
      const representation = getRequestRepresentation(player, request, dashHttpRequest);
      segmentQosRecordsRef.current.push({
        id: ++segmentRecordIdRef.current,
        replay: currentReplayRef.current,
        timestamp: new Date().toISOString(),
        streamTitle,
        segmentLabel: logSegmentLabel,
        url: getRequestUrl(request),
        mediaType: "video",
        requestType: String(request?.type ?? dashHttpRequest?.type ?? ""),
        representationId: representation.representationId,
        qualityIndex: representation.qualityIndex,
        status,
        responseStatus: measured.responseStatus,
        protocolLabel: protocolLabel === "Detecting..."
          ? detectProtocol(getRequestUrl(request))
          : protocolLabel,
        networkType: getNetworkType(),
        bytesLoaded: measured.bytesLoaded,
        encodedBodySizeBytes: measured.encodedBodySizeBytes,
        transferSizeBytes: measured.transferSizeBytes,
        resourceTimingSizeDeltaBytes: measured.resourceTimingSizeDeltaBytes,
        downloadTimeMs: measured.durationMs,
        downloadSpeedKbps: measured.downloadSpeedKbps,
        payloadRateKbps: measured.payloadRateKbps,
        ttfbMs: measured.ttfbMs,
        segmentDownloadTimeVariationMs: measured.segmentDownloadTimeVariationMs,
        connectionSetupMs: measured.connectionSetupMs,
        dnsMs: measured.dnsMs,
        connectMs: measured.connectMs,
        secureHandshakeMs: measured.secureHandshakeMs,
      });
      return measured;
    };

    const onFragmentStarted = (event: any) => {
      if (!isCurrentSession()) return;
      const request = event?.request;
      if (!isVideoMediaRequest(request)) return;
      activeFragmentRequests.add(request);
      markFragmentStarted(request);
      setIsFragmentLoading(true);
      addSessionLog("NET", `SEGMENT START: ${getRequestUrl(request)}`);
      if (countedFragmentRequests.has(request)) return;
      countedFragmentRequests.add(request);
      metrics.recordFragmentRequest();
    };

    const onFragmentLoaded = (event: any) => {
      try {
        if (!isCurrentSession()) return;
        const request = event?.request;
        if (!isVideoMediaRequest(request)) return;
        const wallDurationMs = markFragmentFinished(request);
        if (event?.error) {
          recordSegmentQos(request, event, wallDurationMs, "failed");
          addSessionLog(
            "ERRO",
            `SEGMENT FAILED: ${getRequestUrl(request)}${formatFragmentFailureDetails(event)}`,
          );
          recordFragmentFailureOnce(request);
          return;
        }

        const measured = recordSegmentQos(request, event, wallDurationMs, "completed");
        terminalFragmentRequests.add(request);
        addSessionLog("NET", `SEGMENT COMPLETE: ${getRequestUrl(request)}`);
        if (!measured) return;
        const { bytesLoaded, durationMs } = measured;
        const now = Date.now();
        if (now - lastNetLogRef.current < netLogThrottleMs) return;
        if (bytesLoaded === 0 && durationMs === 0) return;
        lastNetLogRef.current = now;
        const kilobytes = bytesLoaded > 0 ? `${(bytesLoaded / 1024).toFixed(1)} KB` : "";
        const segmentDuration = durationMs > 0 ? ` SDT:${durationMs}ms` : "";
        addSessionLog("NET", `Segment loaded.${kilobytes ? ` ${kilobytes}.` : ""}${segmentDuration}`);
      } catch {
        return;
      }
    };

    const onFragmentAbandoned = (event: any) => {
      if (!isCurrentSession()) return;
      const request = event?.request;
      if (!isVideoMediaRequest(request)) return;
      const wallDurationMs = markFragmentFinished(request);
      recordSegmentQos(request, event, wallDurationMs, "abandoned");
      recordFragmentAbandonOnce(request);
      addSessionLog("WARN", `SEGMENT ABANDONED: ${getRequestUrl(request)} (ABR)`);
    };

    const onError = (event: any) => {
      if (!isCurrentSession()) return;
      const error = event?.error;
      const request = error?.data?.request;
      if (request) {
        const wallDurationMs = markFragmentFinished(request);
        if (isFragmentFailure(error?.code ?? error?.data?.code, error?.message) && isVideoMediaRequest(request)) {
          recordSegmentQos(request, event, wallDurationMs, "failed");
        }
      } else {
        activeFragmentRequests.clear();
        fragmentStartByRequest.clear();
        fragmentStartByKey.clear();
        setIsFragmentLoading(false);
      }
      const errorCode = error?.code ?? error?.data?.code;
      const message = error?.message ?? error?.code ?? "Unknown";
      if (isFragmentFailure(errorCode, message) && isVideoMediaRequest(request)) {
        recordFragmentFailureOnce(request);
      }
      const codeLabel = errorCode === undefined || errorCode === null ? "" : ` [code ${errorCode}]`;
      addSessionLog("ERRO", `Player error${codeLabel}: ${message}`);
    };

    const onBufferEmpty = (event: any) => {
      if (!isCurrentSession()) return;
      if (event?.mediaType !== "video") return;
      const video = videoRef.current;
      const started = stall.onBufferEmpty(
        statsRef.current.startupDelayMethod !== "not-measured"
          && !!video
          && !video.paused
          && !video.ended
          && !video.seeking,
      );
      if (!started) return;
      const snap = stall.getSnapshot();
      addSessionLog("WARN", `Stall #${snap.stallCount} — buffer empty`, { stallCount: snap.stallCount });
    };

    const onBufferLoaded = (event: any) => {
      if (!isCurrentSession()) return;
      if (event?.mediaType !== "video") return;
      const durationMs = stall.onBufferLoaded();
      if (durationMs > 0) {
        const snap = stall.getSnapshot();
        addSessionLog("SYS", `Stall resolved after ${durationMs}ms.`, {
          stallCount: snap.stallCount, stallDurationMs: snap.stallAccumulatedMs,
        });
      }
    };

    player.on(MediaPlayer.events.MANIFEST_LOADED, onManifestLoaded);
    player.on(MediaPlayer.events.STREAM_INITIALIZED, onStreamInitialized);
    player.on(MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityRendered);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_STARTED, onFragmentStarted);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, onFragmentLoaded);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_ABANDONED, onFragmentAbandoned);
    player.on(MediaPlayer.events.ERROR, onError);
    player.on(MediaPlayer.events.BUFFER_EMPTY, onBufferEmpty);
    player.on(MediaPlayer.events.BUFFER_LOADED, onBufferLoaded);

    const recordPlaybackQoeSample = (video: HTMLVideoElement) => {
      playbackQoeSamplesRef.current.push({
        id: ++playbackSampleIdRef.current,
        replay: currentReplayRef.current,
        timestamp: new Date().toISOString(),
        streamTitle,
        segmentLabel: logSegmentLabel,
        isPlaying: !video.paused && !video.ended,
        isAutoQuality: isAutoQualityRef.current,
        activeScenarioLabel: scenarioById.get(activeScenarioIdRef.current)?.label ?? "Not applied",
        qualitySemantics: "video-quality-change-rendered-session-cumulative-initial-selection-excluded",
        stats: { ...statsRef.current },
      });
    };

    const pollId = window.setInterval(() => {
      const video = videoRef.current;
      const currentPlayer = playerRef.current;
      if (!video || !currentPlayer) return;
      if (!isCurrentSession()) return;
      if (isReplayDoneRef.current) return;
      syncReps();
      metrics.pollStats(video, currentPlayer, stall.getSnapshot().stallAccumulatedMs);
      recordPlaybackQoeSample(video);
    }, statsPollIntervalMs);

    const video = videoRef.current;
    let firstFrameCallbackId: number | null = null;
    const supportsVideoFrameCallback = typeof video?.requestVideoFrameCallback === "function";
    const scheduleFirstRenderedFrame = () => {
      if (!video || !supportsVideoFrameCallback || firstFrameCallbackId !== null) return;
      firstFrameCallbackId = video.requestVideoFrameCallback((renderedAtMs) => {
        firstFrameCallbackId = null;
        metrics.markFirstFrame(renderedAtMs, "first-rendered-frame");
      });
    };
    const onPlay = () => {
      if (!isCurrentSession()) return;
      metrics.markPlayRequested();
      scheduleFirstRenderedFrame();
      setIsPlaying(true);
      addSessionLog("SYS", "Playback started.");
    };
    const onPause = () => {
      if (!isCurrentSession()) return;
      stall.onBufferLoaded();
      setIsPlaying(false); addSessionLog("SYS", "Playback paused.");
    };
    const onWaiting = () => {
      if (!isCurrentSession()) return;
      addSessionLog("WARN", "Buffering (waiting event)");
    };
    const onLoadedData = () => {
      if (!isCurrentSession()) return;
      if (!supportsVideoFrameCallback) metrics.markFirstFrame(performance.now(), "loadeddata-fallback");
    };
    const onPlaying = () => {
      if (!isCurrentSession()) return;
      if (!supportsVideoFrameCallback) metrics.markFirstFrame(performance.now(), "playing-fallback");
    };

    let lastEndedHandledAt = 0;
    const onEnded = () => {
      if (!isCurrentSession()) return;
      const now = Date.now();
      if (now - lastEndedHandledAt < 500) return;
      lastEndedHandledAt = now;

      const maxReplays = replayCountRef.current;
      const curReplay = currentReplayRef.current;
      const replayPlaybackTime = video?.currentTime ?? statsRef.current.currentTime;
      stall.onBufferLoaded();
      const stallDurationMs = stall.getSnapshot().stallAccumulatedMs;
      if (video && playerRef.current) {
        metrics.pollStats(video, playerRef.current, stallDurationMs);
      }
      metrics.completeReplay(replayPlaybackTime, stallDurationMs);
      if (video) recordPlaybackQoeSample(video);

      if (maxReplays === 0) {
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        metrics.beginReplay();
        addSessionLog("SYS", `Replay #${nextReplay} starting (unlimited mode)...`);
        if (playerRef.current) {
          metrics.markPlayRequested();
          playerRef.current.seek(0);
          playerRef.current.play();
        }
      } else if (curReplay < maxReplays) {
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        metrics.beginReplay();
        addSessionLog("SYS", `Replay #${nextReplay}/${maxReplays} starting...`);
        if (playerRef.current) {
          metrics.markPlayRequested();
          playerRef.current.seek(0);
          playerRef.current.play();
        }
      } else {
        addSessionLog("SYS", `All ${maxReplays} replay(s) completed. Stopping video and logging.`);
        isReplayDoneRef.current = true;
        setIsReplayDone(true);
        setIsPlaying(false);
        if (playerRef.current) {
          playerRef.current.pause();
        }
      }
    };

    video?.addEventListener("play", onPlay);
    video?.addEventListener("pause", onPause);
    video?.addEventListener("waiting", onWaiting);
    video?.addEventListener("loadeddata", onLoadedData);
    video?.addEventListener("playing", onPlaying);
    video?.addEventListener("ended", onEnded);
    player.on(MediaPlayer.events.PLAYBACK_ENDED, onEnded);

    return () => {
      if (playerSessionIdRef.current === sessionId) {
        playerSessionIdRef.current += 1;
      }
      window.clearInterval(pollId);
      if (video && firstFrameCallbackId !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(firstFrameCallbackId);
      }
      video?.removeEventListener("play", onPlay);
      video?.removeEventListener("pause", onPause);
      video?.removeEventListener("waiting", onWaiting);
      video?.removeEventListener("loadeddata", onLoadedData);
      video?.removeEventListener("playing", onPlaying);
      video?.removeEventListener("ended", onEnded);
      player.off(MediaPlayer.events.PLAYBACK_ENDED, onEnded);
      networkConnection?.removeEventListener?.("change", onNetworkChange);
      activeFragmentRequests.clear();
      countedFragmentRequests.clear();
      terminalFragmentRequests.clear();
      recordedFragmentRequests.clear();
      fragmentStartByRequest.clear();
      fragmentStartByKey.clear();
      setIsFragmentLoading(false);
      try {
        player.destroy();
      } finally {
        playerRef.current = null;
      }
    };
  }, [
    manifestUrl,
    syncReps,
    addLog,
    updateStats,
    metrics,
    stall,
    streamTitle,
    resetMeasurementState,
    logSegmentLabel,
    scenarioById,
  ]);

  const applyScenario = useCallback(async (scenario: NetworkScenario) => {
    const player = playerRef.current;
    if (!player) return;
    const sessionId = playerSessionIdRef.current;
    const isCurrentSession = () => sessionId === playerSessionIdRef.current && playerRef.current === player;
    try {
      addLog("SYS", `Applying: ${scenario.label}...`, undefined, sessionId);
      const response = await fetch("/api/network-scenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario),
      });
      if (!isCurrentSession()) return;
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setActiveScenarioId(scenario.id);
      activeScenarioIdRef.current = scenario.id;
      setIsAutoQuality(true); isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true }, maxBitrate: { video: -1 } } } });
      const usesTrafficShaping =
        (scenario.maxBitrateKbps ?? 0) > 0 ||
        (scenario.delayMs ?? 0) > 0 ||
        (scenario.lossPercent ?? 0) > 0;
      addLog(
        "INFO",
        usesTrafficShaping
          ? `Applied: ${scenario.label} via server-egress tc/netem.`
          : `Applied: ${scenario.label}; server tc/netem is cleared.`,
        undefined,
        sessionId,
      );
      if (scenario.id === "migration_test") {
        addLog(
          "WARN",
          "Migration profile does not switch Android interfaces; run the same external Wi-Fi/cellular schedule for every protocol.",
          undefined,
          sessionId,
        );
      }
    } catch (error) {
      if (!isCurrentSession()) return;
      addLog("ERRO", `Failed: ${(error as Error).message}`, undefined, sessionId);
    }
  }, [addLog]);

  const setQualitySelection = useCallback((value: QualitySelection) => {
    const player = playerRef.current;
    if (!player) return;
    if (value === "auto") {
      setIsAutoQuality(true); isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
      addLog("INFO", "Quality: Auto ABR");
      return;
    }
    setIsAutoQuality(false); isAutoQualityRef.current = false;
    setQualitySelectionState(value);
    player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
    player.setRepresentationForTypeByIndex("video", value, true);
  }, [addLog]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      metrics.markPlayRequested();
      video.play();
    } else {
      video.pause();
    }
  }, [metrics]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    metrics.markPlayRequested();
    video.play();
  }, [metrics]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  return {
    videoRef, representations, isPlaying, isFragmentLoading, stats, activeScenarioId,
    qualitySelection, isAutoQuality, logs,
    getSegmentQosRecords, getPlaybackQoeSamples,
    applyScenario, setQualitySelection, togglePlayPause, play, pause, resetStats,
    getStatsSnapshot,
    replayCount, currentReplay, isReplayDone, setReplayCount,
  };
}

export { formatBitrateKbps } from "../utils/formatters";
export { getRepBitrateKbps, getResolutionLabel } from "./useStreamMetrics";
