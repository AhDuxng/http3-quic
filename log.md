# Log Metrics Guide

This document explains the metrics in the console log panel and CSV export (`adtube-metrics-*.csv`).

## 1) Log Entry Structure (UI)

Each log entry in the panel has 4 columns:

- **Timestamp**: event creation time, format `HH:mm:ss.cs` (cs = centisecond).
- **Level**: log severity (`SYS`, `NET`, `INFO`, `WARN`, `ERRO`).
- **Protocol**: detected network protocol at log time (e.g. `HTTP/3 (QUIC)`, `HTTP/2`).
- **Message**: event description.

Note: the system uses "per-log snapshots" — each log entry holds its own set of metrics at the time of creation.

## 2) Log Level Definitions

- **SYS**: system/player events (init, start, pause, manifest load, stall resolve...).
- **NET**: segment download events (size, SDT, TTFB...).
- **INFO**: informational (scenario applied, quality upgraded...).
- **WARN**: warnings (quality reduced, stall detected, rebuffering...).
- **ERRO**: errors (player error, API failure...).

## 3) CSV Columns

### Event Group

- `Timestamp`: event creation time.
- `Level`: log severity.
- `Message`: event description.

### Video Quality Group

- `Resolution`: current resolution (`WxH`).
- `Bitrate_kbps`: current representation bitrate (kbps).
- `Throughput_kbps`: measured throughput (kbps).
- `FPS`: realtime frame rate from `VideoPlaybackQuality`.
- `DroppedFrames`: cumulative dropped frames.
- `TotalFrames`: cumulative rendered frames.
- `Codec`: current representation codec (e.g. `avc1...`).
- `QualityIndex`: current quality index (0-based).
- `QualityCount`: total quality levels.
- `QualitySwitchCount`: number of quality changes in session.

### Buffer & Playback Group

- `Buffer_s`: video buffer occupancy (seconds).
- `CurrentTime_s`: playback position (seconds).
- `Duration_s`: total media duration (seconds).
- `StallCount`: number of stall events (dash.js `BUFFER_EMPTY`).
- `StallDuration_ms`: cumulative stall duration (ms).
- `RebufferCount`: number of rebuffer events (HTML5 `waiting`).
- `RebufferDuration_ms`: cumulative rebuffer duration (ms).
- `RebufferingRatio`: `totalStallDuration / totalPlaybackDuration` (ratio, 0–1).

### Network / Segment Group

- `Protocol`: detected protocol from Resource Timing (`nextHopProtocol`).
- `TTFB_ms`: Time To First Byte — `responseStart - requestStart` (ms).
- `Jitter_ms`: SDT Jitter — `|SDT_current - SDT_previous|` (ms).
- `SegmentDownloadTime_ms`: Segment Download Time — total segment fetch time (ms).
- `DownloadSpeed_kbps`: segment download speed (kbps).
- `SegmentSize_KB`: segment size (KB).
- `TotalDownloaded_MB`: cumulative download (MB).
- `ConnectionType`: browser-reported connection type (e.g. `4g`, `wifi`).
- `EstimatedBandwidth_Mbps`: browser-estimated bandwidth from `Network Information API` (Mbps).

### Control Context

- `IsAutoQuality`: quality mode at log time (`true` = ABR auto, `false` = manual).
- `ActiveScenario`: active network scenario name.

## 4) Key Formulas

- `DownloadSpeed_kbps = (bytesLoaded × 8) / SegmentDownloadTime_ms`
- `Throughput_kbps = average of segment DL speeds in recent window`
- `Jitter_ms = |SDT_now − SDT_prev|` (SDT = Segment Download Time)
- `TTFB_ms = responseStart − requestStart` (from PerformanceResourceTiming API)
- `RebufferingRatio = totalStallDuration / (currentTime × 1000)`

## 5) Why same level but different metrics?

Each log is an independent snapshot. Two `NET` or `SYS` entries can have different metrics if created at different times.

## 6) Stall vs Rebuffer

The system tracks buffering events from TWO sources:

| Metric | Source | Description |
|---|---|---|
| Stall Count / Duration | dash.js `BUFFER_EMPTY` → `BUFFER_LOADED` | More accurate — detects actual buffer depletion at player level |
| Rebuffer Count / Duration | HTML5 `waiting` → `play` events | Complementary — captures browser-level buffering |

Both are logged for academic comparison. **Stall metrics** (from dash.js events) are recommended as the primary indicator for research papers.

## 7) Accuracy Notes

- TTFB requires `Timing-Allow-Origin` header on the server. Without it, browser zeros out timing values.
- Protocol detection uses `PerformanceResourceTiming.nextHopProtocol`.
- Network context metrics depend on browser support (`Network Information API`).
- Some fields may fallback to default values (`DASH / HTTPS`, `0`, or `—`) if browser doesn't expose data.
- CSV is exported with UTF-8 BOM for Excel compatibility.
