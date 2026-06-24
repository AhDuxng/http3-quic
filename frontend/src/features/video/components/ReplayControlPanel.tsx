import { memo } from "react";
import { FaRedo } from "react-icons/fa";

interface ReplayControlPanelProps {
  replayCount: number;
  currentReplay: number;
  isReplayDone: boolean;
  isPlaying: boolean;
  logsCount: number;
  replayInput: string;
  onReplayChange: (value: string) => void;
  onReset: () => void;
}

const replayPresets = [1, 3, 5, 10];

function ReplayControlPanelComponent({
  replayCount,
  currentReplay,
  isReplayDone,
  isPlaying,
  logsCount,
  replayInput,
  onReplayChange,
  onReset,
}: ReplayControlPanelProps) {
  return (
    <div className="mt-3 bg-white rounded-lg border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FaRedo className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] font-bold tracking-widest text-slate-600">AUTO REPLAY</span>
          </div>
          <div className="flex items-center gap-2">
            {replayPresets.map((preset) => (
              <button
                key={preset}
                onClick={() => onReplayChange(String(preset))}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  replayCount === preset
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {preset}×
              </button>
            ))}
            <button
              onClick={() => onReplayChange("0")}
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
                onChange={(event) => onReplayChange(event.target.value)}
                className="w-14 text-center text-xs font-mono border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-blue-400"
                title="Custom replay count (0 = unlimited)"
              />
              <span className="text-[10px] text-slate-400">times</span>
            </div>
          </div>
        </div>

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
            {logsCount} logs
          </div>
          {isReplayDone && (
            <button
              onClick={onReset}
              className="px-3 py-1 bg-blue-500 text-white text-[11px] font-bold rounded hover:bg-blue-600 transition-colors flex items-center gap-1.5"
            >
              <FaRedo className="w-2.5 h-2.5" />
              RESET
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const ReplayControlPanel = memo(ReplayControlPanelComponent);
ReplayControlPanel.displayName = "ReplayControlPanel";
