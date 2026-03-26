/**
 * apiRoutes.js - Dinh nghia cac API routes cua backend.
 *
 * Nguyen tac: Router chi la "router" - nhan request va chuyen cho controller,
 * khong chua bat ky logic xu ly du lieu nao.
 *
 * Pattern: Router Factory Function - tra ve Router instance thay vi export truc tiep,
 * giup de dang ky vao app voi prefix tuy chon va de test doc lap.
 *
 * Routes hien co:
 *   GET /api/video-info    -> tra ve metadata cua video stream
 *   GET /api/media2-videos -> tra ve danh sach video chia theo bitrate tu media-2
 */
const express = require("express");
const { getVideoInfo, getMedia2Videos } = require("../controllers/videoController");
const { applyNetworkScenario } = require("../controllers/networkController");

/**
 * Tao va tra ve Express Router cho nhom /api.
 * @returns {import("express").Router}
 */
function createApiRouter() {
  const router = express.Router();

  // GET /api/video-info
  router.get("/video-info", (_req, res) => {
    res.json(getVideoInfo());
  });

  // GET /api/media2-videos
  // Tra ve danh sach video MP4 trong media-2, chia theo bitrate
  router.get("/media2-videos", (_req, res) => {
    res.json(getMedia2Videos());
  });

  // POST /api/network-scenario
  // Xy ly limit bang thong hoac delay qua tc (chay tren Caddy container)
  router.post("/network-scenario", applyNetworkScenario);

  // GET /api/protocol-info
  // Tra ve thong tin giao thuc HTTP dang duoc dung giua browser va Caddy
  // Caddy forward header X-Forwarded-Proto va co the them Via/X-Protocol
  router.get("/protocol-info", (req, res) => {
    // X-Forwarded-Proto: giao thuc browser dung de den Caddy (https = co TLS)
    const forwardedProto = req.headers["x-forwarded-proto"] || "";
    // Via header: co the chua thong tin version HTTP (vi du: "2 caddy")
    const via = req.headers["via"] || "";
    // Caddy them x-forwarded-for cho IP thuc
    const forwardedFor = req.headers["x-forwarded-for"] || "";

    // Phan tich giao thuc dang dung:
    // - HTTPS + via "3" hoac "h3" = HTTP/3 (QUIC)
    // - HTTPS + http/2 = HTTP/2
    // - HTTPS = HTTP/1.1 voi TLS
    // - HTTP = HTTP/1.1 plain
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
      // Thong tin request hien tai tu backend perspective (luon la HTTP vi backend o trong Docker)
      httpVersion: req.httpVersion,
    });
  });

  return router;
}

module.exports = { createApiRouter };

