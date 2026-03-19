/**
 * createApp.js - Khoi tao va cau hinh Express application.
 *
 * Toan bo middleware va routes deu duoc dang ky tai day.
 * Tat ca cau hinh doc tu module env.js, khong hardcode.
 *
 * Pattern: Factory Function - tra ve app instance thay vi export truc tiep,
 * giup de test va tranh shared state giua cac test case.
 */
const express = require("express");
const cors = require("cors");
const { MEDIA_DIR, MEDIA2_DIR } = require("../constants/paths");
const { env } = require("../config/env");
const { createApiRouter } = require("../routes/apiRoutes");

/**
 * Tao va tra ve Express app da cau hinh day du.
 * @returns {import("express").Express}
 */
function createApp() {
  const app = express();

  // Cau hinh CORS:
  // - Neu CORS_ORIGIN = "*": cho phep tat ca origin
  // - Neu la danh sach phan cach bang dau phay: parse thanh mang string
  const corsOrigins =
    env.corsOrigin === "*"
      ? "*"
      : env.corsOrigin.split(",").map((s) => s.trim());

  app.use(cors({ origin: corsOrigins }));

  // Middleware parse JSON body cho cac POST/PUT request
  app.use(express.json());

  // Serve file media tinh (video chunks .m4s, manifest .mpd)
  // URL: /media/* -> thu muc MEDIA_DIR tren filesystem
  app.use("/media", express.static(MEDIA_DIR));

  // Serve file video MP4 chia theo bitrate
  // URL: /media-2/* -> thu muc MEDIA2_DIR tren filesystem
  app.use("/media-2", express.static(MEDIA2_DIR));

  // Mount API router tai /api
  // Moi route trong router se co prefix /api tu dong
  app.use("/api", createApiRouter());

  // Health check endpoint - dung cho Docker healthcheck, load balancer, monitoring
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
