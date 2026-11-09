/**
 * Filesystem paths shared by the backend. videoDir points to the repository-
 * level video/ directory that holds the DASH datasets.
 */

const path = require("path");

const projectRoot = path.join(__dirname, "..", "..");
const videoDir = path.join(projectRoot, "..", "video");

module.exports = { projectRoot, videoDir };
