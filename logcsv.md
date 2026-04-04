# CSV Log Metrics Reference

This document describes all columns in the CSV file exported via "Download CSV" (`adtube-metrics-*.csv`).

## 1) Overview

Each CSV row is a metric snapshot at the moment a log event was created.
This means:

- Rows may share the same `Level` but have different metric values.
- Values represent the state at the time of the event, not the "current" state when viewing the file.

## 2) Column Definitions

### Event Context

| CSV Column | Academic Name | Unit | Source |
|---|---|---|---|
| Timestamp | — | `HH:mm:ss.cs` | Log system |
| Level | — | Text (`SYS`, `NET`, `INFO`, `WARN`, `ERRO`) | Log system |
| Message | — | Text | Log system |

### Video Quality

| CSV Column | Academic Name | Unit | Source |
|---|---|---|---|
| Resolution | Video Resolution | `WxH` | dash.js representation |
| Bitrate_kbps | Video Bitrate | kbps | representation `bitrateInKbit`/`bandwidth` |
| Throughput_kbps | Throughput | kbps | Segment samples + dash.js fallback |
| Buffer_s | Buffer Occupancy | seconds | `player.getBufferLength("video")` |
| FPS | Frame Rate | fps | `getVideoPlaybackQuality()` |
| DroppedFrames | Dropped Frames | frames | `VideoPlaybackQuality` |
| TotalFrames | Total Frames | frames | `VideoPlaybackQuality` |
| Codec | Codec | Text | Representation info |
| QualityIndex | Quality Index | integer (0-based) | Matched in reps list |
| QualityCount | Quality Levels | integer | Reps list length |
| QualitySwitchCount | Quality Switch Count | events | Quality change events |

### Network / Segment Metrics

| CSV Column | Academic Name | Unit | Source | Accuracy |
|---|---|---|---|---|
| TTFB_ms | Time To First Byte (TTFB) | ms | `PerformanceResourceTiming: responseStart - requestStart` | ✅ High (requires `Timing-Allow-Origin` header) |
| Jitter_ms | SDT Jitter | ms | `\|SDT_current - SDT_previous\|` | ✅ Computed |
| SegmentDownloadTime_ms | Segment Download Time (SDT) | ms | Request timing `endDate - startDate` | ✅ High |
| DownloadSpeed_kbps | Segment Download Speed | kbps | `(bytesLoaded * 8) / SDT` | ✅ Computed |
| SegmentSize_KB | Segment Size | KB | Request bytes | ✅ Direct |
| TotalDownloaded_MB | Total Downloaded | MB | Cumulative bytes | ✅ Cumulative |
| Protocol | Network Protocol | Text | Resource Timing `nextHopProtocol` | ✅ Browser API |
| ConnectionType | Connection Type | Text (e.g. `4g`) | Network Information API | ⚠️ Browser-dependent |
| EstimatedBandwidth_Mbps | Estimated Bandwidth | Mbps | Network Information API (`downlink`) | ⚠️ Browser-dependent |

### Playback Stability (Stalling)

| CSV Column | Academic Name | Unit | Source | Description |
|---|---|---|---|---|
| StallCount | Stall Count | events | dash.js `BUFFER_EMPTY` event | Number of buffer depletion events (academically standard) |
| StallDuration_ms | Total Stall Duration | ms | `BUFFER_EMPTY → BUFFER_LOADED` timing | Cumulative time in stalled state |
| RebufferCount | Rebuffer Count | events | HTML5 video `waiting` event | Complementary measurement |
| RebufferDuration_ms | Total Rebuffer Duration | ms | `waiting → play` timing | Cumulative time in buffering state |
| RebufferingRatio | Rebuffering Ratio | ratio [0,1] | `totalStallDuration / totalPlaybackDuration` | Key QoE metric for research |

### Playback Position

| CSV Column | Academic Name | Unit | Source |
|---|---|---|---|
| CurrentTime_s | Playback Position | seconds | `HTMLVideoElement.currentTime` |
| Duration_s | Media Duration | seconds | `HTMLVideoElement.duration` |

### Control Context

| CSV Column | Description |
|---|---|
| IsAutoQuality | `true` = Auto ABR, `false` = Manual quality |
| ActiveScenario | Currently active network scenario name |

## 3) Key Formulas

- `DownloadSpeed_kbps = (bytesLoaded × 8) / SegmentDownloadTime_ms`
- `Jitter_ms = |SDT_current − SDT_previous|`
- `TTFB_ms = responseStart − requestStart` (Performance Resource Timing API)
- `RebufferingRatio = totalStallDuration / (currentTime × 1000)`
- `Throughput_kbps`: weighted average of recent segment download speeds; fallback to player API.

## 4) Quick Analysis Guide

- **Video quality**: `Bitrate_kbps`, `QualityIndex`, `QualitySwitchCount`
- **Playback stability**: `StallCount`, `StallDuration_ms`, `RebufferingRatio`, `Buffer_s`, `DroppedFrames`
- **Network performance**: `TTFB_ms`, `Jitter_ms`, `SegmentDownloadTime_ms`, `DownloadSpeed_kbps`, `Protocol`
- **Connection context**: `ConnectionType`, `EstimatedBandwidth_Mbps`, `ActiveScenario`

## 5) Metric Naming Conventions

All metric names follow conventions used in IEEE/ACM adaptive streaming QoE literature:

- **SDT** (Segment Download Time) — not "Latency" (which was ambiguous)
- **TTFB** (Time To First Byte) — not "RTT" (which cannot be accurately measured from browser)
- **Stall Count/Duration** — measured via dash.js `BUFFER_EMPTY`/`BUFFER_LOADED` events
- **Rebuffering Ratio** — standard QoE metric: `total_stall_time / total_playback_time`

## 6) Important Notes

- `Protocol` and network metrics depend on browser API support (`Resource Timing`, `Network Information API`).
- If browser doesn't expose full data, some fields may fallback (`DASH / HTTPS`, `0`, or `—`).
- CSV is exported with UTF-8 BOM for compatibility with Excel.
- The `Timing-Allow-Origin` header must be set on the media server for accurate TTFB measurement.
