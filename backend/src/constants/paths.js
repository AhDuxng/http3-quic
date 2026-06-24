const path = require("path");

const projectRoot = path.join(__dirname, "..", "..");
const videoDir = path.join(projectRoot, "..", "video");

module.exports = { projectRoot, videoDir };
