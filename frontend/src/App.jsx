import { useCallback, useRef, useState } from "react";
import VideoPlayer from "./features/video/components/VideoPlayer";
import { useVideoInfo } from "./features/video/hooks/useVideoInfo";
import { FaExchangeAlt } from "react-icons/fa";
import "./App.css";

// Cau hinh nguon video
// "dash" (media/) dung HEVC (hvc1.x) — trinh duyet KHONG ho tro qua MSE/dash.js
// "media2" (media-2/) dung H.264 (avc1.x) — ho tro toan bo trinh duyet
const VIDEO_SOURCES = {
  media2: { manifestUrl: "/media-2/dash/stream.mpd", label: "Media-2 (H.264 DASH)" },
  dash: { manifestUrl: "/media/stream.mpd", label: "HEVC DASH (unsupported)" },
};

// Lay mau badge va label theo giao thuc
function getProtocolBadge(protocol) {
  const p = protocol.toLowerCase();
  if (p.includes("h3") || p.includes("quic"))
    return { bg: "bg-blue-600", dot: "bg-white animate-pulse", text: "HTTP/3 (QUIC)" };
  if (p.includes("h2") || p.includes("http/2"))
    return { bg: "bg-emerald-600", dot: "bg-white", text: "HTTP/2" };
  if (p.includes("https") || p.includes("tls"))
    return { bg: "bg-amber-500", dot: "bg-white", text: "HTTPS / H1.1" };
  return { bg: "bg-slate-500", dot: "bg-white", text: protocol || "Detecting..." };
}

function App() {
  // Ref de goi VideoPlayer.reset() tu header
  const playerRef = useRef(null);
  const { videoInfo, isLoading, error } = useVideoInfo();

  // Nguon video: "media2" (mac dinh) | "dash"
  const [activeSource, setActiveSource] = useState("media2");
  // Giao thuc HTTP tu Performance API
  const [detectedProtocol, setDetectedProtocol] = useState("Detecting...");

  const handleProtocolChange = useCallback((protocol) => {
    setDetectedProtocol(protocol);
  }, []);

  const toggleSource = () => {
    setActiveSource((prev) => (prev === "dash" ? "media2" : "dash"));
  };

  const currentSource = VIDEO_SOURCES[activeSource];
  const badge = getProtocolBadge(detectedProtocol);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-50 shrink-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">ADTUBE</span>
          <span className="text-slate-400 text-xs font-medium tracking-widest uppercase">Analyzer</span>
          {/* Badge giao thuc */}
          <span className={`flex items-center gap-1.5 ${badge.bg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide transition-colors duration-500`}>
            <span className={`w-1.5 h-1.5 ${badge.dot} rounded-full`} />
            {badge.text}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Nguon dang active */}
          <span className={`text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full ${
            activeSource === "dash" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
          }`}>
            {currentSource.label}
          </span>

          {/* Chuyen nguon */}
          <button onClick={toggleSource}
            className="flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-4 py-1.5 rounded hover:bg-slate-50 transition-colors">
            <FaExchangeAlt className="w-3 h-3" />
            Switch Source
          </button>

          <button onClick={() => playerRef.current?.reset()}
            className="text-sm text-slate-600 border border-slate-300 px-4 py-1.5 rounded hover:bg-slate-50 transition-colors">
            Reset Stats
          </button>
        </div>
      </header>

      {/* ===== Noi dung chinh ===== */}
      <main className="flex-1 w-full max-w-[1536px] mx-auto p-4 md:p-6">
        {videoInfo ? (
          <VideoPlayer
            key={activeSource} ref={playerRef}
            manifestUrl={currentSource.manifestUrl}
            onProtocolChange={handleProtocolChange}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            {isLoading ? (
              <>
                <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
                <p className="text-slate-400 text-sm">Loading stream info...</p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">{error ? `Error: ${error}` : "No data"}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
