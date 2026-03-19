/**
 * videoController.js - Controller xu ly cac yeu cau lien quan den video.
 *
 * Controller chua logic nghiep vu (business logic) cho video module.
 * Hien tai tra ve du lieu tinh (static), co the mo rong sau:
 * - Doc tu database
 * - Doc tu file config
 * - Tao dong tu ten file trong thu muc media
 *
 * Nguyen tac: Controller khong biet gi ve Express request/response,
 * chi tra ve du lieu thuan tuy. Viec map vao res.json() la cua router.
 */
const fs = require("fs");
const path = require("path");
const { MEDIA2_DIR } = require("../constants/paths");

/**
 * Tra ve thong tin metadata cua video stream.
 *
 * manifestUrl: duong dan tuong doi, Caddy se serve file .mpd nay tu /srv/media.
 *
 * @returns {import("../type/video").VideoInfo}
 */
function getVideoInfo() {
  return {
    title: "HTTP/3 Video Streaming Demo",
    description:
      "Adaptive bitrate streaming qua DASH. Thu chuyen kich ban mang de thay video tu dong thay doi chat luong.",
    manifestUrl: "/media/stream.mpd",
  };
}

/**
 * Scan thu muc media-2 va tra ve danh sach video chia theo bitrate.
 * Moi thu muc con co dang: bunny_<bitrate>bps/BigBuckBunny_4snonSeg.mp4
 *
 * @returns {Array<{id: string, label: string, bitrateBps: number, url: string}>}
 */
function getMedia2Videos() {
  try {
    const entries = fs.readdirSync(MEDIA2_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((dir) => {
        // Trich xuat bitrate tu ten thu muc (vd: bunny_1008699bps -> 1008699)
        const match = dir.name.match(/(\d+)bps$/);
        const bitrateBps = match ? Number(match[1]) : 0;

        // Tim file video trong thu muc
        const files = fs.readdirSync(path.join(MEDIA2_DIR, dir.name));
        const videoFile = files.find((f) => f.endsWith(".mp4")) || "";

        return {
          id: dir.name,
          label: `${(bitrateBps / 1000).toFixed(0)} kbps`,
          bitrateBps,
          url: videoFile ? `/media-2/${dir.name}/${videoFile}` : "",
        };
      })
      .filter((v) => v.url && v.bitrateBps > 0)
      .sort((a, b) => a.bitrateBps - b.bitrateBps);
  } catch {
    return [];
  }
}

module.exports = { getVideoInfo, getMedia2Videos };

