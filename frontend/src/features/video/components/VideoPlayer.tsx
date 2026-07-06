import { forwardRef, useImperativeHandle, useState } from "react";
import { networkScenarios } from "../constants/networkScenarios";
import { useDashPlayer } from "../hooks/useDashPlayer";
import { useReplayControl } from "../hooks/useReplayControl";
import { useVideoPlayerViewState } from "../hooks/useVideoPlayerViewState";
import { DashVideoStage } from "./DashVideoStage";
import { NetworkSimulationPanel } from "./NetworkSimulationPanel";
import { ConsoleLogsPanel } from "./ConsoleLogsPanel";
import { ReplayControlPanel } from "./ReplayControlPanel";
import { StreamTelemetryCard } from "./StreamTelemetryCard";

interface VideoPlayerProps {
  manifestUrl: string;
  streamTitle?: string;
  segmentSeconds?: number | null;
  variant?: "full" | "compact";
  onProtocolChange?: (protocol: string) => void;
}

export interface VideoPlayerHandle {
  reset: () => void;
  play: () => void;
  pause: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ manifestUrl, streamTitle = "Video", segmentSeconds = null, variant = "full", onProtocolChange }, ref) => {
    const {
      videoRef, representations, isPlaying, stats,
      activeScenarioId, qualitySelection, isAutoQuality,
      logs, applyScenario, setQualitySelection, togglePlayPause, resetStats,
      play, pause,
      getStatsSnapshot,
      replayCount, currentReplay, isReplayDone, setReplayCount,
    } = useDashPlayer({ manifestUrl, scenarios: networkScenarios, streamTitle, segmentSeconds });

    useImperativeHandle(ref, () => ({ reset: resetStats, play, pause }), [pause, play, resetStats]);

    const [isManualMode, setIsManualMode] = useState(false);
    const { replayInput, updateReplayCount } = useReplayControl(replayCount, setReplayCount);
    const { activeScenario, profileLabel } = useVideoPlayerViewState({
      activeScenarioId,
      isAutoQuality,
      qualitySelection,
      representations,
      protocolLabel: stats.protocolLabel,
      onProtocolChange,
    });

    const videoStage = (
      <DashVideoStage
        videoRef={videoRef}
        manifestUrl={manifestUrl}
        streamTitle={streamTitle}
        stats={stats}
        profileLabel={profileLabel}
        representations={representations}
        qualitySelection={qualitySelection}
        isAutoQuality={isAutoQuality}
        isPlaying={isPlaying}
        isReplayDone={isReplayDone}
        replayCount={replayCount}
        currentReplay={currentReplay}
        logsCount={logs.length}
        togglePlayPause={togglePlayPause}
        resetStats={resetStats}
        setQualitySelection={setQualitySelection}
      />
    );

    if (variant === "compact") {
      return (
        <div className="flex flex-col gap-3 min-w-0">
          {videoStage}
          <ReplayControlPanel
            replayCount={replayCount}
            currentReplay={currentReplay}
            isReplayDone={isReplayDone}
            isPlaying={isPlaying}
            logsCount={logs.length}
            replayInput={replayInput}
            onReplayChange={updateReplayCount}
            onReset={resetStats}
          />
          <StreamTelemetryCard stats={stats} isPlaying={isPlaying} compact />
          <ConsoleLogsPanel
            logs={logs}
            getStatsSnapshot={getStatsSnapshot}
            representations={representations}
            isAutoQuality={isAutoQuality}
            activeScenario={activeScenario}
            streamTitle={streamTitle}
            compact
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-col lg:flex-row gap-4 w-full">
          <div className="flex flex-col flex-1 min-w-0">
            {videoStage}

            <ReplayControlPanel
              replayCount={replayCount}
              currentReplay={currentReplay}
              isReplayDone={isReplayDone}
              isPlaying={isPlaying}
              logsCount={logs.length}
              replayInput={replayInput}
              onReplayChange={updateReplayCount}
              onReset={resetStats}
            />
          </div>

          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
            <NetworkSimulationPanel
              currentBitrateKbps={stats.bitrateKbps} representations={representations} isAutoQuality={isAutoQuality}
              activeScenarioId={activeScenarioId} qualitySelection={qualitySelection}
              setQualitySelection={setQualitySelection} applyScenario={applyScenario}
              isManualMode={isManualMode} setIsManualMode={setIsManualMode}
            />
            <ConsoleLogsPanel
              logs={logs} getStatsSnapshot={getStatsSnapshot} representations={representations}
              isAutoQuality={isAutoQuality} activeScenario={activeScenario}
              streamTitle={streamTitle}
            />
          </div>
        </div>

        <StreamTelemetryCard stats={stats} isPlaying={isPlaying} />
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
