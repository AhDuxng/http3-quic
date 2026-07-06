import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPlayer } from "dashjs";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import type {
  QualitySelection, StreamStats, LogEntry, LogLevel,
  UseDashPlayerArgs, UseDashPlayerResult,
} from "../type/dashPlayer";
import { statsPollIntervalMs, netLogThrottleMs, defaultStats } from "../constants/dashPlayer";
import { formatTimestamp } from "../utils/formatters";
import { formatBitrateKbps } from "../utils/formatters";
import { getRepBitrateKbps, getResolutionLabel, useStreamMetrics } from "./useStreamMetrics";
import { useStallTracker } from "./useStallTracker";

const defaultReplayCount = 1;

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
  const [activeScenarioId, setActiveScenarioId] = useState<NetworkScenarioId>(scenarios[0]?.id ?? "fiber");
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState<StreamStats>(defaultStats);
  const [logs, setLogs] = useState<LogEntry[]>([]);
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

    const label = scenarioById.get(activeScenarioIdRef.current)?.label ?? "—";
    const entry: LogEntry = {
      id: ++logIdRef.current, timestamp: formatTimestamp(new Date()),
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
    player.initialize(videoRef.current ?? undefined, manifestUrl, false);
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: true }, initialBitrate: { video: 500 } } },
    });
    addSessionLog("SYS", `${streamTitle}: player initialized. Loading manifest...`);

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

    let previousQualityIndex = -1;
    const onQualityRendered = (event: any) => {
      if (!isCurrentSession()) return;
      if (event?.mediaType !== "video") return;
      syncReps();
      const newQualityIndex = event.newQuality ?? -1;
      const hasPreviousQuality = previousQualityIndex >= 0;
      const direction = !hasPreviousQuality
        ? "unknown"
        : newQualityIndex > previousQualityIndex
          ? "up"
          : newQualityIndex < previousQualityIndex
            ? "down"
            : "same";
      previousQualityIndex = newQualityIndex;
      try {
        const currentRepresentation = player.getCurrentRepresentationForType("video");
        if (currentRepresentation) {
          const qualityLabel = currentRepresentation.height ? `${currentRepresentation.height}p` : "—";
          if (!hasPreviousQuality) {
            addSessionLog("INFO",
              `Initial quality ${qualityLabel} @ ${formatBitrateKbps(getRepBitrateKbps(currentRepresentation))}.`);
            return;
          }
          if (direction === "same") return;
          const count = metrics.incrementQualitySwitch(direction);
          const directionLabel = direction === "down" ? "reduced" : "upgraded";
          const level = direction === "down" ? "WARN" : "INFO";
          addSessionLog(level as any,
            `Quality ${directionLabel} to ${qualityLabel} @ ${formatBitrateKbps(getRepBitrateKbps(currentRepresentation))}.`,
            { qualitySwitchCount: count });
        }
      } catch {
        return;
      }
    };

    const onFragmentStarted = (event: any) => {
      if (!isCurrentSession()) return;
      const request = event?.request;
      if (request?.mediaType && request.mediaType !== "video") return;
      const requestType = String(request?.type ?? "").toLowerCase();
      if (requestType && !requestType.includes("media")) return;
      metrics.recordFragmentRequest();
    };

    const onFragmentLoaded = (event: any) => {
      try {
        if (!isCurrentSession()) return;
        const request = event?.request;
        if (request?.mediaType && request.mediaType !== "video") return;
        const requestType = String(request?.type ?? "").toLowerCase();
        if (requestType && !requestType.includes("media")) return;

        const { bytesLoaded, durationMs } = metrics.processSegment(event?.request, event);
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
      if (request?.mediaType && request.mediaType !== "video") return;
      metrics.recordFragmentAbandon();
      addSessionLog("WARN", "Segment request abandoned by ABR.");
    };

    const onError = (event: any) => {
      if (!isCurrentSession()) return;
      const errorCode = event?.error?.code ?? event?.error?.data?.code;
      const message = event?.error?.message ?? event?.error?.code ?? "Unknown";
      if (String(message).toLowerCase().includes("fragment") || errorCode === 17 || errorCode === 18) {
        metrics.recordFragmentFailure();
      }
      addSessionLog("ERRO", `Player error: ${event?.error?.message ?? event?.error?.code ?? "Unknown"}`);
    };

    const onBufferEmpty = (event: any) => {
      if (!isCurrentSession()) return;
      if (event?.mediaType !== "video") return;
      stall.onBufferEmpty();
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

    const pollId = window.setInterval(() => {
      const video = videoRef.current;
      const currentPlayer = playerRef.current;
      if (!video || !currentPlayer) return;
      if (!isCurrentSession()) return;
      if (isReplayDoneRef.current) return;
      syncReps();
      metrics.pollStats(video, currentPlayer, stall.getSnapshot().stallAccumulatedMs);
    }, statsPollIntervalMs);

    const video = videoRef.current;
    const onPlay = () => {
      if (!isCurrentSession()) return;
      metrics.markPlayRequested(); setIsPlaying(true); addSessionLog("SYS", "Playback started.");
    };
    const onPause = () => {
      if (!isCurrentSession()) return;
      setIsPlaying(false); addSessionLog("SYS", "Playback paused.");
    };
    const onWaiting = () => {
      if (!isCurrentSession()) return;
      addSessionLog("WARN", "Buffering (waiting event)");
    };
    const onLoadedData = () => {
      if (!isCurrentSession()) return;
      metrics.markFirstFrame();
    };
    const onPlaying = () => {
      if (!isCurrentSession()) return;
      metrics.markFirstFrame();
    };

    let lastEndedHandledAt = 0;
    const onEnded = () => {
      if (!isCurrentSession()) return;
      const now = Date.now();
      if (now - lastEndedHandledAt < 500) return;
      lastEndedHandledAt = now;

      const maxReplays = replayCountRef.current;
      const curReplay = currentReplayRef.current;

      if (maxReplays === 0) {
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        addSessionLog("SYS", `Replay #${nextReplay} starting (unlimited mode)...`);
        if (playerRef.current) {
          playerRef.current.seek(0);
          playerRef.current.play();
        }
      } else if (curReplay < maxReplays) {
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        addSessionLog("SYS", `Replay #${nextReplay}/${maxReplays} starting...`);
        if (playerRef.current) {
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
      video?.removeEventListener("play", onPlay);
      video?.removeEventListener("pause", onPause);
      video?.removeEventListener("waiting", onWaiting);
      video?.removeEventListener("loadeddata", onLoadedData);
      video?.removeEventListener("playing", onPlaying);
      video?.removeEventListener("ended", onEnded);
      player.off(MediaPlayer.events.PLAYBACK_ENDED, onEnded);
      try {
        player.destroy();
      } finally {
        playerRef.current = null;
      }
    };
  }, [manifestUrl, syncReps, addLog, updateStats, metrics, stall, streamTitle, resetMeasurementState]);

  const applyScenario = useCallback(async (scenario: NetworkScenario) => {
    const player = playerRef.current;
    if (!player) return;
    const sessionId = playerSessionIdRef.current;
    const isCurrentSession = () => sessionId === playerSessionIdRef.current && playerRef.current === player;
    setActiveScenarioId(scenario.id);
    activeScenarioIdRef.current = scenario.id;
    try {
      addLog("SYS", `Applying: ${scenario.label}...`, undefined, sessionId);
      const response = await fetch("/api/network-scenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario),
      });
      if (!isCurrentSession()) return;
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setIsAutoQuality(true); isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true }, maxBitrate: { video: -1 } } } });
      addLog("INFO", `Applied: ${scenario.label} via tc.`, undefined, sessionId);
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
    videoRef, representations, isPlaying, stats, activeScenarioId,
    qualitySelection, isAutoQuality, logs,
    applyScenario, setQualitySelection, togglePlayPause, play, pause, resetStats,
    getStatsSnapshot,
    replayCount, currentReplay, isReplayDone, setReplayCount,
  };
}

export { formatBitrateKbps } from "../utils/formatters";
export { getRepBitrateKbps, getResolutionLabel } from "./useStreamMetrics";
