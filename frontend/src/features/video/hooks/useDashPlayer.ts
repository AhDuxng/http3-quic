// useDashPlayer.ts - Hook managing all DASH player logic
//
// Metrics follow academic conventions for adaptive streaming QoE research:
//   SDT = Segment Download Time (was "Latency_ms")
//   TTFB = Time To First Byte (was "RTT_ms")
//   Stall = BUFFER_EMPTY event from dash.js (accurate buffer depletion)
//   Rebuffer = HTML5 "waiting" event (complementary)
//   Jitter = |SDT_current - SDT_previous|
//   Rebuffering Ratio = totalStallDuration / totalPlaybackDuration

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPlayer } from "dashjs";
import type { MediaPlayerClass, Representation } from "dashjs";
import type { NetworkScenario, NetworkScenarioId } from "../../../type/video";
import type {
  QualitySelection,
  QualityLogItem,
  StreamStats,
  LogEntry,
  LogLevel,
  UseDashPlayerArgs,
  UseDashPlayerResult,
} from "../type/dashPlayer";
import {
  MAX_QUALITY_LOG_ENTRIES,
  MAX_LOG_ENTRIES,
  STATS_POLL_INTERVAL_MS,
  NET_LOG_THROTTLE_MS,
  DEFAULT_STATS,
} from "../constants/dashPlayer";

// ===== Utility functions =====

