/**
 * paths.js - Dinh nghia cac duong dan hang so cua project.
 *
 * Tap trung quan ly duong dan, tranh hardcode rong rai trong code.
 * Dung path.join de dam bao tuong thich tren ca Windows va Linux.
 *
 * Cau truc thu muc:
 *   youtube-clone-quic/
 *   ├── media/       <- MEDIA_DIR (video chunks, manifest)
 *   └── backend/     <- PROJECT_ROOT
 *       └── src/constants/paths.js (file nay)
 */
const path = require("path");

// Thu muc goc cua backend: backend/
// __dirname = backend/src/constants -> len 2 cap = backend/
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Thu muc chua file media: ngang hang voi backend/, o goc repository
const MEDIA_DIR = path.join(PROJECT_ROOT, "..", "media");

// Thu muc chua video chia theo bitrate (non-segmented MP4)
const MEDIA2_DIR = path.join(PROJECT_ROOT, "..", "media-2");

module.exports = {
  PROJECT_ROOT,
  MEDIA_DIR,
  MEDIA2_DIR,
};
