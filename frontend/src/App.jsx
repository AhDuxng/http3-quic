import { useRef, useState } from "react";
import VideoPlayer from "./features/video/components/VideoPlayer";
import { useVideoInfo } from "./features/video/hooks/useVideoInfo";
import { FaExchangeAlt } from "react-icons/fa";
import "./App.css";

// Cau hinh nguon video
const VIDEO_SOURCES = {
  dash: { manifestUrl: "/media/stream.mpd", label: "DASH / ABR" },
  media2: { manifestUrl: "/media-2/dash/stream.mpd", label: "Media-2 (DASH)" },
};

function App() {
  // Ref de goi VideoPlayer.reset() tu header khi nhan "Reset Stats"
  const playerRef = useRef(null);

  const { videoInfo, isLoading, error } = useVideoInfo();

  // Nguon video dang hien thi: "dash" | "media2"
  const [activeSource, setActiveSource] = useState("dash");

  // Chuyen doi nguon video
  const toggleSource = () => {
    setActiveSource((prev) => (prev === "dash" ? "media2" : "dash"));
  };

  const currentSource = VIDEO_SOURCES[activeSource];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-50 shrink-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        {/* Brand + badge */}
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">ADTUBE</span>
          <span className="text-slate-400 text-xs font-medium tracking-widest uppercase">Analyzer</span>
          {/* Badge HTTP/3 */}
          <span className="flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            HTTP/3 ACTIVE
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Indicator nguon dang active */}
          <span className={`text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full ${
            activeSource === "dash"
              ? "bg-blue-50 text-blue-600"
              : "bg-amber-50 text-amber-600"
          }`}>
            {currentSource.label}
          </span>

          {/* Nut chuyen doi nguon video */}
          <button
            onClick={toggleSource}
            className="flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-4 py-1.5 rounded hover:bg-slate-50 transition-colors"
          >
            <FaExchangeAlt className="w-3 h-3" />
            Switch Source
          </button>

          <button
            onClick={() => playerRef.current?.reset()}
            className="text-sm text-slate-600 border border-slate-300 px-4 py-1.5 rounded hover:bg-slate-50 transition-colors"
          >
            Reset Stats
          </button>
        </div>
      </header>

      {/* ===== Noi dung chinh ===== */}
      <main className="flex-1 w-full max-w-[1536px] mx-auto p-4 md:p-6">
        {videoInfo ? (
          /* Key = activeSource de React remount VideoPlayer khi chuyen nguon */
          <VideoPlayer
            key={activeSource}
            ref={playerRef}
            manifestUrl={currentSource.manifestUrl}
          />
        ) : (
          /* Trang thai Loading / Error */
          <div className="h-full flex flex-col items-center justify-center">
            {isLoading ? (
              <>
                <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
                <p className="text-slate-400 text-sm">Loading stream info...</p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">
                {error ? `Error: ${error}` : "No data"}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