// Format timestamp HH:mm:ss.cs (cs = centiseconds)
function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const cs = pad(Math.floor(date.getMilliseconds() / 10));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${cs}`;
}

// Get bitrate (kbps) from representation: prefer bitrateInKbit, fallback bandwidth
function getRepBitrateKbps(rep: Representation): number {
  return typeof rep.bitrateInKbit === "number"
    ? rep.bitrateInKbit
    : Math.round((rep.bandwidth ?? 0) / 1000);
}

// Create resolution label "WxH" or "—"
function getResolutionLabel(rep: Representation): string {
  return rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
}

// Display in kbps for dashboard comparison
function formatBitrateKbps(kbps: number): string {
  const safeKbps = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
  return `${safeKbps.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kbps`;
}

/**
 * Detect actual HTTP protocol from Performance Resource Timing API.
 * Browser exposes `entry.nextHopProtocol`:
 *   "h3"       -> HTTP/3 (QUIC)
 *   "h2"       -> HTTP/2
 *   "http/1.1" -> HTTP/1.1
 *   ""         -> No info (cross-origin or unsupported)
 */
function detectProtocolFromPerformance(urlFragment?: string): string {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const relevant = entries
      .filter((e) => !urlFragment || e.name.includes(urlFragment))
      .slice(-10);

    for (let i = relevant.length - 1; i >= 0; i--) {
      const proto = (relevant[i] as any).nextHopProtocol as string | undefined;
      if (!proto) continue;
      const p = proto.toLowerCase();
      if (p === "h3" || p === "h3-29" || p.includes("quic")) return "HTTP/3 (QUIC)";
      if (p === "h2") return "HTTP/2";
      if (p.startsWith("http/1")) return "HTTP/1.1";
    }

    if (urlFragment) return detectProtocolFromPerformance(undefined);
  } catch { /* API may not be supported */ }
  return "DASH / HTTPS";
}

/**
 * Get accurate TTFB from Performance Resource Timing API for a segment URL.
 * TTFB = responseStart - requestStart
 *
 * Requires Timing-Allow-Origin header on the server.
 * Returns 0 if not available.
 */
function getTTFBFromPerformanceAPI(segmentUrl: string): number {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.name.includes(segmentUrl) || segmentUrl.includes(entry.name)) {
        const ttfb = entry.responseStart - entry.requestStart;
        if (ttfb > 0 && Number.isFinite(ttfb)) {
          return Math.round(ttfb * 100) / 100; // 2 decimal precision
        }
      }
    }
  } catch { /* Performance API not available */ }
  return 0;
}

// ===== Main hook =====

export function useDashPlayer(args: UseDashPlayerArgs): UseDashPlayerResult {
  const { manifestUrl, scenarios } = args;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<MediaPlayerClass | null>(null);
  const logIdRef = useRef(0);
  const lastNetLogRef = useRef(0);
  const frameSampleRef = useRef<{ timeSec: number; totalFrames: number } | null>(null);

  // Throughput samples from recently downloaded segments (sliding window 10s)
  const segmentThroughputSamplesRef = useRef<Array<{ atMs: number; kbps: number }>>([]);

  // Last segment info for computing download speed
  const lastSegmentInfoRef = useRef<{
    bytesLoaded: number;
    startTimeMs: number;
    endTimeMs: number;
  } | null>(null);

  // --- Refs for extended network metrics ---
  const prevSDTMsRef = useRef<number | null>(null);         // previous SDT for jitter calculation
  const qualitySwitchCountRef = useRef(0);                   // quality switch counter
  const totalDownloadedBytesRef = useRef(0);                 // total bytes downloaded

  // --- Rebuffer tracking (HTML5 "waiting" event) ---
  const rebufferCountRef = useRef(0);
  const rebufferAccumulatedMsRef = useRef(0);
  const rebufferStartRef = useRef<number | null>(null);

  // --- Stall tracking (dash.js BUFFER_EMPTY / BUFFER_LOADED) ---
  const stallCountRef = useRef(0);
  const stallAccumulatedMsRef = useRef(0);
  const stallStartRef = useRef<number | null>(null);

  const [representations, setRepresentations] = useState<Representation[]>([]);
  const [qualitySelection, setQualitySelectionState] = useState<QualitySelection>("auto");
  const [isAutoQuality, setIsAutoQuality] = useState<boolean>(true);
  const [activeScenarioId, setActiveScenarioId] = useState<NetworkScenarioId>(
    scenarios[0]?.id ?? "fiber",
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [qualityLog, setQualityLog] = useState<QualityLogItem[]>([]);
  const [stats, setStats] = useState<StreamStats>(DEFAULT_STATS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const statsRef = useRef<StreamStats>(DEFAULT_STATS);
  const isAutoQualityRef = useRef<boolean>(true);
  const activeScenarioIdRef = useRef<NetworkScenarioId>(activeScenarioId);

  // Map id -> scenario, O(1) lookup
  const scenarioById = useMemo(() => {
    const map = new Map<NetworkScenarioId, NetworkScenario>();
    for (const s of scenarios) map.set(s.id, s);
    return map;
  }, [scenarios]);

  const updateStats = useCallback((updater: (prev: StreamStats) => StreamStats) => {
    // Update statsRef.current SYNCHRONOUSLY so addLog always reads the latest value
    const next = updater(statsRef.current);
    statsRef.current = next;
    setStats(next);
  }, []);

  // Add a log entry to the console log panel
  const addLog = useCallback((
    level: LogLevel,
    message: string,
    statsPatch?: Partial<StreamStats>
  ) => {
    const scenarioLabel = scenarioById.get(activeScenarioIdRef.current)?.label ?? "—";
    const entry: LogEntry = {
      id: ++logIdRef.current,
      timestamp: formatTimestamp(new Date()),
      level,
      message,
      statsSnapshot: {
        ...statsRef.current,
        ...(statsPatch ?? {}),
      },
      isAutoQuality: isAutoQualityRef.current,
      activeScenarioLabel: scenarioLabel,
    };
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, [scenarioById]);

  // Sync representations and bitrate/resolution from player to state
  const syncRepresentationsAndBitrate = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const reps = player.getRepresentationsByType("video");
      if (Array.isArray(reps) && reps.length > 0) setRepresentations(reps);

      const current = player.getCurrentRepresentationForType("video");
      if (!current) return;

      // Get codec from representation
      let codecLabel = "—";
      try {
        const codecs = (current as any).codecs;
        if (codecs) codecLabel = codecs;
      } catch { /* no codec info */ }

      // Get current quality index
      let qualityIndex = 0;
      let qualityCount = 0;
      try {
        const allReps = player.getRepresentationsByType("video");
        qualityCount = Array.isArray(allReps) ? allReps.length : 0;
        if (Array.isArray(allReps)) {
          qualityIndex = allReps.findIndex(
            (r) => getRepBitrateKbps(r) === getRepBitrateKbps(current)
          );
          if (qualityIndex < 0) qualityIndex = 0;
        }
      } catch { /* skip */ }

      updateStats((prev) => ({
        ...prev,
        bitrateKbps: getRepBitrateKbps(current),
        resolutionLabel: getResolutionLabel(current),
        codecLabel,
        qualityIndex,
        qualityCount,
      }));
    } catch { /* player not ready */ }
  }, []);

  // Reset all stats and logs to default values
  const resetStats = useCallback(() => {
    setStats(DEFAULT_STATS);
    statsRef.current = DEFAULT_STATS;
    setQualityLog([]);
    setLogs([]);
    setRepresentations([]);
    // Reset all ref counters
    prevSDTMsRef.current = null;
    qualitySwitchCountRef.current = 0;
    totalDownloadedBytesRef.current = 0;
    rebufferCountRef.current = 0;
    rebufferAccumulatedMsRef.current = 0;
    rebufferStartRef.current = null;
    stallCountRef.current = 0;
    stallAccumulatedMsRef.current = 0;
    stallStartRef.current = null;
    lastSegmentInfoRef.current = null;
    segmentThroughputSamplesRef.current = [];
    logIdRef.current = 0;
    lastNetLogRef.current = 0;
    frameSampleRef.current = null;
  }, []);

  useEffect(() => {
    isAutoQualityRef.current = isAutoQuality;
  }, [isAutoQuality]);

  useEffect(() => {
    activeScenarioIdRef.current = activeScenarioId;
  }, [activeScenarioId]);

  // ===== Effect: Initialize and cleanup dash.js player =====
  useEffect(() => {
    if (!manifestUrl) return;

    const player = MediaPlayer().create();
    playerRef.current = player;

    player.initialize(videoRef.current ?? undefined, manifestUrl, false);
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: true }, initialBitrate: { video: 500 } } },
    });

    addLog("SYS", "Player initialized. Loading manifest...");

    // Event: manifest loaded
    const onManifestLoaded = () => {
      addLog("SYS", `Manifest loaded successfully.`);
    };

    // Event: stream initialized, sync quality levels
    const onStreamInitialized = () => {
      syncRepresentationsAndBitrate();
      try {
        const reps = player.getRepresentationsByType("video");
        const count = Array.isArray(reps) ? reps.length : 0;
        addLog("SYS", `Stream initialized. ${count} quality level(s) available.`);

        if (Array.isArray(reps)) {
          reps.forEach((rep, idx) => {
            const kbps = getRepBitrateKbps(rep);
            const res = getResolutionLabel(rep);
            addLog("SYS", `  Level ${idx}: ${res} @ ${formatBitrateKbps(kbps)}`);
          });
        }
      } catch { /* skip */ }
    };

    // Track previous quality index to detect up/down
    let prevQualityIndex = -1;

    // Event: quality rendered
    const onQualityRendered = (event: any) => {
      if (event?.mediaType !== "video") return;
      syncRepresentationsAndBitrate();
      try {
        const player_ = playerRef.current;
        if (!player_) return;
        const current = player_.getCurrentRepresentationForType("video");
        if (!current) return;

        const bitrateKbps = getRepBitrateKbps(current);
        const quality = current.height ? `${current.height}p` : "—";
        const newIndex = event.newQuality ?? -1;

        const level: LogLevel = newIndex > prevQualityIndex ? "INFO" : "WARN";
        const dir = newIndex > prevQualityIndex ? "upgraded" : "reduced";
        prevQualityIndex = newIndex;

        // Increment quality switch count BEFORE addLog so snapshot has latest value
        qualitySwitchCountRef.current += 1;
        updateStats((prev) => ({ ...prev, qualitySwitchCount: qualitySwitchCountRef.current }));

        addLog(level, `Quality ${dir} to ${quality} @ ${formatBitrateKbps(bitrateKbps)}.`, {
          qualitySwitchCount: qualitySwitchCountRef.current,
        });

        setQualityLog((prev) =>
          [{ time: formatTimestamp(new Date()), quality, bitrateKbps }, ...prev]
            .slice(0, MAX_QUALITY_LOG_ENTRIES),
        );
      } catch { /* skip */ }
    };

    // Event: segment downloaded -> log NET (throttled) + update segment stats
    const onFragmentLoaded = (event: any) => {
      try {
        const req = event?.request;

        // === GET BYTES: try multiple sources ===
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

        // === GET TIMING ===
        let startTime = 0;
        let endTime = 0;

        // 1) Prefer: req.startDate / req.endDate (dash.js v5+ FragmentRequest)
        if (req?.startDate) {
          startTime = req.startDate instanceof Date ? req.startDate.getTime() : new Date(req.startDate).getTime();
        }
        // Fallback: requestStartDate (dash.js v3/v4 legacy)
        if (!startTime && req?.requestStartDate) {
          startTime = new Date(req.requestStartDate).getTime();
        }
        // Fallback: firstByteDate
        if (!startTime && req?.firstByteDate) {
          startTime = req.firstByteDate instanceof Date ? req.firstByteDate.getTime() : new Date(req.firstByteDate).getTime();
        }

        if (req?.endDate) {
          endTime = req.endDate instanceof Date ? req.endDate.getTime() : new Date(req.endDate).getTime();
        }
        if (!endTime && req?.requestEndDate) {
          endTime = new Date(req.requestEndDate).getTime();
        }
        if (!endTime) {
          endTime = Date.now();
        }

        let durationMs = startTime > 0 && endTime > startTime ? endTime - startTime : 0;

        // 2) Fallback: trace array from dash.js
        if (durationMs === 0 && Array.isArray(req?.trace) && req.trace.length > 0) {
          let traceDuration = 0;
          for (const t of req.trace) {
            traceDuration += (t.d ?? t.duration ?? 0);
          }
          if (traceDuration > 0) durationMs = traceDuration;
        }

        // 3) Fallback: Performance Resource Timing API
        if (durationMs === 0 && req?.url) {
          try {
            const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
            for (let i = entries.length - 1; i >= 0; i--) {
              if (entries[i].name.includes(req.url) || req.url.includes(entries[i].name)) {
                const perfDuration = entries[i].responseEnd - entries[i].requestStart;
                if (perfDuration > 0) {
                  durationMs = Math.round(perfDuration);
                  break;
                }
              }
            }
          } catch { /* Performance API unavailable */ }
        }

        // Save segment info for polling stats
        if (bytesLoaded > 0) {
          lastSegmentInfoRef.current = {
            bytesLoaded,
            startTimeMs: startTime,
            endTimeMs: endTime,
          };

          const sizeKB = bytesLoaded / 1024;
          const downloadSpeedKbps = durationMs > 0
            ? (bytesLoaded * 8) / durationMs // bits/ms = kbps
            : 0;

          // Save throughput sample for realtime calculation
          if (downloadSpeedKbps > 0) {
            const nowMs = Date.now();
            segmentThroughputSamplesRef.current.push({ atMs: nowMs, kbps: downloadSpeedKbps });
            segmentThroughputSamplesRef.current = segmentThroughputSamplesRef.current
              .filter((s) => nowMs - s.atMs <= 10_000);
          }

          // === JITTER = |SDT_current - SDT_previous| ===
          let jitterMs = 0;
          if (durationMs > 0 && prevSDTMsRef.current !== null) {
            jitterMs = Math.abs(durationMs - prevSDTMsRef.current);
          }
          if (durationMs > 0) prevSDTMsRef.current = durationMs;

          // === TTFB: Accurate measurement from Performance Resource Timing API ===
          // TTFB = responseStart - requestStart (requires Timing-Allow-Origin header)
          let ttfbMs = 0;

          // Method 1: Performance Resource Timing API (most accurate)
          if (req?.url) {
            ttfbMs = getTTFBFromPerformanceAPI(req.url);
          }

          // Method 2: Fallback to dash.js firstByteDate - startDate
          if (ttfbMs === 0 && req?.firstByteDate && startTime > 0) {
            const firstByteTime = req.firstByteDate instanceof Date
              ? req.firstByteDate.getTime()
              : new Date(req.firstByteDate).getTime();
            if (firstByteTime > startTime) {
              ttfbMs = Math.round(firstByteTime - startTime);
            }
          }

          // Accumulate total downloaded bytes
          totalDownloadedBytesRef.current += bytesLoaded;
          const totalDownloadedMB = Math.round(totalDownloadedBytesRef.current / 1024 / 1024 * 100) / 100;

          updateStats((prev) => ({
            ...prev,
            lastSegmentSizeKB: Math.round(sizeKB * 10) / 10,
            lastSegmentDurationMs: durationMs,
            downloadSpeedKbps,
            jitterMs,
            ttfbMs,
            totalDownloadedMB,
          }));
        }

        // Throttle NET log — only log when we have actual data
        const now = Date.now();
        if (now - lastNetLogRef.current < NET_LOG_THROTTLE_MS) return;
        if (bytesLoaded === 0 && durationMs === 0) return;
        lastNetLogRef.current = now;

        const kb = bytesLoaded > 0 ? `${(bytesLoaded / 1024).toFixed(1)} KB` : "";
        const sdtInfo = durationMs > 0 ? ` SDT: ${durationMs}ms.` : "";
        const ttfbInfo = statsRef.current.ttfbMs > 0 ? ` TTFB: ${statsRef.current.ttfbMs}ms.` : "";

        const netPatch: Partial<StreamStats> = {};
        if (bytesLoaded > 0) {
          netPatch.lastSegmentSizeKB = Math.round((bytesLoaded / 1024) * 10) / 10;
          netPatch.totalDownloadedMB = statsRef.current.totalDownloadedMB;
        }
        if (durationMs > 0) {
          netPatch.lastSegmentDurationMs = durationMs;
          netPatch.downloadSpeedKbps = (bytesLoaded * 8) / durationMs;
          netPatch.jitterMs = statsRef.current.jitterMs;
          netPatch.ttfbMs = statsRef.current.ttfbMs;
        }
        addLog("NET", `Segment loaded.${kb ? ` Size: ${kb}.` : ""}${sdtInfo}${ttfbInfo}`, netPatch);
      } catch { /* skip */ }
    };

    // Event: player error
    const onError = (event: any) => {
      const msg = event?.error?.message ?? event?.error?.code ?? "Unknown error";
      addLog("ERRO", `Player error: ${msg}`);
    };

    // === STALL TRACKING: dash.js BUFFER_EMPTY / BUFFER_LOADED ===
    // These events are more accurate than HTML5 "waiting" for academic measurement
    const onBufferEmpty = (event: any) => {
      if (event?.mediaType !== "video") return;
      stallStartRef.current = Date.now();
      stallCountRef.current += 1;
      updateStats((prev) => ({ ...prev, stallCount: stallCountRef.current }));
      addLog("WARN", `Stall #${stallCountRef.current} — buffer empty (BUFFER_EMPTY event)`, {
        stallCount: stallCountRef.current,
        stallDurationMs: stallAccumulatedMsRef.current,
      });
    };

    const onBufferLoaded = (event: any) => {
      if (event?.mediaType !== "video") return;
      if (stallStartRef.current !== null) {
        const stallDuration = Date.now() - stallStartRef.current;
        stallAccumulatedMsRef.current += stallDuration;
        stallStartRef.current = null;
        updateStats((prev) => ({ ...prev, stallDurationMs: stallAccumulatedMsRef.current }));
        addLog("SYS", `Stall #${stallCountRef.current} resolved after ${stallDuration}ms.`, {
          stallCount: stallCountRef.current,
          stallDurationMs: stallAccumulatedMsRef.current,
        });
      }
    };

    // Register event listeners
    player.on(MediaPlayer.events.MANIFEST_LOADED, onManifestLoaded);
    player.on(MediaPlayer.events.STREAM_INITIALIZED, onStreamInitialized);
    player.on(MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityRendered);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, onFragmentLoaded);
    player.on(MediaPlayer.events.ERROR, onError);
    player.on(MediaPlayer.events.BUFFER_EMPTY, onBufferEmpty);
    player.on(MediaPlayer.events.BUFFER_LOADED, onBufferLoaded);

    // Polling: update realtime stats from player and video element
    const statsIntervalId = window.setInterval(() => {
      const video = videoRef.current;
      const currentPlayer = playerRef.current;
      if (!video || !currentPlayer) return;

      try {
        syncRepresentationsAndBitrate();

        const vq = video.getVideoPlaybackQuality?.();
        const bufferRaw = currentPlayer.getBufferLength("video");
        const bufferSeconds = typeof bufferRaw === "number" ? bufferRaw : 0;

        // FPS realtime = delta frames / delta time between polls
        let fpsLabel = "—";
        if (vq && Number.isFinite(video.currentTime)) {
          const totalFrames = vq.totalVideoFrames ?? 0;
          const nowSec = video.currentTime;
          const prev = frameSampleRef.current;
          if (prev && nowSec > prev.timeSec && totalFrames >= prev.totalFrames) {
            fpsLabel = ((totalFrames - prev.totalFrames) / (nowSec - prev.timeSec)).toFixed(1);
          }
          frameSampleRef.current = { timeSec: nowSec, totalFrames };
        }

        // Throughput realtime: prefer average of segments in last 1s
        let avgThroughputKbps = 0;
        const nowMs = Date.now();
        const last1sSamples = segmentThroughputSamplesRef.current
          .filter((s) => nowMs - s.atMs <= 1000)
          .map((s) => s.kbps);

        if (last1sSamples.length > 0) {
          avgThroughputKbps =
            last1sSamples.reduce((sum, value) => sum + value, 0) / last1sSamples.length;
        } else {
          try {
            const t = currentPlayer.getAverageThroughput?.("video");
            if (typeof t === "number" && t > 0) avgThroughputKbps = t;
          } catch { /* API not available */ }
        }

        // Current time and duration
        const currentTime = video.currentTime ?? 0;
        const duration = video.duration ?? 0;

        // Network Information API
        const conn = (navigator as any).connection;
        const connectionType = conn?.effectiveType ?? "—";
        const estimatedBandwidthMbps = typeof conn?.downlink === "number" ? conn.downlink : 0;

        // Protocol detection
        const protocolLabel = detectProtocolFromPerformance("/media");

        // === REBUFFERING RATIO ===
        // rebufferingRatio = totalStallDuration / totalPlaybackDuration
        const totalStallMs = stallAccumulatedMsRef.current;
        const totalPlaybackMs = currentTime * 1000;
        const rebufferingRatio = totalPlaybackMs > 0
          ? Math.round((totalStallMs / totalPlaybackMs) * 10000) / 10000 // 4 decimal precision
          : 0;

        updateStats((prev) => ({
          ...prev,
          bufferSeconds,
          avgThroughputKbps,
          fpsLabel,
          droppedFrames: vq?.droppedVideoFrames ?? 0,
          totalFrames: vq?.totalVideoFrames ?? 0,
          currentTime,
          duration: Number.isFinite(duration) ? duration : 0,
          connectionType,
          estimatedBandwidthMbps,
          protocolLabel,
          rebufferingRatio,
        }));
      } catch { /* player already destroyed */ }
    }, STATS_POLL_INTERVAL_MS);

    const video = videoRef.current;

    // === HTML5 REBUFFER TRACKING (complementary to dash.js stall) ===
    const onPlay = () => {
      setIsPlaying(true);
      // End rebuffer if currently stalling
      if (rebufferStartRef.current !== null) {
        rebufferAccumulatedMsRef.current += Date.now() - rebufferStartRef.current;
        rebufferStartRef.current = null;
        updateStats((prev) => ({ ...prev, rebufferDurationMs: rebufferAccumulatedMsRef.current }));
        addLog("SYS", `Playback resumed after rebuffer #${rebufferCountRef.current}.`, {
          rebufferCount: rebufferCountRef.current,
          rebufferDurationMs: rebufferAccumulatedMsRef.current,
        });
      } else {
        addLog("SYS", "Playback started.");
      }
    };
    const onPause = () => { setIsPlaying(false); addLog("SYS", "Playback paused."); };

    // Detect rebuffer: video paused due to missing buffer
    const onWaiting = () => {
      rebufferStartRef.current = Date.now();
      rebufferCountRef.current += 1;
      updateStats((prev) => ({ ...prev, rebufferCount: rebufferCountRef.current }));
      addLog("WARN", `Rebuffering #${rebufferCountRef.current} (waiting event)`, {
        rebufferCount: rebufferCountRef.current,
        rebufferDurationMs: rebufferAccumulatedMsRef.current,
      });
    };

    video?.addEventListener("play", onPlay);
    video?.addEventListener("pause", onPause);
    video?.addEventListener("waiting", onWaiting);

    return () => {
      window.clearInterval(statsIntervalId);
      frameSampleRef.current = null;
      segmentThroughputSamplesRef.current = [];
      video?.removeEventListener("play", onPlay);
      video?.removeEventListener("pause", onPause);
      video?.removeEventListener("waiting", onWaiting);
      try { player.destroy(); } finally { playerRef.current = null; }
    };
  }, [manifestUrl, syncRepresentationsAndBitrate, addLog, updateStats]);

  // Apply network scenario via Docker tc
  const applyScenario = useCallback(async (scenario: NetworkScenario) => {
    const player = playerRef.current;
    if (!player) return;

    setActiveScenarioId(scenario.id);
    activeScenarioIdRef.current = scenario.id;

    try {
      addLog("SYS", `Applying network scenario: ${scenario.label}...`);
      const response = await fetch("/api/network-scenario", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(scenario),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      setIsAutoQuality(true);
      isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { video: true }, maxBitrate: { video: -1 } } },
      });
      addLog("INFO", `Applied network condition: ${scenario.label} via tc.`);
    } catch (err) {
      addLog("ERRO", `Failed to apply scenario: ${(err as Error).message}`);
    }
  }, [addLog]);

  // Allow manual quality selection or switch to Auto ABR
  const setQualitySelection = useCallback((value: QualitySelection) => {
    const player = playerRef.current;
    if (!player) return;

    if (value === "auto") {
      setIsAutoQuality(true);
      isAutoQualityRef.current = true;
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
      addLog("INFO", "Quality mode: Auto ABR");
      return;
    }
    setIsAutoQuality(false);
    isAutoQualityRef.current = false;
    setQualitySelectionState(value);
    player.updateSettings({
      streaming: {
        abr: {
          autoSwitchBitrate: { video: false },
          maxBitrate: { video: -1 },
        },
      },
    });
    player.setRepresentationForTypeByIndex("video", value, true);

    try {
      const reps = player.getRepresentationsByType("video");
      if (Array.isArray(reps) && reps[value]) {
        const rep = reps[value];
        addLog("INFO", `Quality set to ${rep.height}p @ ${formatBitrateKbps(getRepBitrateKbps(rep))}`);
      }
    } catch { /* skip */ }
  }, [addLog]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  }, []);

  // Sync scenario when activeScenarioId changes
  useEffect(() => {
    const scenario = scenarioById.get(activeScenarioId);
    if (!scenario) return;
    applyScenario(scenario);
  }, [activeScenarioId, applyScenario, scenarioById]);

  return {
    videoRef, representations, isPlaying, stats, activeScenarioId,
    qualitySelection, isAutoQuality, qualityLog, logs,
    applyScenario, setQualitySelection, togglePlayPause, resetStats,
  };
}
export { formatBitrateKbps };
