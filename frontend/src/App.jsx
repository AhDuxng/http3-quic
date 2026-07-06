import { useCallback, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaCheck, FaPause, FaPlay, FaRedo, FaVideo } from "react-icons/fa";
import VideoPlayer from "./features/video/components/VideoPlayer";
import { VideoSetupPanel } from "./features/video/components/VideoSetupPanel";
import { buildManifestUrl, videoCatalog } from "./features/video/constants/videoCatalog";
import "./App.css";

function getProtocolBadge(protocol) {
  const normalizedProtocol = protocol.toLowerCase();
  if (normalizedProtocol.includes("h3") || normalizedProtocol.includes("quic")) {
    return { bg: "bg-blue-600", dot: "bg-white animate-pulse", text: "HTTP/3 (QUIC)" };
  }
  if (normalizedProtocol.includes("h2") || normalizedProtocol.includes("http/2")) {
    return { bg: "bg-emerald-600", dot: "bg-white", text: "HTTP/2" };
  }
  if (normalizedProtocol.includes("https") || normalizedProtocol.includes("tls")) {
    return { bg: "bg-amber-500", dot: "bg-white", text: "HTTPS / H1.1" };
  }
  return { bg: "bg-slate-500", dot: "bg-white", text: protocol || "Detecting..." };
}

function buildStreamItems(segmentSeconds) {
  return videoCatalog.map((video) => ({
    ...video,
    manifestUrl: buildManifestUrl(video, segmentSeconds),
  }));
}

