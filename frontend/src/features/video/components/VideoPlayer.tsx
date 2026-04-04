// VideoPlayer.tsx - Main component displaying DASH player and control panels.
// Layout: [Video | Sidebar] on top, [Stream Telemetry card] at the bottom.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { FaPlay, FaWifi, FaCog } from "react-icons/fa";
import { MdHighQuality } from "react-icons/md";
import { NETWORK_SCENARIOS } from "../constants/networkScenarios";
import { useDashPlayer, formatBitrateKbps } from "../hooks/useDashPlayer";
import { NetworkSimulationPanel } from "./NetworkSimulationPanel";
import { ConsoleLogsPanel } from "./ConsoleLogsPanel";
import { StreamTelemetryCard } from "./StreamTelemetryCard";

// Component props
interface VideoPlayerProps {
  manifestUrl: string;
  // Callback for App.jsx to receive the actual HTTP protocol being used
  onProtocolChange?: (protocol: string) => void;
}

// Handle for App.jsx to call reset from outside via ref
export interface VideoPlayerHandle {
  reset: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ manifestUrl, onProtocolChange }, ref) => {
    const {
      videoRef, representations, isPlaying, stats,
      activeScenarioId, qualitySelection, isAutoQuality,
      logs, applyScenario, setQualitySelection, togglePlayPause, resetStats,
    } = useDashPlayer({ manifestUrl, scenarios: NETWORK_SCENARIOS });

    // Expose resetStats to parent (App.jsx) via ref
    useImperativeHandle(ref, () => ({ reset: resetStats }), [resetStats]);

    // Notify parent when protocolLabel changes
    useEffect(() => {
      if (onProtocolChange && stats.protocolLabel) {
        onProtocolChange(stats.protocolLabel);
      }
    }, [stats.protocolLabel, onProtocolChange]);

    // UI-only state: log filter, interface modes
    const [isManualMode, setIsManualMode] = useState(false);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const qualityMenuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target as Node)) {
          setShowQualityMenu(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Find active scenario for label display
    const activeScenario = useMemo(
      () => NETWORK_SCENARIOS.find((s) => s.id === activeScenarioId) ?? {
        id: "custom", label: "Custom Settings", speedLabel: "No limit", maxBitrateKbps: null, description: "Custom"
      },
      [activeScenarioId],
    );

    // Profile displayed in video overlay
    const profileLabel = isAutoQuality
      ? "Auto"
      : representations[qualitySelection as number]?.height
        ? `${representations[qualitySelection as number].height}p`
        : "Manual";

    return (
      <div className="flex flex-col gap-4 w-full">

        {/* ===== TOP ROW: Video + Sidebar ===== */}
        <div className="flex flex-col lg:flex-row gap-4 w-full">

          {/* LEFT COLUMN: Video */}
          <div className="flex flex-col flex-1 min-w-0">

            {/* Black video area */}
            <div className="relative bg-black rounded-lg overflow-hidden w-full group">
              <video
                ref={videoRef}
                className="w-full h-auto aspect-video cursor-pointer object-contain"
                controls
                controlsList="nodownload"
                onClick={togglePlayPause}
              />

              {/* Protocol badge - top left - real protocol from Performance API */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
                <FaWifi className={`w-3 h-3 ${
                  stats.protocolLabel.includes("h3") || stats.protocolLabel.includes("QUIC")
                    ? "text-blue-400"
                    : stats.protocolLabel.includes("h2") || stats.protocolLabel.includes("HTTP/2")
                      ? "text-emerald-400"
                      : "text-yellow-400"
                }`} />
                <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
                  {stats.protocolLabel}
                </span>
              </div>

              {/* Stats overlay - top right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
                <span className="text-green-400 text-[11px] font-mono font-semibold">
                  {stats.resolutionLabel} @ {formatBitrateKbps(stats.bitrateKbps)}
                </span>
              </div>

              {/* Play overlay when video is paused */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/20"
                >
                  <span className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                    <FaPlay className="w-5 h-5 text-gray-800 ml-0.5" />
                  </span>
                </button>
              )}

              {/* Stream info overlay - bottom */}
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

              {/* 3-dot button next to fullscreen - Quality Menu */}
              <div ref={qualityMenuRef} className="absolute bottom-12 right-2" style={{ zIndex: 40 }}>
                <button
                  type="button"
                  onClick={() => setShowQualityMenu((v) => !v)}
                  className="w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
                  aria-label="Video settings"
                >
                  <FaCog className="w-3.5 h-3.5 text-white" />
                </button>

                {/* Quality dropdown menu */}
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden pointer-events-auto">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                      <MdHighQuality className="text-blue-400 w-4 h-4" />
                      <span className="text-white text-xs font-semibold tracking-wider">QUALITY</span>
                    </div>

                    {/* Auto option */}
                    <button
                      type="button"
                      onClick={() => {
                        setQualitySelection("auto");
                        setShowQualityMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${isAutoQuality
                          ? "bg-blue-600/30 text-blue-300"
                          : "text-gray-300 hover:bg-gray-800/80"
                        }`}
                    >
                      <span className="text-sm">Auto</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {formatBitrateKbps(stats.avgThroughputKbps)}
                      </span>
                      {isAutoQuality && (
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full ml-1" />
                      )}
                    </button>

                    {/* Quality levels */}
                    <div className="max-h-48 overflow-y-auto">
                      {[...representations].reverse().map((rep, _revIdx) => {
                        const originalIdx = representations.length - 1 - _revIdx;
                        const kbps = typeof rep.bitrateInKbit === "number"
                          ? rep.bitrateInKbit
                          : Math.round((rep.bandwidth ?? 0) / 1000);
                        const isSelected = !isAutoQuality && qualitySelection === originalIdx;
                        return (
                          <button
                            key={originalIdx}
                            type="button"
                            onClick={() => {
                              setQualitySelection(originalIdx);
                              setShowQualityMenu(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${isSelected
                                ? "bg-blue-600/30 text-blue-300"
                                : "text-gray-300 hover:bg-gray-800/80"
                              }`}
                          >
                            <span className="text-sm font-medium">
                              {rep.height ? `${rep.height}p` : "—"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 font-mono">
                                {formatBitrateKbps(kbps)}
                              </span>
                              {isSelected && (
                                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* END LEFT COLUMN */}

          {/* RIGHT COLUMN: Sidebar */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
            <NetworkSimulationPanel
              stats={stats}
              representations={representations}
              isAutoQuality={isAutoQuality}
              activeScenarioId={activeScenarioId}
              qualitySelection={qualitySelection}
              setQualitySelection={setQualitySelection}
              applyScenario={applyScenario}
              isManualMode={isManualMode}
              setIsManualMode={setIsManualMode}
            />

            <ConsoleLogsPanel
              logs={logs}
              stats={stats}
              representations={representations}
              isAutoQuality={isAutoQuality}
              activeScenario={activeScenario as any}
            />
          </div>
        </div>
        {/* END TOP ROW */}

        {/* ===== TELEMETRY CARD - full width at bottom ===== */}
        <StreamTelemetryCard stats={stats} isPlaying={isPlaying} />
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
