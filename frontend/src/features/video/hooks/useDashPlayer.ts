// useDashPlayer.ts - Hook quan ly toan bo logic DASH player
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

// ===== Ham tien ich =====

// Dinh dang thoi gian HH:mm:ss.cs (cs = centiseconds)
function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const cs = pad(Math.floor(date.getMilliseconds() / 10));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${cs}`;
}

// Lay bitrate (kbps) tu representation: uu tien bitrateInKbit, fallback bandwidth
function getRepBitrateKbps(rep: Representation): number {
  return typeof rep.bitrateInKbit === "number"
    ? rep.bitrateInKbit
    : Math.round((rep.bandwidth ?? 0) / 1000);
}

// Tao label resolution "WxH" hoac "—"
function getResolutionLabel(rep: Representation): string {
  return rep.width && rep.height ? `${rep.width}x${rep.height}` : "—";
}

// Hien thi theo kbps de de doi chieu voi dashboard
function formatBitrateKbps(kbps: number): string {
  const safeKbps = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
  return `${safeKbps.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kbps`;
}

/**
 * Detect giao thuc HTTP thuc te tu Performance Resource Timing API.
 * Browser expose `entry.nextHopProtocol` cho biet giao thuc duoc dung:
 *   "h3"      -> HTTP/3 (QUIC) - day la muc tieu cua du an nay
 *   "h2"      -> HTTP/2
 *   "http/1.1"-> HTTP/1.1
 *   ""        -> Khong co thong tin (co the cross-origin hoac khong ho tro)
 *
 * @param urlFragment - Phan URL de loc entry (vi du: "/media-2/" hoac "/media/")
 * @returns Label giao thuc de hien thi tren UI
 */
function detectProtocolFromPerformance(urlFragment?: string): string {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    // Lay 10 entry gan nhat (nhieu nhat), tim entry co URL khop
    const relevant = entries
      .filter((e) => !urlFragment || e.name.includes(urlFragment))
      .slice(-10);

    // Tim entry co nextHopProtocol ro rang nhat
    for (let i = relevant.length - 1; i >= 0; i--) {
      const proto = (relevant[i] as any).nextHopProtocol as string | undefined;
      if (!proto) continue;
      const p = proto.toLowerCase();
      if (p === "h3" || p === "h3-29" || p.includes("quic")) return "HTTP/3 (QUIC)";
      if (p === "h2") return "HTTP/2";
      if (p.startsWith("http/1")) return "HTTP/1.1";
    }

    // Neu khong tim duoc trong /media: thu voi tat ca entries
    if (urlFragment) return detectProtocolFromPerformance(undefined);
  } catch { /* API co the khong duoc ho tro */ }
  return "DASH / HTTPS"; // Fallback khi khong detect duoc
}

// ===== Hook chinh =====

export function useDashPlayer(args: UseDashPlayerArgs): UseDashPlayerResult {
  const { manifestUrl, scenarios } = args;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<MediaPlayerClass | null>(null);
  const logIdRef = useRef(0);
  const lastNetLogRef = useRef(0);
  const frameSampleRef = useRef<{ timeSec: number; totalFrames: number } | null>(null);

  // Muc throughput cua cac segment vua tai xong (gioi han cua so 10s)
  const segmentThroughputSamplesRef = useRef<Array<{ atMs: number; kbps: number }>>([]);

  // Luu lai thong tin segment cuoi cung de tinh latency/download speed
  const lastSegmentInfoRef = useRef<{
    bytesLoaded: number;
    startTimeMs: number;
    endTimeMs: number;
  } | null>(null);

  // --- Refs cho 8 thong so mang mo rong ---
  const prevLatencyMsRef = useRef<number | null>(null);    // latency segment truoc (tinh jitter)
  const qualitySwitchCountRef = useRef(0);                 // dem so lan chuyen quality
  const totalDownloadedBytesRef = useRef(0);               // tong bytes da tai
  const rebufferCountRef = useRef(0);                      // so lan rebuffer
  const rebufferAccumulatedMsRef = useRef(0);              // tong thoi gian rebuffer (ms)
  const rebufferStartRef = useRef<number | null>(null);    // thoi diem bat dau rebuffer

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

  // Map id -> scenario, O(1) lookup
  const scenarioById = useMemo(() => {
    const map = new Map<NetworkScenarioId, NetworkScenario>();
    for (const s of scenarios) map.set(s.id, s);
    return map;
  }, [scenarios]);

  // Them mot ban ghi vao console log
  const addLog = useCallback((level: LogLevel, message: string) => {
    const entry: LogEntry = {
      id: ++logIdRef.current,
      timestamp: formatTimestamp(new Date()),
      level,
      message,
    };
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  // Dong bo representations va bitrate/resolution tu player vao state
  const syncRepresentationsAndBitrate = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const reps = player.getRepresentationsByType("video");
      if (Array.isArray(reps) && reps.length > 0) setRepresentations(reps);

      const current = player.getCurrentRepresentationForType("video");
      if (!current) return;

      // Lay codec tu representation
      let codecLabel = "—";
      try {
        const codecs = (current as any).codecs;
        if (codecs) codecLabel = codecs;
      } catch { /* ko co codec info */ }

      // Lay quality index hien tai
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
      } catch { /* bo qua */ }

      setStats((prev) => ({
        ...prev,
        bitrateKbps: getRepBitrateKbps(current),
        resolutionLabel: getResolutionLabel(current),
        codecLabel,
        qualityIndex,
        qualityCount,
      }));
    } catch { /* player chua san sang */ }
  }, []);

  // Reset toan bo stats va log ve gia tri mac dinh
  const resetStats = useCallback(() => {
    setStats(DEFAULT_STATS);
    setQualityLog([]);
    setLogs([]);
    setRepresentations([]);
  }, []);

  // ===== Effect: Khoi tao va cleanup dash.js player =====
  useEffect(() => {
    if (!manifestUrl) return;

    const player = MediaPlayer().create();
    playerRef.current = player;

    player.initialize(videoRef.current ?? undefined, manifestUrl, false);
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: true }, initialBitrate: { video: 500 } } },
    });

    addLog("SYS", "Player initialized. Loading manifest...");

    // Su kien: manifest da tai xong
    const onManifestLoaded = () => {
      addLog("SYS", `Manifest loaded successfully.`);
    };

    // Su kien: stream san sang, dong bo quality levels lan dau
    const onStreamInitialized = () => {
      syncRepresentationsAndBitrate();
      try {
        const reps = player.getRepresentationsByType("video");
        const count = Array.isArray(reps) ? reps.length : 0;
        addLog("SYS", `Stream initialized. ${count} quality level(s) available.`);

        // Log chi tiet tung quality level
        if (Array.isArray(reps)) {
          reps.forEach((rep, idx) => {
            const kbps = getRepBitrateKbps(rep);
            const res = getResolutionLabel(rep);
            addLog("SYS", `  Level ${idx}: ${res} @ ${formatBitrateKbps(kbps)}`);
          });
        }
      } catch { /* bo qua */ }
    };

    // Theo doi quality truoc do de phat hien up/down
    let prevQualityIndex = -1;

    // Su kien: chat luong da duoc render
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
        addLog(level, `Quality ${dir} to ${quality} @ ${formatBitrateKbps(bitrateKbps)}.`);
        prevQualityIndex = newIndex;

        // Dem so lan chuyen quality
        qualitySwitchCountRef.current += 1;
        setStats((prev) => ({ ...prev, qualitySwitchCount: qualitySwitchCountRef.current }));

        setQualityLog((prev) =>
          [{ time: formatTimestamp(new Date()), quality, bitrateKbps }, ...prev]
            .slice(0, MAX_QUALITY_LOG_ENTRIES),
        );
      } catch { /* bo qua */ }
    };

    // Su kien: segment da tai xong -> ghi log NET (co throttle) + cap nhat segment stats
    const onFragmentLoaded = (event: any) => {
      try {
        const req = event?.request;
        const bytesLoaded = req?.bytesLoaded ?? event?.chunk?.bytes ?? 0;
        const startTime = req?.requestStartDate ? new Date(req.requestStartDate).getTime() : 0;
        const endTime = req?.requestEndDate ? new Date(req.requestEndDate).getTime() : Date.now();
        const durationMs = startTime > 0 ? endTime - startTime : 0;

        // Luu segment info cho polling stats
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

          // Luu mau throughput de tinh gia tri realtime theo cua so 1 giay
          if (downloadSpeedKbps > 0) {
            const nowMs = Date.now();
            segmentThroughputSamplesRef.current.push({ atMs: nowMs, kbps: downloadSpeedKbps });
            segmentThroughputSamplesRef.current = segmentThroughputSamplesRef.current
              .filter((s) => nowMs - s.atMs <= 10_000);
          }

          // Tinh jitter = |latency hien tai - latency truoc do|
          let jitterMs = 0;
          if (durationMs > 0 && prevLatencyMsRef.current !== null) {
            jitterMs = Math.abs(durationMs - prevLatencyMsRef.current);
          }
          if (durationMs > 0) prevLatencyMsRef.current = durationMs;

          // Uoc tinh RTT = thoi gian nhan byte dau tien (xap xi 2x one-way)
          const rttMs = durationMs > 0 && bytesLoaded > 0
            ? Math.round(Math.min(durationMs, durationMs * 1024 / bytesLoaded * 2))
            : 0;

          // Tich luy tong bytes da tai
          totalDownloadedBytesRef.current += bytesLoaded;
          const totalDownloadedMB = Math.round(totalDownloadedBytesRef.current / 1024 / 1024 * 100) / 100;

          setStats((prev) => ({
            ...prev,
            lastSegmentSizeKB: Math.round(sizeKB * 10) / 10,
            lastSegmentDurationMs: durationMs,
            latencyMs: durationMs,
            downloadSpeedKbps,
            jitterMs,
            rttMs,
            totalDownloadedMB,
          }));
        }

        // Throttle ghi log NET
        const now = Date.now();
        if (now - lastNetLogRef.current < NET_LOG_THROTTLE_MS) return;
        lastNetLogRef.current = now;

        const kb = bytesLoaded > 0 ? `${(bytesLoaded / 1024).toFixed(1)} KB` : "";
        const latency = durationMs > 0 ? ` Latency: ${durationMs}ms.` : "";
        addLog("NET", `Segment loaded via DASH/HTTP3.${kb ? ` Size: ${kb}.` : ""}${latency}`);
      } catch { /* bo qua */ }
    };

    // Su kien: loi player
    const onError = (event: any) => {
      const msg = event?.error?.message ?? event?.error?.code ?? "Unknown error";
      addLog("ERRO", `Player error: ${msg}`);
    };

    // Dang ky event listeners
    player.on(MediaPlayer.events.MANIFEST_LOADED, onManifestLoaded);
    player.on(MediaPlayer.events.STREAM_INITIALIZED, onStreamInitialized);
    player.on(MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityRendered);
    player.on(MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, onFragmentLoaded);
    player.on(MediaPlayer.events.ERROR, onError);

    // Polling: cap nhat cac thong so realtime tu player va video element
    const statsIntervalId = window.setInterval(() => {
      const video = videoRef.current;
      const currentPlayer = playerRef.current;
      if (!video || !currentPlayer) return;

      try {
        syncRepresentationsAndBitrate();

        const vq = video.getVideoPlaybackQuality?.();
        const bufferRaw = currentPlayer.getBufferLength("video");
        const bufferSeconds = typeof bufferRaw === "number" ? bufferRaw : 0;

        // FPS realtime = delta frame / delta thoi gian giua 2 lan polling
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

        // Throughput realtime: uu tien trung binh cac segment trong 1s gan nhat
        let avgThroughputKbps = 0;
        const nowMs = Date.now();
        const last1sSamples = segmentThroughputSamplesRef.current
          .filter((s) => nowMs - s.atMs <= 1000)
          .map((s) => s.kbps);

        if (last1sSamples.length > 0) {
          avgThroughputKbps =
            last1sSamples.reduce((sum, value) => sum + value, 0) / last1sSamples.length
            ;
        } else {
          // Fallback khi 1s vua qua khong co segment moi
          try {
            const t = currentPlayer.getAverageThroughput?.("video");
            if (typeof t === "number" && t > 0) avgThroughputKbps = t;
          } catch { /* API khong co */ }
        }

        // Current time va duration
        const currentTime = video.currentTime ?? 0;
        const duration = video.duration ?? 0;

        // Lay thong tin mang tu Network Information API
        const conn = (navigator as any).connection;
        const connectionType = conn?.effectiveType ?? "—";
        const estimatedBandwidthMbps = typeof conn?.downlink === "number" ? conn.downlink : 0;

        // Detect giao thuc HTTP thuc te tu Performance Resource Timing API
        // nextHopProtocol = "h3" khi browser ket noi qua QUIC/HTTP3
        const protocolLabel = detectProtocolFromPerformance("/media");

        setStats((prev) => ({
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
        }));
      } catch { /* player da bi huy */ }
    }, STATS_POLL_INTERVAL_MS);

    const video = videoRef.current;
    const onPlay = () => {
      setIsPlaying(true);
      addLog("SYS", "Playback started.");
      // Ket thuc rebuffer neu dang stall
      if (rebufferStartRef.current !== null) {
        rebufferAccumulatedMsRef.current += Date.now() - rebufferStartRef.current;
        rebufferStartRef.current = null;
        setStats((prev) => ({ ...prev, rebufferDurationMs: rebufferAccumulatedMsRef.current }));
      }
    };
    const onPause = () => { setIsPlaying(false); addLog("SYS", "Playback paused."); };

    // Phat hien rebuffer: video bi dung tang do thieu buffer
    const onWaiting = () => {
      rebufferStartRef.current = Date.now();
      rebufferCountRef.current += 1;
      setStats((prev) => ({ ...prev, rebufferCount: rebufferCountRef.current }));
      addLog("WARN", `Rebuffering #${rebufferCountRef.current}`);
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
  }, [manifestUrl, syncRepresentationsAndBitrate, addLog]);

  // Ap dung kich ban mang thong qua Docker tc cua backend
  const applyScenario = useCallback(async (scenario: NetworkScenario) => {
    const player = playerRef.current;
    if (!player) return;

    setActiveScenarioId(scenario.id);

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

      // Thanh cong, bo gioi han player de DASH tu thich ung voi toc do mang thuc te
      setIsAutoQuality(true);
      setQualitySelectionState("auto");
      player.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { video: true }, maxBitrate: { video: -1 } } },
      });
      addLog("INFO", `Applied network condition: ${scenario.label} via tc.`);
    } catch (err) {
      addLog("ERRO", `Failed to apply scenario: ${(err as Error).message}`);
    }
  }, [addLog]);

  // Cho phep chon chat luong thu cong hoac chuyen ve Auto ABR
  const setQualitySelection = useCallback((value: QualitySelection) => {
    const player = playerRef.current;
    if (!player) return;

    if (value === "auto") {
      setIsAutoQuality(true);
      setQualitySelectionState("auto");
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
      addLog("INFO", "Quality mode: Auto ABR");
      return;
    }
    setIsAutoQuality(false);
    setQualitySelectionState(value);
    // Manual mode: bo gioi han maxBitrate de nguoi dung co the ep len muc cao nhat (vd 1080p)
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
    } catch { /* bo qua */ }
  }, [addLog]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  }, []);

  // Dong bo scenario khi activeScenarioId thay doi
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
