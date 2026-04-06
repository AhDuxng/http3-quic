// VideoPlayer.tsx — Component chinh hien thi DASH player va cac panel dieu khien
// Ho tro auto-replay voi so lan tuy chinh + unlimited logging
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { FaPlay, FaWifi, FaCog, FaRedo, FaStop } from "react-icons/fa";
import { NETWORK_SCENARIOS } from "../constants/networkScenarios";
import { useDashPlayer, formatBitrateKbps } from "../hooks/useDashPlayer";
import { QualityMenu } from "./QualityMenu";
import { NetworkSimulationPanel } from "./NetworkSimulationPanel";
import { ConsoleLogsPanel } from "./ConsoleLogsPanel";
import { StreamTelemetryCard } from "./StreamTelemetryCard";

interface VideoPlayerProps {
  manifestUrl: string;
  onProtocolChange?: (protocol: string) => void;
}

export interface VideoPlayerHandle { reset: () => void; }

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ manifestUrl, onProtocolChange }, ref) => {
    const {
      videoRef, representations, isPlaying, stats,
      activeScenarioId, qualitySelection, isAutoQuality,
      logs, applyScenario, setQualitySelection, togglePlayPause, resetStats,
      replayCount, currentReplay, isReplayDone, setReplayCount,
    } = useDashPlayer({ manifestUrl, scenarios: NETWORK_SCENARIOS });

    // Cho phep parent goi reset qua ref
    useImperativeHandle(ref, () => ({ reset: resetStats }), [resetStats]);

    // Thong bao parent khi protocol thay doi
    useEffect(() => {
      if (onProtocolChange && stats.protocolLabel) onProtocolChange(stats.protocolLabel);
    }, [stats.protocolLabel, onProtocolChange]);

    const [isManualMode, setIsManualMode] = useState(false);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const qualityMenuRef = useRef<HTMLDivElement>(null);

    // State cho replay input
    const [replayInput, setReplayInput] = useState(String(replayCount));

    // Dong menu khi click ngoai
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target as Node))
          setShowQualityMenu(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    const activeScenario = useMemo(
      () => NETWORK_SCENARIOS.find((s) => s.id === activeScenarioId) ?? {
        id: "custom" as const, label: "Custom", speedLabel: "No limit",
        maxBitrateKbps: null, description: "Custom",
      },
      [activeScenarioId],
    );

    const profileLabel = isAutoQuality
      ? "Auto"
      : representations[qualitySelection as number]?.height
        ? `${representations[qualitySelection as number].height}p`
        : "Manual";

    // Handler cap nhat replay count
    const handleReplayChange = (val: string) => {
      setReplayInput(val);
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 0) {
        setReplayCount(num);
      }
    };

    return (
      <div className="flex flex-col gap-4 w-full">
        {/* === HANG TREN: Video + Sidebar === */}
        <div className="flex flex-col lg:flex-row gap-4 w-full">
          {/* COT TRAI: Video */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="relative bg-black rounded-lg overflow-hidden w-full group">
              <video
                ref={videoRef}
                className="w-full h-auto aspect-video cursor-pointer object-contain"
                controls controlsList="nodownload" onClick={togglePlayPause}
              />

              {/* Badge protocol — trai tren */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
                <FaWifi className={`w-3 h-3 ${
                  stats.protocolLabel.includes("H/3") || stats.protocolLabel.includes("QUIC")
                    ? "text-blue-400"
                    : stats.protocolLabel.includes("H/2") || stats.protocolLabel.includes("HTTP/2")
                      ? "text-emerald-400" : "text-yellow-400"
                }`} />
                <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
                  {stats.protocolLabel}
                </span>
              </div>

              {/* Stats — phai tren */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
                <span className="text-green-400 text-[11px] font-mono font-semibold">
                  {stats.resolutionLabel} @ {formatBitrateKbps(stats.bitrateKbps)}
                </span>
              </div>

              {/* Replay badge — trai duoi */}
              <div className="absolute bottom-14 left-3 flex items-center gap-1.5">
                <div className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-mono font-semibold ${
                  isReplayDone
                    ? "bg-red-500/80 text-white"
                    : "bg-black/70 text-cyan-300"
                }`}>
                  <FaRedo className="w-2.5 h-2.5" />
                  {isReplayDone
                    ? `✓ Done (${currentReplay}/${replayCount})`
                    : replayCount === 0
                      ? `Loop ${currentReplay} (∞)`
                      : `Loop ${currentReplay}/${replayCount}`
                  }
                </div>
              </div>

              {/* Overlay play khi pause */}
              {!isPlaying && (
                <button type="button" onClick={togglePlayPause} aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                    {isReplayDone ? (
                      <FaStop className="w-5 h-5 text-red-500" />
                    ) : (
                      <FaPlay className="w-5 h-5 text-gray-800 ml-0.5" />
                    )}
                  </span>
                </button>
              )}

              {/* Overlay thong bao replay done */}
              {isReplayDone && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                  <div className="bg-white/95 rounded-xl px-8 py-6 text-center shadow-2xl">
                    <div className="text-2xl mb-2">✅</div>
                    <div className="text-lg font-bold text-slate-800 mb-1">Measurement Complete</div>
                    <div className="text-sm text-slate-500">
                      {replayCount} replay{replayCount !== 1 ? "s" : ""} finished — {logs.length} log entries recorded
                    </div>
                    <button
                      onClick={resetStats}
                      className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors pointer-events-auto"
                    >
                      Reset & Start Over
                    </button>
                  </div>
                </div>
              )}

              {/* Info stream — phia duoi */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none">
                <div className="flex items-end justify-between">
                  <span className="text-white text-xs font-mono opacity-90">
                    Stream: {manifestUrl.split("/").pop() ?? "stream.mpd"}
                  </span>
                  <span className="text-blue-300 text-xs font-medium">
                    {profileLabel} | Buffer: {stats.bufferSeconds.toFixed(1)}s
                  </span>
                </div>
              </div>

              {/* Nut quality menu */}
              <div ref={qualityMenuRef} className="absolute bottom-12 right-2" style={{ zIndex: 40 }}>
                <button type="button" onClick={() => setShowQualityMenu((v) => !v)}
                  className="w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
                  aria-label="Video settings">
                  <FaCog className="w-3.5 h-3.5 text-white" />
                </button>
                {showQualityMenu && (
                  <QualityMenu
                    representations={representations} isAutoQuality={isAutoQuality}
                    qualitySelection={qualitySelection} avgThroughputKbps={stats.avgThroughputKbps}
                    setQualitySelection={setQualitySelection} onClose={() => setShowQualityMenu(false)}
                  />
                )}
              </div>
            </div>

            {/* === REPLAY CONTROL PANEL === */}
            <div className="mt-3 bg-white rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Replay input */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <FaRedo className="w-3 h-3 text-slate-400" />
                    <span className="text-[11px] font-bold tracking-widest text-slate-600">AUTO REPLAY</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleReplayChange(String(n))}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                          replayCount === n
                            ? "bg-blue-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {n}×
                      </button>
                    ))}
                    <button
                      onClick={() => handleReplayChange("0")}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                        replayCount === 0
                          ? "bg-amber-500 text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      ∞
                    </button>
                    <div className="flex items-center gap-1 ml-1">
                      <input
                        type="number"
                        min={0}
                        value={replayInput}
                        onChange={(e) => handleReplayChange(e.target.value)}
                        className="w-14 text-center text-xs font-mono border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-blue-400"
                        title="Custom replay count (0 = unlimited)"
                      />
                      <span className="text-[10px] text-slate-400">times</span>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold ${
                    isReplayDone
                      ? "bg-green-50 text-green-600"
                      : isPlaying
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-50 text-slate-500"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isReplayDone ? "bg-green-400" : isPlaying ? "bg-blue-400 animate-pulse" : "bg-slate-400"
                    }`} />
                    {isReplayDone
                      ? "COMPLETE"
                      : replayCount === 0
                        ? `LOOP ${currentReplay}`
                        : `LOOP ${currentReplay}/${replayCount}`
                    }
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {logs.length} logs
                  </div>
                  {isReplayDone && (
                    <button
                      onClick={resetStats}
                      className="px-3 py-1 bg-blue-500 text-white text-[11px] font-bold rounded hover:bg-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <FaRedo className="w-2.5 h-2.5" />
                      RESET
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COT PHAI: Sidebar */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
            <NetworkSimulationPanel
              stats={stats} representations={representations} isAutoQuality={isAutoQuality}
              activeScenarioId={activeScenarioId} qualitySelection={qualitySelection}
              setQualitySelection={setQualitySelection} applyScenario={applyScenario}
              isManualMode={isManualMode} setIsManualMode={setIsManualMode}
            />
            <ConsoleLogsPanel
              logs={logs} stats={stats} representations={representations}
              isAutoQuality={isAutoQuality} activeScenario={activeScenario as any}
            />
          </div>
        </div>

        {/* === TELEMETRY CARD === */}
        <StreamTelemetryCard stats={stats} isPlaying={isPlaying} />
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
