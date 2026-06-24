const express = require("express");
const { getVideoInfo, getMedia2Videos } = require("../controllers/videoController");
const { applyNetworkScenario } = require("../controllers/networkController");

function createApiRouter() {
  const router = express.Router();

  router.get("/video-info", (_req, res) => {
    res.json(getVideoInfo());
  });

  router.get("/media2-videos", (_req, res) => {
    res.json(getMedia2Videos());
  });

  router.post("/network-scenario", applyNetworkScenario);

  router.get("/protocol-info", (req, res) => {
    const forwardedProto = req.headers["x-forwarded-proto"] || "";
    const via = req.headers["via"] || "";
    const forwardedFor = req.headers["x-forwarded-for"] || "";
    let detectedProtocol = "HTTP/1.1";
    const viaLower = via.toLowerCase();
    if (viaLower.includes("h3") || viaLower.includes("/3") || viaLower.includes("quic")) {
      detectedProtocol = "HTTP/3 (QUIC)";
    } else if (forwardedProto === "https" || req.secure) {
      detectedProtocol = "HTTPS";
    }

    res.json({
      protocol: detectedProtocol,
      forwardedProto,
      via,
      forwardedFor,
      httpVersion: req.httpVersion,
    });
  });

  return router;
}

module.exports = { createApiRouter };
