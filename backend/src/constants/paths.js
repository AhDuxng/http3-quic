const path = require("path");

const projectRoot = path.join(__dirname, "..", "..");
const mediaDir = path.join(projectRoot, "..", "media");
const media2Dir = path.join(projectRoot, "..", "media-2");
const videoDir = path.join(projectRoot, "..", "video");

module.exports = { projectRoot, mediaDir, media2Dir, videoDir };
