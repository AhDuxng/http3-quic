// QualityMenu.tsx — Menu chon chat luong video (tach tu VideoPlayer)
import { MdHighQuality } from "react-icons/md";
import type { Representation } from "dashjs";
import type { QualitySelection } from "../type/dashPlayer";
import { formatBitrateKbps, getRepBitrateKbps } from "../hooks/useDashPlayer";

interface QualityMenuProps {
  representations: Representation[];
  isAutoQuality: boolean;
  qualitySelection: QualitySelection;
  avgThroughputKbps: number;
  setQualitySelection: (val: QualitySelection) => void;
  onClose: () => void;
}

export function QualityMenu({
  representations, isAutoQuality, qualitySelection,
  avgThroughputKbps, setQualitySelection, onClose,
}: QualityMenuProps) {
  return (
    <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden pointer-events-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
        <MdHighQuality className="text-blue-400 w-4 h-4" />
        <span className="text-white text-xs font-semibold tracking-wider">QUALITY</span>
      </div>

      {/* Auto */}
      <button
        type="button"
        onClick={() => { setQualitySelection("auto"); onClose(); }}
        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
          isAutoQuality ? "bg-blue-600/30 text-blue-300" : "text-gray-300 hover:bg-gray-800/80"
        }`}
      >
        <span className="text-sm">Auto</span>
        <span className="text-[10px] text-gray-400 font-mono">{formatBitrateKbps(avgThroughputKbps)}</span>
        {isAutoQuality && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full ml-1" />}
      </button>

      {/* Danh sach cap do */}
      <div className="max-h-48 overflow-y-auto">
        {[...representations].reverse().map((rep, revIdx) => {
          const idx = representations.length - 1 - revIdx;
          const kbps = getRepBitrateKbps(rep);
          const isSelected = !isAutoQuality && qualitySelection === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => { setQualitySelection(idx); onClose(); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                isSelected ? "bg-blue-600/30 text-blue-300" : "text-gray-300 hover:bg-gray-800/80"
              }`}
            >
              <span className="text-sm font-medium">{rep.height ? `${rep.height}p` : "—"}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-mono">{formatBitrateKbps(kbps)}</span>
                {isSelected && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
