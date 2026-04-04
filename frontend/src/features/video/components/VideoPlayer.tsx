// VideoPlayer.tsx — Component chinh hien thi DASH player va cac panel dieu khien
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { FaPlay, FaWifi, FaCog } from "react-icons/fa";
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

              {/* Overlay play khi pause */}
              {!isPlaying && (
                <button type="button" onClick={togglePlayPause} aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                    <FaPlay className="w-5 h-5 text-gray-800 ml-0.5" />
                  </span>
                </button>
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
