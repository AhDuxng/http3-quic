import { useCallback, useState } from "react";
import type { RefObject } from "react";
import type { Representation } from "dashjs";
import { FaCog, FaPlay, FaRedo, FaStop, FaWifi } from "react-icons/fa";
import { QualityMenu } from "./QualityMenu";
import { IconMenuButton } from "./shared/IconMenuButton";
import { PlayOverlayButton } from "./shared/PlayOverlayButton";
import { VideoFrame } from "./shared/VideoFrame";
import { VideoOverlayBadge } from "./shared/VideoOverlayBadge";
import { formatBitrateKbps } from "../hooks/useDashPlayer";
import { useClickOutside } from "../hooks/useClickOutside";
import type { QualitySelection, StreamStats } from "../type/dashPlayer";

interface DashVideoStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  manifestUrl: string;
  streamTitle: string;
  stats: StreamStats;
  profileLabel: string;
  representations: Representation[];
  qualitySelection: QualitySelection;
  isAutoQuality: boolean;
  isPlaying: boolean;
  isReplayDone: boolean;
  replayCount: number;
  currentReplay: number;
  logsCount: number;
  togglePlayPause: () => void;
  resetStats: () => void;
  setQualitySelection: (value: QualitySelection) => void;
}

function getProtocolIconColor(protocolLabel: string) {
  if (protocolLabel.includes("H/3") || protocolLabel.includes("QUIC")) return "text-blue-400";
  if (protocolLabel.includes("H/2") || protocolLabel.includes("HTTP/2")) return "text-emerald-400";
  return "text-yellow-400";
}

function formatReplayLabel(isReplayDone: boolean, currentReplay: number, replayCount: number) {
  if (isReplayDone) return `✓ Done (${currentReplay}/${replayCount})`;
  if (replayCount === 0) return `Loop ${currentReplay} (∞)`;
  return `Loop ${currentReplay}/${replayCount}`;
}

export function DashVideoStage({
  videoRef,
  manifestUrl,
  streamTitle,
  stats,
  profileLabel,
  representations,
  qualitySelection,
  isAutoQuality,
  isPlaying,
  isReplayDone,
  replayCount,
  currentReplay,
  logsCount,
  togglePlayPause,
  resetStats,
  setQualitySelection,
}: DashVideoStageProps) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const closeQualityMenu = useCallback(() => setShowQualityMenu(false), []);
  const qualityMenuRef = useClickOutside<HTMLDivElement>(closeQualityMenu, showQualityMenu);

  return (
    <VideoFrame>
      <video
        ref={videoRef}
        className="w-full h-auto aspect-video cursor-pointer object-contain"
        controls
        controlsList="nodownload"
        onClick={togglePlayPause}
      />

      <VideoOverlayBadge className="absolute top-3 left-3">
        <FaWifi className={`w-3 h-3 ${getProtocolIconColor(stats.protocolLabel)}`} />
        <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
          {stats.protocolLabel}
        </span>
      </VideoOverlayBadge>

      <VideoOverlayBadge className="absolute top-3 right-3">
        <span className="text-green-400 text-[11px] font-mono font-semibold">
          {stats.resolutionLabel} @ {formatBitrateKbps(stats.bitrateKbps)}
        </span>
      </VideoOverlayBadge>

      <div className="absolute bottom-14 left-3 flex items-center gap-1.5">
        <div className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-mono font-semibold ${
          isReplayDone
            ? "bg-red-500/80 text-white"
            : "bg-black/70 text-cyan-300"
        }`}>
          <FaRedo className="w-2.5 h-2.5" />
          {formatReplayLabel(isReplayDone, currentReplay, replayCount)}
        </div>
      </div>

      {!isPlaying && (
        <PlayOverlayButton
          onClick={togglePlayPause}
          label="Play video"
          icon={isReplayDone
            ? <FaStop className="w-5 h-5 text-red-500" />
            : <FaPlay className="w-5 h-5 text-gray-800 ml-0.5" />}
        />
      )}

      {isReplayDone && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="bg-white/95 rounded-xl px-8 py-6 text-center shadow-2xl">
            <div className="text-2xl mb-2">✅</div>
            <div className="text-lg font-bold text-slate-800 mb-1">Measurement Complete</div>
            <div className="text-sm text-slate-500">
              {replayCount} replay{replayCount !== 1 ? "s" : ""} finished — {logsCount} log entries recorded
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

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none">
        <div className="flex items-end justify-between">
          <span className="text-white text-xs font-mono opacity-90">
            {streamTitle} · {manifestUrl.split("/").pop() ?? "stream.mpd"}
          </span>
          <span className="text-blue-300 text-xs font-medium">
            {profileLabel} | Buffer: {stats.bufferSeconds.toFixed(1)}s
          </span>
        </div>
      </div>

      <div ref={qualityMenuRef} className="absolute bottom-12 right-2" style={{ zIndex: 40 }}>
        <IconMenuButton
          label="Video settings"
          onClick={() => setShowQualityMenu((value) => !value)}
          icon={<FaCog className="w-3.5 h-3.5 text-white" />}
        />
        {showQualityMenu && (
          <QualityMenu
            representations={representations}
            isAutoQuality={isAutoQuality}
            qualitySelection={qualitySelection}
            avgThroughputKbps={stats.avgThroughputKbps}
            setQualitySelection={setQualitySelection}
            onClose={closeQualityMenu}
          />
        )}
      </div>
    </VideoFrame>
  );
}