function App() {
  const playerRefs = useRef({});
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [selectedSingleId, setSelectedSingleId] = useState(videoCatalog[0].id);
  const [selectedDualIds, setSelectedDualIds] = useState(videoCatalog.slice(0, 2).map((video) => video.id));
  const [detectedProtocol, setDetectedProtocol] = useState("Detecting...");

  const streamItems = useMemo(
    () => (selectedSegment ? buildStreamItems(selectedSegment) : []),
    [selectedSegment],
  );

  const selectedSingleVideo = useMemo(
    () => streamItems.find((video) => video.id === selectedSingleId) ?? streamItems[0],
    [selectedSingleId, streamItems],
  );

  const sideVideos = useMemo(
    () => streamItems.filter((video) => video.id !== selectedSingleId),
    [selectedSingleId, streamItems],
  );

  const selectedDualVideos = useMemo(
    () => streamItems.filter((video) => selectedDualIds.includes(video.id)),
    [selectedDualIds, streamItems],
  );

  const registerPlayer = useCallback((id) => (handle) => {
    if (handle) playerRefs.current[id] = handle;
    else delete playerRefs.current[id];
  }, []);

  const handleProtocolChange = useCallback((protocol) => {
    setDetectedProtocol(protocol);
  }, []);

  const resetPlayers = useCallback(() => {
    Object.values(playerRefs.current).forEach((player) => player?.reset());
  }, []);

  const playPlayers = useCallback(() => {
    Object.values(playerRefs.current).forEach((player) => player?.play());
  }, []);

  const pausePlayers = useCallback(() => {
    Object.values(playerRefs.current).forEach((player) => player?.pause());
  }, []);

  const resetSetup = useCallback(() => {
    playerRefs.current = {};
    setSelectedMode(null);
    setSelectedSegment(null);
    setSelectedSingleId(videoCatalog[0].id);
    setSelectedDualIds(videoCatalog.slice(0, 2).map((video) => video.id));
    setDetectedProtocol("Detecting...");
  }, []);

  const goBack = useCallback(() => {
    playerRefs.current = {};
    if (selectedSegment) {
      setSelectedSegment(null);
      setDetectedProtocol("Detecting...");
      return;
    }
    setSelectedMode(null);
  }, [selectedSegment]);

  const selectMode = useCallback((mode) => {
    playerRefs.current = {};
    setSelectedMode(mode);
    setSelectedSegment(null);
  }, []);

  const selectSegment = useCallback((segmentSeconds) => {
    playerRefs.current = {};
    setSelectedSegment(segmentSeconds);
  }, []);

  const selectSingleVideo = useCallback((videoId) => {
    if (videoId === selectedSingleId) return;
    playerRefs.current = {};
    setDetectedProtocol("Detecting...");
    setSelectedSingleId(videoId);
  }, [selectedSingleId]);

  const toggleDualVideo = useCallback((videoId) => {
    setSelectedDualIds((currentIds) => {
      if (currentIds.includes(videoId)) {
        return currentIds.length > 1 ? currentIds.filter((id) => id !== videoId) : currentIds;
      }
      if (currentIds.length < 2) return [...currentIds, videoId];
      return [currentIds[1], videoId];
    });
  }, []);

  const badge = getProtocolBadge(detectedProtocol);
  const isReady = selectedMode && selectedSegment;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 shrink-0 min-h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 gap-3 flex-wrap py-2">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">ADTUBE</span>
          <span className="text-slate-400 text-xs font-medium tracking-widest uppercase">Analyzer</span>
          <span className={`flex items-center gap-1.5 ${badge.bg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide transition-colors duration-500`}>
            <span className={`w-1.5 h-1.5 ${badge.dot} rounded-full`} />
            {badge.text}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isReady && (
            <>
              <span className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                {selectedMode} video · {selectedSegment}s
              </span>
              <button
                type="button"
                onClick={playPlayers}
                className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                <FaPlay className="w-3 h-3" />
                Play
              </button>
              <button
                type="button"
                onClick={pausePlayers}
                className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                <FaPause className="w-3 h-3" />
                Pause
              </button>
              <button
                type="button"
                onClick={resetPlayers}
                className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                <FaRedo className="w-3 h-3" />
                Reset
              </button>
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
              >
                <FaArrowLeft className="w-3 h-3" />
                Quay lại
              </button>
            </>
          )}
          {selectedMode && (
            <button
              type="button"
              onClick={resetSetup}
              className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
            >
              <FaArrowLeft className="w-3 h-3" />
              Chọn lại
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1680px] mx-auto p-4 md:p-6">
        {!isReady ? (
          <VideoSetupPanel
            selectedMode={selectedMode}
            onSelectMode={selectMode}
            onSelectSegment={selectSegment}
            onBack={() => setSelectedMode(null)}
          />
        ) : selectedMode === 1 ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-4">
            {selectedSingleVideo && (
              <VideoPlayer
                key={`${selectedSingleVideo.id}-${selectedSegment}`}
                ref={registerPlayer(selectedSingleVideo.id)}
                manifestUrl={selectedSingleVideo.manifestUrl}
                streamTitle={selectedSingleVideo.title}
                segmentSeconds={selectedSegment}
                onProtocolChange={handleProtocolChange}
              />
            )}

            <aside className="bg-white rounded-lg border border-slate-200 overflow-hidden h-fit">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <FaVideo className="w-3 h-3 text-slate-400" />
                <span className="text-[11px] font-bold tracking-widest text-slate-600">VIDEO LIST</span>
              </div>
              <div className="divide-y divide-slate-100">
                {sideVideos.map((video) => {
                  const Icon = video.icon;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => selectSingleVideo(video.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                        <Icon className={`w-4 h-4 ${video.accentClass}`} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{video.title}</span>
                        <span className="block text-[11px] text-slate-400">{selectedSegment}s · Auto ABR</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : selectedMode === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-[11px] font-bold tracking-widest text-slate-500">CHỌN 2 VIDEO</div>
                <div className="text-sm text-slate-500">{selectedDualVideos.length}/2 video đang được chọn</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {streamItems.map((video) => {
                  const Icon = video.icon;
                  const isSelected = selectedDualIds.includes(video.id);
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => toggleDualVideo(video.id)}
                      className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold transition-colors ${
                        isSelected
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-blue-500" : video.accentClass}`} />
                      {video.shortTitle}
                      {isSelected && <FaCheck className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDualVideos.length === 2 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {selectedDualVideos.map((video) => (
                  <VideoPlayer
                    key={`${video.id}-${selectedSegment}`}
                    ref={registerPlayer(video.id)}
                    manifestUrl={video.manifestUrl}
                    streamTitle={video.title}
                    segmentSeconds={selectedSegment}
                    variant="compact"
                    onProtocolChange={handleProtocolChange}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-slate-500">
                Hãy chọn đủ 2 video để bắt đầu so sánh song song.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {streamItems.map((video) => (
              <VideoPlayer
                key={`${video.id}-${selectedSegment}`}
                ref={registerPlayer(video.id)}
                manifestUrl={video.manifestUrl}
                streamTitle={video.title}
                segmentSeconds={selectedSegment}
                variant="compact"
                onProtocolChange={handleProtocolChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
