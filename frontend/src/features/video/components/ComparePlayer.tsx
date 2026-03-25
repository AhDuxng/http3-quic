// ComparePlayer.tsx - Component phat video MP4 truc tiep tu media-2.
// Hien thi cung DASH player (cot trai) de so sanh chat luong.
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { FaPlay, FaExchangeAlt } from "react-icons/fa";
import { MdHighQuality } from "react-icons/md";
import type { Media2Video } from "../../../type/video";

interface ComparePlayerProps {
  videos: Media2Video[];
  label: string;  // vd: "Video B"
}

function ComparePlayer({ videos, label }: ComparePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Chon video hieu luc: uu tien video user da chon, neu chua co thi lay muc bitrate giua
  const effectiveSelectedId = useMemo(() => {
    if (selectedId) return selectedId;
    if (videos.length === 0) return "";
    const midIdx = Math.floor(videos.length / 2);
    return videos[midIdx].id;
  }, [selectedId, videos]);

  // Dong menu khi click ra ngoai
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Tim video dang chon
  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === effectiveSelectedId) ?? null,
    [videos, effectiveSelectedId],
  );

  // Format bitrate de hien thi
  const formatBitrate = useCallback((bps: number) => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }, []);

  // Play/pause
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  }, []);

  // Lang nghe su kien play/pause cua video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [selectedId]);

  // Nhom video theo dai bitrate de de chon
  const bitrateGroups = useMemo(() => {
    const groups = [
      { label: "Low (< 500 kbps)", items: [] as Media2Video[] },
      { label: "Medium (500k - 2M)", items: [] as Media2Video[] },
      { label: "High (> 2 Mbps)", items: [] as Media2Video[] },
    ];
    for (const v of videos) {
      if (v.bitrateBps < 500_000) groups[0].items.push(v);
      else if (v.bitrateBps < 2_000_000) groups[1].items.push(v);
      else groups[2].items.push(v);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [videos]);

  if (videos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 rounded-lg">
        <p className="text-slate-400 text-sm">No videos available in media-2</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Khu vuc video */}
      <div className="relative bg-black rounded-lg overflow-hidden w-full group">
        <video
          ref={videoRef}
          key={selectedVideo?.url}
          src={selectedVideo?.url ?? ""}
          className="w-full h-auto aspect-video cursor-pointer object-contain"
          controls
          controlsList="nodownload"
          onClick={togglePlayPause}
        />

        {/* Badge label + bitrate - goc tren trai */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
          <FaExchangeAlt className="text-amber-400 w-3 h-3" />
          <span className="text-white text-[11px] font-mono font-semibold tracking-wider">
            {label}
          </span>
        </div>

        {/* Thong tin bitrate - goc tren phai */}
        {selectedVideo && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1">
            <span className="text-amber-400 text-[11px] font-mono font-semibold">
              {formatBitrate(selectedVideo.bitrateBps)} (MP4)
            </span>
          </div>
        )}

        {/* Overlay play khi video dang pause */}
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

        {/* Overlay ten video - phia duoi */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none">
          <div className="flex items-end justify-between">
            <span className="text-white text-xs font-mono opacity-90">
              {selectedVideo?.id ?? "—"}
            </span>
            <span className="text-amber-300 text-xs font-medium">
              Direct MP4 | {selectedVideo ? formatBitrate(selectedVideo.bitrateBps) : "—"}
            </span>
          </div>
        </div>

        {/* Nut chon quality - goc duoi phai */}
        <div ref={menuRef} className="absolute bottom-12 right-2" style={{ zIndex: 40 }}>
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
            aria-label="Select quality"
          >
            <MdHighQuality className="w-4 h-4 text-white" />
          </button>

          {/* Menu chon bitrate */}
          {showMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden pointer-events-auto">
              {/* Header */}
              <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                <MdHighQuality className="text-amber-400 w-4 h-4" />
                <span className="text-white text-xs font-semibold tracking-wider">SELECT BITRATE</span>
              </div>

              {/* Danh sach nhom bitrate */}
              <div className="max-h-64 overflow-y-auto">
                {bitrateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 py-1.5 text-[9px] font-bold text-gray-500 tracking-widest uppercase">
                      {group.label}
                    </div>
                    {group.items.map((v) => {
                      const isSelected = v.id === effectiveSelectedId;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(v.id);
                            setShowMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? "bg-amber-600/30 text-amber-300"
                              : "text-gray-300 hover:bg-gray-800/80"
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {formatBitrate(v.bitrateBps)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-mono">
                              {(v.bitrateBps / 1000).toFixed(0)}k
                            </span>
                            {isSelected && (
                              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComparePlayer;
