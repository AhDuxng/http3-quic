const fs = require("fs");
const path = require("path");
const { media2Dir } = require("../constants/paths");

function getVideoInfo() {
  return {
    title: "HTTP/3 Video Streaming Demo",
    description:
      "Adaptive bitrate streaming qua DASH. Thu chuyen kich ban mang de thay video tu dong thay doi chat luong.",
    manifestUrl: "/media/stream.mpd",
  };
}

function getMedia2Videos() {
  try {
    const entries = fs.readdirSync(media2Dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((dirEntry) => {
        const match = dirEntry.name.match(/(\d+)bps$/);
        const bitrateBps = match ? Number(match[1]) : 0;
        const files = fs.readdirSync(path.join(media2Dir, dirEntry.name));
        const videoFile = files.find((file) => file.endsWith(".mp4")) || "";

        return {
          id: dirEntry.name,
          label: `${(bitrateBps / 1000).toFixed(0)} kbps`,
          bitrateBps,
          url: videoFile ? `/media-2/${dirEntry.name}/${videoFile}` : "",
        };
      })
      .filter((video) => video.url && video.bitrateBps > 0)
      .sort((firstVideo, secondVideo) => firstVideo.bitrateBps - secondVideo.bitrateBps);
  } catch {
    return [];
  }
}

module.exports = { getVideoInfo, getMedia2Videos };
