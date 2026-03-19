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

  return router;
}

module.exports = { createApiRouter };

