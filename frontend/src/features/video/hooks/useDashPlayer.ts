// useDashPlayer.ts — Hook chinh quan ly DASH player
//
// Ket hop useStreamMetrics + useStallTracker.
// Chi giu: player init, events, cleanup, scenario, quality control.
// Unlimited logging + auto-replay support.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPlayer } from "dashjs";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import type {
  QualitySelection, StreamStats, LogEntry, LogLevel,
  UseDashPlayerArgs, UseDashPlayerResult,
} from "../type/dashPlayer";
import { STATS_POLL_INTERVAL_MS, NET_LOG_THROTTLE_MS, DEFAULT_STATS } from "../constants/dashPlayer";
import { formatTimestamp } from "../utils/formatters";
import { formatBitrateKbps } from "../utils/formatters";
import { getRepBitrateKbps, getResolutionLabel, useStreamMetrics } from "./useStreamMetrics";
import { useStallTracker } from "./useStallTracker";

/** Default so lan phat lai (0 = khong gioi han, N = phat N lan roi dung) */
const DEFAULT_REPLAY_COUNT = 1;

export function useDashPlayer(args: UseDashPlayerArgs): UseDashPlayerResult {
  const { manifestUrl, scenarios } = args;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<MediaPlayerClass | null>(null);
  const logIdRef = useRef(0);
  const lastNetLogRef = useRef(0);

  const [representations, setRepresentations] = useState<Representation[]>([]);
  const [qualitySelection, setQualitySelectionState] = useState<QualitySelection>("auto");
  const [isAutoQuality, setIsAutoQuality] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<NetworkScenarioId>(scenarios[0]?.id ?? "fiber");
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState<StreamStats>(DEFAULT_STATS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const statsRef = useRef<StreamStats>(DEFAULT_STATS);
  const isAutoQualityRef = useRef(true);
  const activeScenarioIdRef = useRef<NetworkScenarioId>(activeScenarioId);

  // === Replay state ===
  const [replayCount, setReplayCount] = useState(DEFAULT_REPLAY_COUNT);
  const [currentReplay, setCurrentReplay] = useState(1);
  const [isReplayDone, setIsReplayDone] = useState(false);
  const replayCountRef = useRef(replayCount);
  const currentReplayRef = useRef(1);
  const isReplayDoneRef = useRef(false);

  // Sync refs
  useEffect(() => { replayCountRef.current = replayCount; }, [replayCount]);
  useEffect(() => { currentReplayRef.current = currentReplay; }, [currentReplay]);
  useEffect(() => { isReplayDoneRef.current = isReplayDone; }, [isReplayDone]);

  // Map id -> scenario, O(1) lookup
  const scenarioById = useMemo(() => {
    const map = new Map<NetworkScenarioId, NetworkScenario>();
    for (const s of scenarios) map.set(s.id, s);
    return map;
  }, [scenarios]);

  const updateStats = useCallback((updater: (prev: StreamStats) => StreamStats) => {
    // Khi replay da hoan tat, khong cap nhat stats nua
    if (isReplayDoneRef.current) return;
    const next = updater(statsRef.current);
    statsRef.current = next;
    setStats(next);
  }, []);

  // Sub-hooks
  const metrics = useStreamMetrics({ updateStats, statsRef });
  const stall = useStallTracker({ updateStats });

  // Them log vao console panel — KHONG GIOI HAN
  const addLog = useCallback((level: LogLevel, message: string, patch?: Partial<StreamStats>) => {
    // Khi replay done, khong ghi log nua
    if (isReplayDoneRef.current) return;

    const label = scenarioById.get(activeScenarioIdRef.current)?.label ?? "—";
    const entry: LogEntry = {
      id: ++logIdRef.current, timestamp: formatTimestamp(new Date()),
      level, message,
      statsSnapshot: { ...statsRef.current, ...(patch ?? {}) },
      isAutoQuality: isAutoQualityRef.current, activeScenarioLabel: label,
    };
    // Unlimited: khong slice, append truc tiep
    setLogs((prev) => [entry, ...prev]);
  }, [scenarioById]);

  // Dong bo representation va bitrate/resolution tu player
  const syncReps = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const reps = player.getRepresentationsByType("video");
      if (Array.isArray(reps) && reps.length > 0) setRepresentations(reps);
      const current = player.getCurrentRepresentationForType("video");
      if (!current) return;
      updateStats((prev) => ({
        ...prev,
        bitrateKbps: getRepBitrateKbps(current),
        resolutionLabel: getResolutionLabel(current),
      }));
    } catch { /* player chua san sang */ }
  }, [updateStats]);

  // Reset toan bo
  const resetStats = useCallback(() => {
    setStats(DEFAULT_STATS);
    statsRef.current = DEFAULT_STATS;
    setLogs([]);
    setRepresentations([]);
    metrics.reset();
    stall.reset();
    logIdRef.current = 0;
    lastNetLogRef.current = 0;
    setCurrentReplay(1);
    currentReplayRef.current = 1;
    setIsReplayDone(false);
    isReplayDoneRef.current = false;
    
    if (playerRef.current) {
      playerRef.current.seek(0);
      playerRef.current.play();
    }
  }, [metrics, stall]);

  useEffect(() => { isAutoQualityRef.current = isAutoQuality; }, [isAutoQuality]);
  useEffect(() => { activeScenarioIdRef.current = activeScenarioId; }, [activeScenarioId]);

  // ===== Khoi tao va cleanup dash.js player =====
  useEffect(() => {
    if (!manifestUrl) return;
    const player = MediaPlayer().create();
    playerRef.current = player;
    player.initialize(videoRef.current ?? undefined, manifestUrl, false);
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: true }, initialBitrate: { video: 500 } } },
    });
    addLog("SYS", "Player initialized. Loading manifest...");

    const onManifestLoaded = () => addLog("SYS", "Manifest loaded.");

    const onStreamInitialized = () => {
      syncReps();
      try {
        const reps = player.getRepresentationsByType("video");
        const count = Array.isArray(reps) ? reps.length : 0;
        addLog("SYS", `Stream initialized. ${count} quality level(s).`);
      } catch { /* skip */ }
    };

    let prevQIdx = -1;
    const onQualityRendered = (e: any) => {
      if (e?.mediaType !== "video") return;
      syncReps();
      const count = metrics.incrementQualitySwitch();
      const newIdx = e.newQuality ?? -1;
      const isUpgrade = newIdx > prevQIdx;
      const dir = isUpgrade ? "upgraded" : "reduced";
      const level = isUpgrade ? "INFO" : "WARN";
      prevQIdx = newIdx;
      try {
        const cur = player.getCurrentRepresentationForType("video");
        if (cur) {
          const q = cur.height ? `${cur.height}p` : "—";
          addLog(level as any,
            `Quality ${dir} to ${q} @ ${formatBitrateKbps(getRepBitrateKbps(cur))}.`,
            { qualitySwitchCount: count });
        }
      } catch { /* skip */ }
    };

    const onFragmentLoaded = (e: any) => {
      try {
        const { bytesLoaded, durationMs } = metrics.processSegment(e?.request, e);
        const now = Date.now();
        if (now - lastNetLogRef.current < NET_LOG_THROTTLE_MS) return;
        if (bytesLoaded === 0 && durationMs === 0) return;
        lastNetLogRef.current = now;
        const kb = bytesLoaded > 0 ? `${(bytesLoaded / 1024).toFixed(1)} KB` : "";
        const sdt = durationMs > 0 ? ` SDT:${durationMs}ms` : "";
        addLog("NET", `Segment loaded.${kb ? ` ${kb}.` : ""}${sdt}`);
      } catch { /* skip */ }
    };

    const onError = (e: any) => {
      addLog("ERRO", `Player error: ${e?.error?.message ?? e?.error?.code ?? "Unknown"}`);
    };

    const onBufferEmpty = (e: any) => {
      if (e?.mediaType !== "video") return;
      stall.onBufferEmpty();
      const snap = stall.getSnapshot();
      addLog("WARN", `Stall #${snap.stallCount} — buffer empty`, { stallCount: snap.stallCount });
    };

    const onBufferLoaded = (e: any) => {
      if (e?.mediaType !== "video") return;
      const dur = stall.onBufferLoaded();
      if (dur > 0) {
        const snap = stall.getSnapshot();
        addLog("SYS", `Stall resolved after ${dur}ms.`, {
          stallCount: snap.stallCount, stallDurationMs: snap.stallAccumulatedMs,
        });
      }
    };

    // Dang ky event listeners
    player.on(MediaPlayer.events.MANIFEST_LOADED, onManifestLoaded);
    player.on(MediaPlayer.events.STREAM_INITIALIZED, onStreamInitialized);
    player.on(MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityRendered);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, onFragmentLoaded);
    player.on(MediaPlayer.events.ERROR, onError);
    player.on(MediaPlayer.events.BUFFER_EMPTY, onBufferEmpty);
    player.on(MediaPlayer.events.BUFFER_LOADED, onBufferLoaded);

    // Polling stats moi giay
    const pollId = window.setInterval(() => {
      const v = videoRef.current;
      const p = playerRef.current;
      if (!v || !p) return;
      if (isReplayDoneRef.current) return; // Dung polling khi replay xong
      syncReps();
      metrics.pollStats(v, p, stall.getSnapshot().stallAccumulatedMs);
    }, STATS_POLL_INTERVAL_MS);

    const video = videoRef.current;
    const onPlay = () => { setIsPlaying(true); addLog("SYS", "Playback started."); };
    const onPause = () => { setIsPlaying(false); addLog("SYS", "Playback paused."); };
    const onWaiting = () => addLog("WARN", "Buffering (waiting event)");

    // === AUTO-REPLAY: xu ly khi video ket thuc ===
    const onEnded = () => {
      const maxReplays = replayCountRef.current;
      const curReplay = currentReplayRef.current;

      if (maxReplays === 0) {
        // 0 = Unlimited replays
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        addLog("SYS", `Replay #${nextReplay} starting (unlimited mode)...`);
        if (playerRef.current) {
          playerRef.current.seek(0);
          playerRef.current.play();
        }
      } else if (curReplay < maxReplays) {
        // Con luot replay
        const nextReplay = curReplay + 1;
        currentReplayRef.current = nextReplay;
        setCurrentReplay(nextReplay);
        addLog("SYS", `Replay #${nextReplay}/${maxReplays} starting...`);
        if (playerRef.current) {
          playerRef.current.seek(0);
          playerRef.current.play();
        }
      } else {
        // Het luot replay — DUNG VIDEO VA LOG
        addLog("SYS", `All ${maxReplays} replay(s) completed. Stopping video and logging.`);
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
    player.on(MediaPlayer.events.PLAYBACK_ENDED, onEnded);

    return () => {
      window.clearInterval(pollId);
      video?.removeEventListener("play", onPlay);
      video?.removeEventListener("pause", onPause);
      video?.removeEventListener("waiting", onWaiting);
      player.off(MediaPlayer.events.PLAYBACK_ENDED, onEnded);
      try { player.destroy(); } finally { playerRef.current = null; }
    };
  }, [manifestUrl, syncReps, addLog, updateStats, metrics, stall]);

  // Ap dung scenario mang qua Docker tc
  const applyScenario = useCallback(async (scenario: NetworkScenario) => {
    const player = playerRef.current;
    if (!player) return;
    setActiveScenarioId(scenario.id);
    activeScenarioIdRef.current = scenario.id;
    try {
      addLog("SYS", `Applying: ${scenario.label}...`);
      const res = await fetch("/api/network-scenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setIsAutoQuality(true); isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true }, maxBitrate: { video: -1 } } } });
      addLog("INFO", `Applied: ${scenario.label} via tc.`);
    } catch (err) {
      addLog("ERRO", `Failed: ${(err as Error).message}`);
    }
  }, [addLog]);

  // Chon quality thu cong hoac Auto ABR
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
    const v = videoRef.current;
    if (v) v.paused ? v.play() : v.pause();
  }, []);

  return {
    videoRef, representations, isPlaying, stats, activeScenarioId,
    qualitySelection, isAutoQuality, logs,
    applyScenario, setQualitySelection, togglePlayPause, resetStats,
    // Replay control
    replayCount, currentReplay, isReplayDone, setReplayCount,
  };
}

// Re-export tien ich cho components
export { formatBitrateKbps } from "../utils/formatters";
export { getRepBitrateKbps, getResolutionLabel } from "./useStreamMetrics";
