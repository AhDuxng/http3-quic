import { FaArrowLeft, FaClock, FaColumns, FaPlayCircle, FaThLarge } from "react-icons/fa";
import type { SegmentSeconds, ViewMode } from "../constants/videoCatalog";
import { segmentOptions, viewModes } from "../constants/videoCatalog";

interface VideoSetupPanelProps {
  selectedMode: ViewMode | null;
  onSelectMode: (mode: ViewMode) => void;
  onSelectSegment: (segmentSeconds: SegmentSeconds) => void;
  onBack: () => void;
}

const modeIcons = {
  1: FaPlayCircle,
  2: FaColumns,
  3: FaThLarge,
};

const modeLabels = {
  1: "1 video",
  2: "2 video",
  3: "3 video",
};

const modeDescriptions = {
  1: "Một player chính với danh sách video ở bên phải.",
  2: "Chọn hai video và phát song song để so sánh.",
  3: "Hiển thị cả ba video cùng lúc.",
};

export function VideoSetupPanel({
  selectedMode,
  onSelectMode,
  onSelectSegment,
  onBack,
}: VideoSetupPanelProps) {
  if (selectedMode) {
    return (
      <section className="min-h-[calc(100vh-5.5rem)] flex items-center justify-center">
        <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-5"
          >
            <FaArrowLeft className="w-3 h-3" />
            Chọn lại chế độ xem
          </button>

          <div className="mb-5">
            <h1 className="text-2xl font-extrabold text-slate-900">Chọn độ dài segment</h1>
            <p className="text-sm text-slate-500 mt-1">
              Mỗi video sẽ dùng manifest DASH tương ứng với segment đã chọn.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {segmentOptions.map((segmentSeconds) => (
              <button
                key={segmentSeconds}
                type="button"
                onClick={() => onSelectSegment(segmentSeconds)}
                className="group rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 p-4 text-left transition-colors"
              >
                <FaClock className="w-5 h-5 text-slate-400 group-hover:text-blue-500 mb-4" />
                <div className="text-2xl font-black text-slate-900">{segmentSeconds}s</div>
                <div className="text-xs text-slate-500 mt-1">Segment duration</div>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-5.5rem)] flex items-center justify-center">
      <div className="w-full max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900">Chọn chế độ xem video</h1>
          <p className="text-sm text-slate-500 mt-1">
            Video chưa được tải cho đến khi bạn chọn chế độ xem và segment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {viewModes.map((mode) => {
            const Icon = modeIcons[mode];
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelectMode(mode)}
                className="group bg-white border border-slate-200 rounded-lg p-5 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5 text-slate-500 group-hover:text-blue-500" />
                </div>
                <div className="text-xl font-extrabold text-slate-900">{modeLabels[mode]}</div>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{modeDescriptions[mode]}</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
