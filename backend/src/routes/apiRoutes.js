const express = require("express");
const { applyNetworkScenario } = require("../controllers/networkController");

function createApiRouter() {
  const router = express.Router();

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
