const express = require("express");
const cors = require("cors");
const { videoDir } = require("../constants/paths");
const { env } = require("../config/env");
const { createApiRouter } = require("../routes/apiRoutes");

function createApp() {
  const app = express();

  const corsOrigins =
    env.corsOrigin === "*"
      ? "*"
      : env.corsOrigin.split(",").map((origin) => origin.trim());

  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());
  app.use("/video", express.static(videoDir));
  app.use("/api", createApiRouter());
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
