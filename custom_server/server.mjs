import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import path from "node:path";
import { performance } from "node:perf_hooks";

const mode = process.env.CUSTOM_MODE || "mpquic";
const tlsPort = Number(process.env.CUSTOM_HTTPS_PORT || 443);
const httpPort = Number(process.env.CUSTOM_HTTP_PORT || 80);
const backendPort = Number(process.env.PORT || 3000);
const certFile = process.env.TLS_CERT_FILE || "/var/lib/custom-server/cert/server.crt";
const keyFile = process.env.TLS_KEY_FILE || "/var/lib/custom-server/cert/server.key";
const videoRoot = path.resolve(process.env.VIDEO_ROOT || "/srv/video");
const logFile = process.env.ACCESS_LOG || "/var/log/custom-server/access.jsonl";
const runIdDefault = process.env.RUN_ID || `run-${new Date().toISOString()}`;
const scheduler = mode === "mpquic" ? "picoquic-default" : mode === "quic" ? "single-path" : "kernel-tcp";
const advertiseH3 = mode !== "h2" && process.env.CUSTOM_ADVERTISE_H3 !== "false";

const mimeByExtension = new Map([
  [".mpd", "application/dash+xml"],
  [".m4s", "video/iso.segment"],
  [".mp4", "video/mp4"],
  [".m3u8", "application/vnd.apple.mpegurl"],
  [".ts", "video/mp2t"],
  [".webm", "video/webm"],
  [".json", "application/json"],
]);

fs.mkdirSync(path.dirname(logFile), { recursive: true });

function appendLog(record) {
  fs.appendFile(logFile, `${JSON.stringify(record)}\n`, () => {});
}

function applyCommonHeaders(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, HEAD, POST, PUT, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type, Authorization, Range, X-Run-Id");
  res.setHeader("timing-allow-origin", "*");
  if (advertiseH3) res.setHeader("alt-svc", `h3=\":${tlsPort}\"; ma=86400`);
}

function instrumentResponse(req, res) {
  const startedAt = performance.now();
  let bytes = 0;
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = (chunk, encoding, callback) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    return originalWrite(chunk, encoding, callback);
  };
  res.end = (chunk, encoding, callback) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    return originalEnd(chunk, encoding, callback);
  };

  res.once("finish", () => {
    const requestPath = new URL(req.url || "/", "https://custom.invalid").pathname;
    appendLog({
      timestamp_utc: new Date().toISOString(),
      protocol: req.httpVersionMajor === 2 ? "h2" : "http/1.1",
      run_id: String(req.headers["x-run-id"] || runIdDefault),
      segment: requestPath.startsWith("/video/") ? path.basename(requestPath) : null,
      request_path: requestPath,
      status: res.statusCode,
      download_time_ms: Number((performance.now() - startedAt).toFixed(3)),
      bytes,
      rtt_ms: null,
      loss: null,
      cwnd_bytes: null,
      path_id: null,
      scheduler: "kernel-tcp",
      metric_scope: "server-response",
    });
  });
}

function safeVideoPath(pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice("/video/".length));
  } catch {
    return null;
  }
  if (!relative || relative.includes("\0")) return null;
  const resolved = path.resolve(videoRoot, relative);
  return resolved.startsWith(`${videoRoot}${path.sep}`) ? resolved : null;
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value).trim());
  if (!match) return false;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    start ??= 0;
    end ??= size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return false;
  }
  return { start, end: Math.min(end, size - 1) };
}

function serveVideo(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD, OPTIONS");
    res.end("Method Not Allowed");
    return;
  }

  const file = safeVideoPath(pathname);
  if (!file) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const range = parseRange(req.headers.range, stat.size);
    if (range === false) {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${stat.size}`);
      res.end();
      return;
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? stat.size - 1;
    const contentLength = end - start + 1;
    res.statusCode = range ? 206 : 200;
    res.setHeader("content-type", mimeByExtension.get(path.extname(file).toLowerCase()) || "application/octet-stream");
    res.setHeader("content-length", String(contentLength));
    res.setHeader("accept-ranges", "bytes");
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
    if (range) res.setHeader("content-range", `bytes ${start}-${end}/${stat.size}`);
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const input = fs.createReadStream(file, { start, end });
    input.on("error", () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    input.pipe(res);
  });
}

const blockedProxyHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

function proxyRequest(req, res, hostname, port) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!name.startsWith(":") && !blockedProxyHeaders.has(name) && value !== undefined) {
      headers[name] = value;
    }
  }
  headers.host = hostname;

  const handleProxyError = (error) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json");
    }
    if (!res.writableEnded) res.end(JSON.stringify({ error: "upstream_unavailable", detail: error.message }));
  };

  let upstream;
  try {
    upstream = http.request({ hostname, port, path: req.url, method: req.method, headers }, (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode || 502;
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (!blockedProxyHeaders.has(name) && value !== undefined) res.setHeader(name, value);
      }
      applyCommonHeaders(res);
      upstreamRes.pipe(res);
    });
  } catch (error) {
    handleProxyError(error);
    return;
  }
  upstream.on("error", (error) => {
    handleProxyError(error);
  });
  req.pipe(upstream);
}

const tlsServer = http2.createSecureServer({
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
  allowHTTP1: true,
  minVersion: "TLSv1.3",
  ALPNProtocols: ["h2", "http/1.1"],
});

tlsServer.on("request", (req, res) => {
  instrumentResponse(req, res);
  applyCommonHeaders(res);
  const pathname = new URL(req.url || "/", "https://custom.invalid").pathname;

  if (pathname === "/custom-server/info" || pathname === "/custom-server-info.json") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ server: "custom", mode, h2: true, h3: mode !== "h2", multipath: mode === "mpquic", scheduler, advertise_h3: advertiseH3 }));
  } else if (pathname.startsWith("/video/")) {
    serveVideo(req, res, pathname);
  } else if (pathname.startsWith("/api/") || pathname === "/health") {
    proxyRequest(req, res, "127.0.0.1", backendPort);
  } else {
    proxyRequest(req, res, process.env.FRONTEND_HOST || "frontend", Number(process.env.FRONTEND_PORT || 80));
  }
});

tlsServer.on("sessionError", (error) => console.error(`[custom:h2] ${error.message}`));
tlsServer.listen(tlsPort, "0.0.0.0", () => {
  console.log(`[custom:h2] TCP/${tlsPort}, TLS 1.3, ALPN h2; mode=${mode}`);
});

const redirectServer = http.createServer((req, res) => {
  const host = String(req.headers.host || process.env.DOMAIN || "localhost").replace(/:\d+$/, "");
  res.writeHead(301, { location: `https://${host}${req.url || "/"}` });
  res.end();
});
redirectServer.listen(httpPort, "0.0.0.0", () => console.log(`[custom:http] TCP/${httpPort} redirect`));

function shutdown() {
  redirectServer.close();
  tlsServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
