import { useCallback, useRef, useState } from "react";
import VideoPlayer from "./features/video/components/VideoPlayer";
import { useVideoInfo } from "./features/video/hooks/useVideoInfo";
import { FaExchangeAlt } from "react-icons/fa";
import "./App.css";

// Video source configuration
// "dash" (media/) uses HEVC codec (hvc1.x) - NOT supported by browsers via MSE/dash.js
// "media2" (media-2/) uses H.264 codec (avc1.x) - supported by all browsers
const VIDEO_SOURCES = {
  media2: { manifestUrl: "/media-2/dash/stream.mpd", label: "Media-2 (H.264 DASH)" },
  dash: { manifestUrl: "/media/stream.mpd", label: "HEVC DASH (unsupported)" },
};

// Get badge and label corresponding to the protocol in use
function getProtocolBadge(protocol) {
  const p = protocol.toLowerCase();
  if (p.includes("h3") || p.includes("quic")) {
    return { bg: "bg-blue-600", dot: "bg-white animate-pulse", text: "HTTP/3 (QUIC)" };
  }
  if (p.includes("h2") || p.includes("http/2")) {
    return { bg: "bg-emerald-600", dot: "bg-white", text: "HTTP/2" };
  }
  if (p.includes("https") || p.includes("tls")) {
    return { bg: "bg-amber-500", dot: "bg-white", text: "HTTPS / H1.1" };
  }
  return { bg: "bg-slate-500", dot: "bg-white", text: protocol || "Detecting..." };
}

function App() {
  // Ref to call VideoPlayer.reset() from header when clicking "Reset Stats"
  const playerRef = useRef(null);

  const { videoInfo, isLoading, error } = useVideoInfo();

  // Currently displayed video source: "media2" (default, H.264) | "dash" (HEVC)
  const [activeSource, setActiveSource] = useState("media2");

  // Actual HTTP protocol detected from Performance API (updated in real-time)
  const [detectedProtocol, setDetectedProtocol] = useState("Detecting...");

  // Callback to receive protocol from VideoPlayer component
  const handleProtocolChange = useCallback((protocol) => {
    setDetectedProtocol(protocol);
  }, []);

  // Switch video source
  const toggleSource = () => {
    setActiveSource((prev) => (prev === "dash" ? "media2" : "dash"));
  };

  const currentSource = VIDEO_SOURCES[activeSource];
  const badge = getProtocolBadge(detectedProtocol);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-50 shrink-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        {/* Brand + badge */}
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">ADTUBE</span>
          <span className="text-slate-400 text-xs font-medium tracking-widest uppercase">Analyzer</span>

          {/* HTTP protocol badge - displays actual status (from Performance API) */}
          <span className={`flex items-center gap-1.5 ${badge.bg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide transition-colors duration-500`}>
            <span className={`w-1.5 h-1.5 ${badge.dot} rounded-full`} />
            {badge.text}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Active source indicator */}
          <span className={`text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full ${
            activeSource === "dash"
              ? "bg-blue-50 text-blue-600"
              : "bg-amber-50 text-amber-600"
          }`}>
            {currentSource.label}
          </span>

          {/* Switch video source button */}
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

      {/* ===== Main Content ===== */}
      <main className="flex-1 w-full max-w-[1536px] mx-auto p-4 md:p-6">
        {videoInfo ? (
          /* Key = activeSource to make React remount VideoPlayer when switching sources */
          <VideoPlayer
            key={activeSource}
            ref={playerRef}
            manifestUrl={currentSource.manifestUrl}
            onProtocolChange={handleProtocolChange}
          />
        ) : (
          /* Loading / Error state */
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
