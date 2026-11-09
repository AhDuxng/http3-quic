# Network QoS and Video QoE Metrics

This document summarizes the key metrics for evaluating video delivery quality, particularly when comparing streaming protocols or mechanisms such as MPEG-DASH/dash.js, HLS/LL-HLS, WebRTC, SRT, RTMP, or variants running over TCP, QUIC, or UDP.

The final part of the document provides sample TypeScript code for `dash.js` to measure the metrics that can be observed on the browser side. Some metrics, such as true packet loss, true RTT at the IP/TCP layer, VMAF/PSNR/SSIM, MOS, or true Glass-to-Glass Latency, cannot be measured accurately with `dash.js` alone; for each of these, the document states the correct measurement method or an estimation approach.

---

## 1. Network Quality Metrics

### 1.1. Throughput / Effective Bandwidth

**Throughput** is the actual download data rate over a given time interval.

Formula:

```text
Throughput = total_bytes_received * 8 / download_time
```

Common units:

```text
bps, Kbps, Mbps
```

In streaming, the more stable the throughput, the more easily the ABR algorithm can select high-quality representations without causing rebuffering.

With dash.js, throughput can be measured using:

```ts
player.getAverageThroughput('video')
```

or computed directly from segment download time:

```text
segment_throughput_mbps = segment_bytes * 8 / segment_download_time_ms / 1000
```

---

### 1.2. RTT / Network-Layer Latency

**RTT** is the time it takes for a packet to travel from the client to the server and back to the client.

```text
RTT = time_response_arrives - time_request_sent
```

In the browser, JavaScript cannot measure the true IP/TCP RTT. For DASH over HTTP, typically only an **approximate HTTP request latency / TTFB** can be measured:

```text
HTTP_request_latency ≈ responseStart - requestStart
```

This metric remains useful for comparing initial responsiveness across CDNs, servers, or network configurations, but it should not be called true RTT unless it is measured with `ping`, `tcpdump`, `tcptrace`, QUIC logs, or server-side telemetry.

---

### 1.3. Jitter

**Jitter** is the variation in latency.

In real-time streaming, high jitter can cause audio dropouts, video stutter, or larger buffering requirements.

A simple calculation from consecutive latency samples:

```text
jitter = average(abs(latency[i] - latency[i - 1]))
```

In dash.js, jitter is usually estimated from the series of HTTP request latency/TTFB values or fragment download times. This is not standard RTP jitter, but it can be used to analyze network variability at the application layer.

---

### 1.4. Packet Loss Rate

**Packet Loss Rate** is the fraction of packets that are lost.

```text
packet_loss_rate = lost_packets / total_packets
```

In the browser and in dash.js, true packet loss at the IP/TCP/QUIC layer cannot be measured, because the browser does not expose the number of lost packets or retransmissions.

Correct measurement methods:

- Use `tc -s qdisc`, `netem`, `tcpdump`, `Wireshark`, `ss`, QUIC logs, or server-side transport logs.
- For WebRTC, `RTCPeerConnection.getStats()` can be used to obtain `packetsLost`.

With dash.js, only a proxy metric should be used:

```text
loss_proxy_rate = (failed_fragment_requests + abandoned_fragment_requests) / total_fragment_requests
```

---

### 1.5. Connection Setup Time

**Connection Setup Time** is the time required to establish a connection, including DNS resolution, the TCP handshake, the TLS handshake, and the time to issue the first request.

Using the Resource Timing API:

```text
dns_time = domainLookupEnd - domainLookupStart
connect_time = connectEnd - connectStart
secure_handshake_time = connectEnd - secureConnectionStart
connection_setup_time = connectEnd - (domainLookupStart > 0 ? domainLookupStart : connectStart)
```

Note: if the CDN does not enable `Timing-Allow-Origin`, many Resource Timing fields may be `0` or contain insufficient data.

---

### 1.6. Encoded Payload Rate (Browser-Side Approximation)

**True transport goodput** is the amount of useful data successfully delivered per second after excluding all overhead and retransmissions. The browser does not expose enough QUIC/TLS/IP counters to measure this quantity accurately.

```text
encoded_payload_rate = encoded_media_bytes * 8 / download_time
```

In the browser, this should be explicitly labeled as the **encoded payload rate**:

```text
encoded_media_bytes ≈ encodedBodySize or bytesLoaded
```

The term goodput should be used only when dedicated transport telemetry is available that is sufficient to subtract framing, headers, and retransmissions.

---

### 1.7. Resource Timing Sizes and Transport Overhead

`transferSize - encodedBodySize` must not be used as TCP/TLS/QUIC overhead. The Resource Timing `transferSize` is subject to information-obfuscation rules and may contain a fixed estimated value; it also does not provide retransmitted bytes or complete transport-layer framing.

```text
resource_timing_size_delta = transferSize - encodedBodySize
```

`transferSize`, `encodedBodySize`, and the delta may be exported separately to inspect Resource Timing behavior, but the delta must not be labeled as overhead. Measuring wire overhead requires qlog/pcap or server-side/transport telemetry.

---

## 2. User Experience Metrics

### 2.1. Startup Delay / Video Startup Time

**Startup Delay** is the time from when the user presses Play until the first frame appears.

```text
startup_delay = first_frame_time - play_request_time
```

This is one of the most important QoE metrics for both VOD and live streaming.

In the browser, it can be measured using:

- `loadeddata`: the first frame has been loaded.
- `playing`: the video has started playing.
- `requestVideoFrameCallback`: measures closely the moment the first frame is rendered.

---

### 2.2. Rebuffering Ratio

**Rebuffering Ratio** is the fraction of time during which video playback is stalled to refill the buffer.

```text
rebuffering_ratio = total_rebuffering_time / total_session_time
```

A commonly used formula:

```text
rebuffering_ratio = total_stall_time / (total_playing_time + total_stall_time)
```

---

### 2.3. Rebuffering Frequency

**Rebuffering Frequency** is the number of times playback stalls to refill the buffer during a viewing session.

```text
rebuffering_frequency = number_of_rebuffering_events
```

In the browser, these can be counted via the following events:

- `waiting`
- `stalled`
- dash.js `PLAYBACK_WAITING`
- dash.js `PLAYBACK_STALLED`

Waiting states before the first frame should be excluded, since they belong to Startup Delay rather than rebuffering.

---

### 2.4. Quality Switches / Bitrate Adaptations

**Quality Switches** is the number of times the ABR algorithm changes the video quality.

```text
quality_switch_count = number_of_quality_change_rendered_events
```

This can be broken down into:

```text
up_switches
down_switches
```

Abrupt down-switches typically have a stronger impact on QoE than up-switches.

---

### 2.5. Average Bitrate / Average Resolution

**Average Bitrate** is the average bitrate actually viewed by the user during the session.

Time-weighted average formula:

```text
average_bitrate = sum(bitrate_i * duration_i) / sum(duration_i)
```

Similarly for resolution:

```text
average_resolution_height = sum(height_i * duration_i) / sum(duration_i)
```

---

### 2.6. End-to-End Latency / Glass-to-Glass Latency

**Glass-to-Glass Latency** is the delay from the moment an image is captured by the camera until it is displayed on the viewer's screen.

```text
glass_to_glass_latency = display_time_at_receiver - capture_time_at_camera
```

For live DASH with dash.js, the latency relative to the live edge can be obtained:

```ts
player.getCurrentLiveLatency()
```

However, this is the **player's live latency**, not the true Glass-to-Glass latency. A standard Glass-to-Glass measurement requires one of the following:

- Filming a stopwatch at the source and comparing it with the receiving screen.
- Inserting timestamps at the encoder and reading them at the decoder.
- Using PRFT (Producer Reference Time) if the pipeline supports it.

---

### 2.7. Frame Drops / Frozen Frames

**Frame Drops** is the number of frames that are skipped.

In the browser:

```ts
video.getVideoPlaybackQuality().droppedVideoFrames
```

**Frozen Frames** are intervals during which the video image is frozen even though the playback session has not ended. They can be estimated with `requestVideoFrameCallback`: if wall-clock time elapses but `mediaTime` does not advance within a threshold, the interval is treated as a frozen-frame interval.

---

### 2.8. Audio/Video Sync

**AV Sync** is the offset between audio and video.

```text
av_sync_error = audio_presentation_time - video_presentation_time
```

Browsers and dash.js generally do not expose separate audio and video PTS values to JavaScript. Standard measurement requires instrumentation in a native decoder/player, a WebCodecs pipeline, a dedicated test stream with beep/flash markers, or analysis of a recording of the output.

---

### 2.9. Objective Video Quality: VMAF, PSNR, SSIM

These metrics require comparing the original video with the video after compression/delivery.

- **VMAF**: a metric developed by Netflix that, in many cases, correlates more closely with visual perception than PSNR/SSIM.
- **PSNR**: measures signal distortion using a mathematical formula.
- **SSIM**: measures the structural similarity of images.

These cannot be computed in a standard way from dash.js in the browser alone, because both the original video file and the received/recorded video are required.

Example measurements with FFmpeg:

```bash
ffmpeg -i distorted.mp4 -i reference.mp4 \
  -lavfi libvmaf="model_path=vmaf_v0.6.1.json:log_fmt=json:log_path=vmaf.json" \
  -f null -

ffmpeg -i distorted.mp4 -i reference.mp4 \
  -lavfi psnr="stats_file=psnr.log" \
  -f null -

ffmpeg -i distorted.mp4 -i reference.mp4 \
  -lavfi ssim="stats_file=ssim.log" \
  -f null -
```

---

### 2.10. MOS

**MOS (Mean Opinion Score)** is a subjective score assigned by human viewers, typically on a scale from 1 to 5.

```text
MOS = average(user_scores)
```

MOS cannot be measured automatically by the player alone. It can be collected through a rating form shown after the viewing session.

---

## 3. Protocol-Comparison-Specific Metrics

### 3.1. Comparing TCP, QUIC, UDP, and HOL Blocking

Under packet loss:

- TCP may suffer from head-of-line blocking at the transport layer: data arriving later must wait until the lost data has been retransmitted.
- QUIC eliminates HOL blocking between streams at the transport layer, but each individual stream still preserves its own data ordering.
- UDP-based protocols such as WebRTC/SRT usually have their own mechanisms to balance packet loss, retransmission, FEC, jitter buffering, and latency.

When comparing, the following should be measured together:

```text
packet_loss
jitter
startup_delay
rebuffering_ratio
average_bitrate
quality_down_switch_count
recovery_time
end_to_end_latency
```

---

### 3.2. Recovery Time from Packet Loss / Network Impairment

This metric measures the time the system takes to recover after network conditions degrade.

Example:

```text
recovery_time = time_quality_back_to_baseline - time_network_impairment_started
```

The "recovered" condition should be clearly defined, for example:

- Bitrate returns to at least 90% of the baseline.
- Buffer level returns above a safety threshold, e.g., 10 seconds.
- No rebuffering occurs over a given interval, e.g., 15 seconds.
- For low-latency streaming, live latency returns close to the target.

---

## 4. Metric Mapping and Measurability with dash.js

| Metric | Directly measurable by dash.js/browser? | Measurement method |
|---|---:|---|
| Throughput | Yes | `player.getAverageThroughput()` or computed from fragments |
| Encoded payload rate | Yes | `encodedBodySize` or `bytesLoaded` divided by download time |
| Transport goodput/overhead | No | Requires qlog/pcap or transport/server telemetry |
| True RTT | No | Only approximate HTTP latency/TTFB can be measured |
| Jitter | Approximate | Variation in HTTP latency or fragment download time |
| Packet Loss | No | Use network tools; dash.js only provides a failure/abandon proxy |
| Connection Setup Time | Yes, if Resource Timing data is sufficient | `PerformanceResourceTiming` |
| Startup Delay | Yes | `play` → first `requestVideoFrameCallback()` callback; `playing` is only an approximate fallback |
| Rebuffering Ratio | Yes | Total `waiting/stalled` time after playback has started |
| Rebuffering Frequency | Yes | Count of stall events |
| Quality Switches | Yes | `QUALITY_CHANGE_RENDERED` |
| Average Bitrate | Yes | Integral of bitrate over playback time |
| True End-to-End Latency | Not fully | `getCurrentLiveLatency()` is only live-edge latency |
| Frame Drops | Yes | `getVideoPlaybackQuality()` or the dash.js dropped-frame metric |
| Frozen Frames | Approximate | `requestVideoFrameCallback()` |
| AV Sync | No | Requires a dedicated test stream/instrumentation |
| VMAF/PSNR/SSIM | Not in dash.js | Measured offline with FFmpeg |
| MOS | Not automatically | Collect user ratings |

---

### 4.1. Application Dataset Conventions

- `TimestampUTC` always uses ISO 8601 UTC, e.g., `2026-08-24T04:20:31.125Z`.
- `RepresentationId` is taken from `FragmentRequest.representationId`. The ID is not replaced with the quality index; the quality index is stored separately in `QualityIndex`.
- `StartupDelay` is measured separately for each replay, from the playback request to the first rendered video frame. `StartupDelayMethod` records `first-rendered-frame`; if the browser does not support the frame callback, the specific fallback type is recorded explicitly.
- Bitrate, resolution, and quality switches refer to the rendered video quality. Switches are accumulated over the session, counting only `QUALITY_CHANGE_RENDERED` events whose old and new representations differ; the initial quality selection is not counted as a switch.
- QoS records only requests with `mediaType=video` and `type=MediaSegment`. The MPD, audio, and initialization segments are excluded from both the QoS dataset and the failure/abandon denominator.

---

## 5. TypeScript Code for Measuring QoS/QoE with dash.js

### 5.1. Installation

```bash
npm install dashjs
```

Minimal HTML:

```html
<video id="videoPlayer" controls></video>
<button id="playBtn">Play</button>
<pre id="metrics"></pre>
```

---

### 5.2. File `dash-metrics-monitor.ts`

```ts
import * as dashjs from 'dashjs';

type MediaType = 'video' | 'audio';

type DashPlayer = ReturnType<ReturnType<typeof dashjs.MediaPlayer>['create']>;

interface FragmentMetric {
  mediaType: MediaType;
  url: string;
  bytes: number;
  transferSize: number | null;
  encodedBodySize: number | null;
  requestStartMs: number | null;
  responseStartMs: number | null;
  responseEndMs: number | null;
  downloadTimeMs: number;
  httpLatencyMs: number | null;
  throughputMbps: number;
  encodedPayloadRateMbps: number;
  resourceTimingSizeDeltaBytes: number | null;
  statusCode?: number;
}

interface QualitySwitchMetric {
  atMs: number;
  mediaType: MediaType;
  oldQuality: number | null;
  newQuality: number | null;
  bitrateKbps: number | null;
  width: number | null;
  height: number | null;
  direction: 'up' | 'down' | 'lateral' | 'same' | 'unknown';
}

interface MonitorSnapshot {
  timestampUTC: string;

  // QoS
  avgThroughputVideoMbps: number | null;
  avgThroughputAudioMbps: number | null;
  lastFragmentThroughputMbps: number | null;
  lastFragmentEncodedPayloadRateMbps: number | null;
  avgHttpLatencyMs: number | null;
  httpLatencyVariationMs: number | null;
  fragmentFailureOrAbandonRate: number | null;
  connectionSetupMs: number | null;
  dnsMs: number | null;
  connectMs: number | null;
  secureHandshakeMs: number | null;
  resourceTimingSizeDeltaBytes: number | null;

  // QoE
  startupDelayToFirstRenderedFrameMs: number | null;
  startupDelayMethod: 'not-measured' | 'first-rendered-frame' | 'loadeddata-fallback' | 'playing-fallback' | 'playhead-fallback';
  rebufferingRatio: number;
  rebufferingFrequency: number;
  totalRebufferingMs: number;
  qualitySwitches: number;
  upSwitches: number;
  downSwitches: number;
  averageBitrateKbps: number | null;
  currentBitrateKbps: number | null;
  currentResolution: string | null;
  bufferLevelVideoSec: number | null;
  bufferLevelAudioSec: number | null;
  liveLatencySec: number | null;
  droppedFrames: number | null;
  frozenFrameEvents: number;

  // Comparison and recovery
  recoveryTimeMs: number | null;
}

function nowMs(): number {
  return performance.now();
}

function dateLikeToMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();

  if (typeof value === 'number') {
    // dash.js may use epoch ms or performance-relative ms.
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function avg(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((s, v) => s + v, 0) / clean.length;
}

function avgAbsDiff(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;

  const diffs: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    diffs.push(Math.abs(clean[i] - clean[i - 1]));
  }

  return avg(diffs);
}

function latestResourceTimingByUrl(url: string): PerformanceResourceTiming | null {
  if (!url) return null;

  const entries = performance
    .getEntriesByType('resource')
    .filter((entry): entry is PerformanceResourceTiming => {
      return entry instanceof PerformanceResourceTiming && entry.name === url;
    });

  return entries.length > 0 ? entries[entries.length - 1] : null;
}

function extractBytesFromDashRequest(req: any): number {
  if (!req) return 0;

  const direct =
    safeNumber(req.bytesLoaded) ??
    safeNumber(req._bytesLoaded) ??
    safeNumber(req.bytesTotal) ??
    safeNumber(req._bytesTotal);

  if (direct && direct > 0) return direct;

  // A dash.js HTTPRequest may carry a trace list; each trace may contain b[].
  if (Array.isArray(req.trace)) {
    let total = 0;
    for (const trace of req.trace) {
      if (Array.isArray(trace?.b)) {
        total += trace.b.reduce((s: number, x: unknown) => s + (safeNumber(x) ?? 0), 0);
      } else {
        total += safeNumber(trace?.bytes) ?? 0;
      }
    }
    return total;
  }

  return 0;
}

function isMediaFragmentRequest(req: any): boolean {
  const type = String(req?.type ?? req?._type ?? '').toLowerCase();
  return (
    type.includes('media') ||
    type.includes('fragment') ||
    type.includes('segment') ||
    Boolean(req?.mediaType)
  );
}

function normalizeMediaType(value: unknown): MediaType {
  return String(value).toLowerCase().includes('audio') ? 'audio' : 'video';
}

export class DashMetricsMonitor {
  private player: DashPlayer;
  private video: HTMLVideoElement;
  private manifestUrl: string;

  private playRequestedAtMs: number | null = null;
  private firstLoadedDataAtMs: number | null = null;
  private firstFrameRenderedAtMs: number | null = null;
  private firstPlayingAtMs: number | null = null;

  private rebufferingStartedAtMs: number | null = null;
  private totalRebufferingMs = 0;
  private rebufferingFrequency = 0;

  private playingSinceMs: number | null = null;
  private accumulatedPlayingMs = 0;

  private fragmentMetrics: FragmentMetric[] = [];
  private httpLatencySamplesMs: number[] = [];

  private totalFragmentRequests = 0;
  private failedFragmentRequests = 0;
  private abandonedFragmentRequests = 0;

  private qualitySwitches: QualitySwitchMetric[] = [];

  private lastBitrateUpdateAtMs: number | null = null;
  private bitrateIntegralKbpsMs = 0;
  private currentBitrateKbps: number | null = null;
  private currentWidth: number | null = null;
  private currentHeight: number | null = null;

  private lastVideoFrameWallTimeMs: number | null = null;
  private lastVideoMediaTimeSec: number | null = null;
  private frozenFrameEvents = 0;
  private freezeThresholdMs = 700;

  private impairmentStartedAtMs: number | null = null;
  private baselineBitrateKbps: number | null = null;
  private recoveryTimeMs: number | null = null;

  private pollingTimer: number | null = null;

  constructor(player: DashPlayer, video: HTMLVideoElement, manifestUrl: string) {
    this.player = player;
    this.video = video;
    this.manifestUrl = manifestUrl;
  }

  /**
   * Call this as soon as the user clicks Play.
   * Do not rely solely on the play event, since autoplay/browser policy may skew the reference timestamp.
   */
  public markPlayRequested(): void {
    this.playRequestedAtMs = nowMs();
  }

  /**
   * Marks the moment network impairment begins.
   * Example: right before enabling tc/netem packet loss/delay.
   */
  public markNetworkImpairmentStarted(): void {
    this.impairmentStartedAtMs = nowMs();
    this.recoveryTimeMs = null;
    this.baselineBitrateKbps = this.currentBitrateKbps ?? this.getCurrentRepresentationInfo().bitrateKbps;
  }

  public start(): void {
    this.bindVideoEvents();
    this.bindDashEvents();
    this.startFrameFreezeDetector();

    this.pollingTimer = window.setInterval(() => {
      this.updateBitrateIntegral();
      this.checkRecovery();
    }, 1000);
  }

  public stop(): void {
    if (this.pollingTimer !== null) {
      window.clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.flushPlayingTime();
    this.closeRebufferingIfNeeded();
    this.updateBitrateIntegral();
  }

  public getSnapshot(): MonitorSnapshot {
    this.updateBitrateIntegral();

    const lastFragment = this.fragmentMetrics[this.fragmentMetrics.length - 1] ?? null;
    const recentFragments = this.fragmentMetrics.slice(-20);

    const resourceTimingSizeDeltas = recentFragments
      .map((f) => f.resourceTimingSizeDeltaBytes)
      .filter((v): v is number => v !== null && Number.isFinite(v));

    const fragmentFailureOrAbandonRate =
      this.totalFragmentRequests > 0
        ? (this.failedFragmentRequests + this.abandonedFragmentRequests) / this.totalFragmentRequests
        : null;

    const connection = this.getConnectionSetupMetrics();
    const playingMs = this.getPlayingWallClockMs();
    const stallMs = this.getTotalRebufferingMs();
    const sessionDenominator = playingMs + stallMs;

    const liveLatency = this.safeDashCall(() => this.player.getCurrentLiveLatency());
    const droppedFrames = this.getDroppedFrames();

    return {
      timestampUTC: new Date().toISOString(),

      avgThroughputVideoMbps: this.kbpsToMbps(
        this.safeDashCall(() => this.player.getAverageThroughput('video'))
      ),
      avgThroughputAudioMbps: this.kbpsToMbps(
        this.safeDashCall(() => this.player.getAverageThroughput('audio'))
      ),
      lastFragmentThroughputMbps: lastFragment?.throughputMbps ?? null,
      lastFragmentEncodedPayloadRateMbps: lastFragment?.encodedPayloadRateMbps ?? null,
      avgHttpLatencyMs: avg(this.httpLatencySamplesMs.slice(-20)),
      httpLatencyVariationMs: avgAbsDiff(this.httpLatencySamplesMs.slice(-20)),
      fragmentFailureOrAbandonRate,
      connectionSetupMs: connection.connectionSetupMs,
      dnsMs: connection.dnsMs,
      connectMs: connection.connectMs,
      secureHandshakeMs: connection.secureHandshakeMs,
      resourceTimingSizeDeltaBytes:
        resourceTimingSizeDeltas.length > 0 ? avg(resourceTimingSizeDeltas) : null,

      startupDelayToFirstRenderedFrameMs:
        this.playRequestedAtMs !== null && this.firstFrameRenderedAtMs !== null
          ? this.firstFrameRenderedAtMs - this.playRequestedAtMs
          : this.playRequestedAtMs !== null && this.firstLoadedDataAtMs !== null
            ? this.firstLoadedDataAtMs - this.playRequestedAtMs
            : null,
      startupDelayMethod:
        this.firstFrameRenderedAtMs !== null
          ? 'first-rendered-frame'
          : this.firstLoadedDataAtMs !== null
            ? 'loadeddata-fallback'
            : 'not-measured',
      rebufferingRatio: sessionDenominator > 0 ? stallMs / sessionDenominator : 0,
      rebufferingFrequency: this.rebufferingFrequency,
      totalRebufferingMs: stallMs,
      qualitySwitches: this.qualitySwitches.length,
      upSwitches: this.qualitySwitches.filter((q) => q.direction === 'up').length,
      downSwitches: this.qualitySwitches.filter((q) => q.direction === 'down').length,
      averageBitrateKbps: this.getAverageBitrateKbps(),
      currentBitrateKbps: this.currentBitrateKbps,
      currentResolution:
        this.currentWidth && this.currentHeight ? `${this.currentWidth}x${this.currentHeight}` : null,
      bufferLevelVideoSec: this.safeDashCall(() => this.player.getDashMetrics().getCurrentBufferLevel('video')),
      bufferLevelAudioSec: this.safeDashCall(() => this.player.getDashMetrics().getCurrentBufferLevel('audio')),
      liveLatencySec: Number.isFinite(liveLatency) ? liveLatency : null,
      droppedFrames,
      frozenFrameEvents: this.frozenFrameEvents,

      recoveryTimeMs: this.recoveryTimeMs
    };
  }

  private bindVideoEvents(): void {
    this.video.addEventListener('loadeddata', () => {
      if (this.firstLoadedDataAtMs === null) {
        this.firstLoadedDataAtMs = nowMs();
      }
    });

    this.video.addEventListener('playing', () => {
      if (this.firstPlayingAtMs === null) {
        this.firstPlayingAtMs = nowMs();
      }

      this.closeRebufferingIfNeeded();

      if (this.playingSinceMs === null) {
        this.playingSinceMs = nowMs();
      }
    });

    this.video.addEventListener('pause', () => {
      this.flushPlayingTime();
    });

    this.video.addEventListener('ended', () => {
      this.flushPlayingTime();
      this.closeRebufferingIfNeeded();
    });

    this.video.addEventListener('waiting', () => {
      this.openRebufferingIfNeeded();
    });

    this.video.addEventListener('stalled', () => {
      this.openRebufferingIfNeeded();
    });
  }

  private bindDashEvents(): void {
    const events = dashjs.MediaPlayer.events;

    this.player.on(events.FRAGMENT_LOADING_COMPLETED, (e: any) => {
      this.onFragmentLoadingCompleted(e);
    });

    this.player.on(events.FRAGMENT_LOADING_ABANDONED, () => {
      this.abandonedFragmentRequests += 1;
    });

    this.player.on(events.ERROR, (e: any) => {
      const msg = JSON.stringify(e ?? {});
      if (msg.toLowerCase().includes('fragment') || msg.toLowerCase().includes('segment')) {
        this.failedFragmentRequests += 1;
      }
    });

    this.player.on(events.QUALITY_CHANGE_RENDERED, (e: any) => {
      this.onQualityChangeRendered(e);
    });

    this.player.on(events.PLAYBACK_WAITING, () => {
      this.openRebufferingIfNeeded();
    });

    this.player.on(events.PLAYBACK_PLAYING, () => {
      this.closeRebufferingIfNeeded();
    });

    this.player.on(events.PLAYBACK_STALLED, () => {
      this.openRebufferingIfNeeded();
    });
  }

  private onFragmentLoadingCompleted(e: any): void {
    const req = e?.request ?? this.safeDashCall(() => {
      const mediaType = normalizeMediaType(e?.request?.mediaType ?? e?.mediaType);
      return this.player.getDashMetrics().getCurrentHttpRequest(mediaType);
    });

    if (!isMediaFragmentRequest(req)) return;

    this.totalFragmentRequests += 1;

    const mediaType = normalizeMediaType(req?.mediaType ?? e?.mediaType);
    const url = String(req?.url ?? req?.responseUrl ?? e?.url ?? '');

    const tRequest = dateLikeToMs(req?.trequest ?? req?._trequest ?? req?.requestStartDate);
    const tResponse = dateLikeToMs(req?.tresponse ?? req?._tresponse ?? req?.firstByteDate);
    const tFinish = dateLikeToMs(req?.tfinish ?? req?._tfinish ?? req?.requestEndDate);

    let downloadTimeMs =
      tRequest !== null && tFinish !== null
        ? Math.max(0, tFinish - tRequest)
        : safeNumber(e?.duration) ?? 0;

    const resource = latestResourceTimingByUrl(url);

    let requestStartMs: number | null = null;
    let responseStartMs: number | null = null;
    let responseEndMs: number | null = null;

    if (resource) {
      requestStartMs = resource.requestStart;
      responseStartMs = resource.responseStart;
      responseEndMs = resource.responseEnd;

      if (responseEndMs > requestStartMs) {
        downloadTimeMs = responseEndMs - requestStartMs;
      }
    }

    const dashBytes = extractBytesFromDashRequest(req);
    const transferSize =
      resource && resource.transferSize > 0 ? resource.transferSize : null;
    const encodedBodySize =
      resource && resource.encodedBodySize > 0 ? resource.encodedBodySize : null;

    const bytes = dashBytes > 0 ? dashBytes : encodedBodySize ?? 0;
    const encodedPayloadBytes = encodedBodySize ?? bytes;

    const httpLatencyMs =
      resource && resource.responseStart > resource.requestStart
        ? resource.responseStart - resource.requestStart
        : tRequest !== null && tResponse !== null
          ? tResponse - tRequest
          : null;

    if (httpLatencyMs !== null && Number.isFinite(httpLatencyMs)) {
      this.httpLatencySamplesMs.push(httpLatencyMs);
      if (this.httpLatencySamplesMs.length > 200) {
        this.httpLatencySamplesMs.shift();
      }
    }

    const throughputMbps =
      downloadTimeMs > 0 ? (bytes * 8) / downloadTimeMs / 1000 : 0;
    const encodedPayloadRateMbps =
      downloadTimeMs > 0 ? (encodedPayloadBytes * 8) / downloadTimeMs / 1000 : 0;

    // Resource Timing delta, not transport overhead.
    const resourceTimingSizeDeltaBytes =
      transferSize !== null && encodedBodySize !== null
        ? Math.max(0, transferSize - encodedBodySize)
        : null;

    this.fragmentMetrics.push({
      mediaType,
      url,
      bytes,
      transferSize,
      encodedBodySize,
      requestStartMs,
      responseStartMs,
      responseEndMs,
      downloadTimeMs,
      httpLatencyMs,
      throughputMbps,
      encodedPayloadRateMbps,
      resourceTimingSizeDeltaBytes,
      statusCode: safeNumber(req?.responsecode ?? req?.status) ?? undefined
    });

    if (this.fragmentMetrics.length > 500) {
      this.fragmentMetrics.shift();
    }
  }

  private onQualityChangeRendered(e: any): void {
    this.updateBitrateIntegral();

    const mediaType = normalizeMediaType(e?.mediaType);
    const oldQuality = safeNumber(e?.oldQuality);
    const newQuality = safeNumber(e?.newQuality ?? e?.quality);

    const rep = this.getCurrentRepresentationInfo();

    let direction: QualitySwitchMetric['direction'] = 'unknown';
    if (oldQuality !== null && newQuality !== null) {
      if (newQuality > oldQuality) direction = 'up';
      else if (newQuality < oldQuality) direction = 'down';
      else direction = 'same';
    }

    this.currentBitrateKbps = rep.bitrateKbps;
    this.currentWidth = rep.width;
    this.currentHeight = rep.height;

    this.qualitySwitches.push({
      atMs: nowMs(),
      mediaType,
      oldQuality,
      newQuality,
      bitrateKbps: rep.bitrateKbps,
      width: rep.width,
      height: rep.height,
      direction
    });
  }

  private openRebufferingIfNeeded(): void {
    // Do not count waiting before the first playback as rebuffering.
    if (this.firstPlayingAtMs === null) return;
    if (this.video.paused || this.video.ended || this.video.seeking) return;

    if (this.rebufferingStartedAtMs === null) {
      this.rebufferingStartedAtMs = nowMs();
      this.rebufferingFrequency += 1;
      this.flushPlayingTime();
    }
  }

  private closeRebufferingIfNeeded(): void {
    if (this.rebufferingStartedAtMs !== null) {
      this.totalRebufferingMs += nowMs() - this.rebufferingStartedAtMs;
      this.rebufferingStartedAtMs = null;
    }
  }

  private getTotalRebufferingMs(): number {
    return (
      this.totalRebufferingMs +
      (this.rebufferingStartedAtMs !== null ? nowMs() - this.rebufferingStartedAtMs : 0)
    );
  }

  private flushPlayingTime(): void {
    if (this.playingSinceMs !== null) {
      this.accumulatedPlayingMs += nowMs() - this.playingSinceMs;
      this.playingSinceMs = null;
    }
  }

  private getPlayingWallClockMs(): number {
    return (
      this.accumulatedPlayingMs +
      (this.playingSinceMs !== null ? nowMs() - this.playingSinceMs : 0)
    );
  }

  private updateBitrateIntegral(): void {
    const t = nowMs();
    const rep = this.getCurrentRepresentationInfo();

    if (rep.bitrateKbps !== null) {
      this.currentBitrateKbps = rep.bitrateKbps;
      this.currentWidth = rep.width;
      this.currentHeight = rep.height;
    }

    if (this.lastBitrateUpdateAtMs === null) {
      this.lastBitrateUpdateAtMs = t;
      return;
    }

    const elapsedMs = t - this.lastBitrateUpdateAtMs;
    this.lastBitrateUpdateAtMs = t;

    // Accumulate time only while the video is actually playing.
    if (!this.video.paused && !this.video.ended && this.rebufferingStartedAtMs === null) {
      if (this.currentBitrateKbps !== null) {
        this.bitrateIntegralKbpsMs += this.currentBitrateKbps * elapsedMs;
      }
    }
  }

  private getAverageBitrateKbps(): number | null {
    const playingMs = this.getPlayingWallClockMs();
    if (playingMs <= 0) return null;
    return this.bitrateIntegralKbpsMs / playingMs;
  }

  private getCurrentRepresentationInfo(): {
    bitrateKbps: number | null;
    width: number | null;
    height: number | null;
  } {
    const rep = this.safeDashCall(() => this.player.getCurrentRepresentationForType('video')) as any;
    if (!rep) {
      return { bitrateKbps: null, width: null, height: null };
    }

    const bandwidth = safeNumber(rep.bandwidth ?? rep.bitrate ?? rep.bitrateInKbit);
    const bitrateKbps =
      bandwidth === null ? null : bandwidth > 10000 ? bandwidth / 1000 : bandwidth;

    return {
      bitrateKbps,
      width: safeNumber(rep.width),
      height: safeNumber(rep.height)
    };
  }

  private getConnectionSetupMetrics(): {
    connectionSetupMs: number | null;
    dnsMs: number | null;
    connectMs: number | null;
    secureHandshakeMs: number | null;
  } {
    const resource = latestResourceTimingByUrl(this.manifestUrl);

    if (!resource) {
      return {
        connectionSetupMs: null,
        dnsMs: null,
        connectMs: null,
        secureHandshakeMs: null
      };
    }

    const dnsMs =
      resource.domainLookupEnd > resource.domainLookupStart
        ? resource.domainLookupEnd - resource.domainLookupStart
        : null;

    const connectMs =
      resource.connectEnd > resource.connectStart
        ? resource.connectEnd - resource.connectStart
        : null;

    const secureHandshakeMs =
      resource.secureConnectionStart > 0 && resource.connectEnd > resource.secureConnectionStart
        ? resource.connectEnd - resource.secureConnectionStart
        : null;

    const setupStart =
      resource.domainLookupStart > 0 ? resource.domainLookupStart : resource.connectStart;
    const connectionSetupMs =
      resource.connectEnd > setupStart
        ? resource.connectEnd - setupStart
        : null;

    return {
      connectionSetupMs,
      dnsMs,
      connectMs,
      secureHandshakeMs
    };
  }

  private startFrameFreezeDetector(): void {
    const callback: VideoFrameRequestCallback = (_now, metadata) => {
      const wall = nowMs();
      const mediaTime = metadata.mediaTime;

      if (
        this.lastVideoFrameWallTimeMs !== null &&
        this.lastVideoMediaTimeSec !== null &&
        !this.video.paused &&
        !this.video.ended &&
        this.rebufferingStartedAtMs === null
      ) {
        const wallDeltaMs = wall - this.lastVideoFrameWallTimeMs;
        const mediaDeltaMs = (mediaTime - this.lastVideoMediaTimeSec) * 1000;

        if (wallDeltaMs > this.freezeThresholdMs && mediaDeltaMs < 50) {
          this.frozenFrameEvents += 1;
        }
      }

      if (this.firstFrameRenderedAtMs === null) {
        this.firstFrameRenderedAtMs = wall;
      }

      this.lastVideoFrameWallTimeMs = wall;
      this.lastVideoMediaTimeSec = mediaTime;

      this.video.requestVideoFrameCallback(callback);
    };

    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback(callback);
    }
  }

  private getDroppedFrames(): number | null {
    if ('getVideoPlaybackQuality' in this.video) {
      return this.video.getVideoPlaybackQuality().droppedVideoFrames;
    }

    const dashDropped = this.safeDashCall(() => this.player.getDashMetrics().getCurrentDroppedFrames()) as any;
    return safeNumber(dashDropped?.droppedFrames ?? dashDropped?.value ?? dashDropped);
  }

  private checkRecovery(): void {
    if (
      this.impairmentStartedAtMs === null ||
      this.recoveryTimeMs !== null ||
      this.baselineBitrateKbps === null
    ) {
      return;
    }

    const bufferLevel = this.safeDashCall(() =>
      this.player.getDashMetrics().getCurrentBufferLevel('video')
    );

    const bitrateRecovered =
      this.currentBitrateKbps !== null &&
      this.currentBitrateKbps >= this.baselineBitrateKbps * 0.9;

    const bufferRecovered = Number.isFinite(bufferLevel) && bufferLevel >= 10;

    if (bitrateRecovered && bufferRecovered) {
      this.recoveryTimeMs = nowMs() - this.impairmentStartedAtMs;
    }
  }

  private kbpsToMbps(value: number | null): number | null {
    return value !== null && Number.isFinite(value) ? value / 1000 : null;
  }

  private safeDashCall<T>(fn: () => T): T | null {
    try {
      const value = fn();
      return value ?? null;
    } catch {
      return null;
    }
  }
}
```

---

### 5.3. Usage in a TypeScript Application

```ts
import * as dashjs from 'dashjs';
import { DashMetricsMonitor } from './dash-metrics-monitor';

const manifestUrl = 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd';

const video = document.querySelector('#videoPlayer') as HTMLVideoElement;
const playBtn = document.querySelector('#playBtn') as HTMLButtonElement;
const metricsBox = document.querySelector('#metrics') as HTMLPreElement;

const player = dashjs.MediaPlayer().create();
player.initialize(video, manifestUrl, false);

// Enable low latency if the MPD stream supports CMAF low latency.
player.updateSettings({
  streaming: {
    delay: {
      liveDelay: 4
    },
    liveCatchup: {
      maxDrift: 0,
      playbackRate: {
        min: -0.5,
        max: 1
      }
    }
  }
});

const monitor = new DashMetricsMonitor(player, video, manifestUrl);
monitor.start();

playBtn.addEventListener('click', async () => {
  monitor.markPlayRequested();
  await video.play();
});

window.setInterval(() => {
  const snapshot = monitor.getSnapshot();

  metricsBox.textContent = JSON.stringify(
    {
      QoS: {
        avgThroughputVideoMbps: snapshot.avgThroughputVideoMbps,
        lastFragmentThroughputMbps: snapshot.lastFragmentThroughputMbps,
        encodedPayloadRateMbps: snapshot.lastFragmentEncodedPayloadRateMbps,
        avgHttpLatencyMs: snapshot.avgHttpLatencyMs,
        httpLatencyVariationMs: snapshot.httpLatencyVariationMs,
        fragmentFailureOrAbandonRate: snapshot.fragmentFailureOrAbandonRate,
        resourceTimingSizeDeltaBytes: snapshot.resourceTimingSizeDeltaBytes,
        connectionSetupMs: snapshot.connectionSetupMs
      },
      QoE: {
        startupDelayToFirstRenderedFrameMs: snapshot.startupDelayToFirstRenderedFrameMs,
        startupDelayMethod: snapshot.startupDelayMethod,
        rebufferingRatio: snapshot.rebufferingRatio,
        rebufferingFrequency: snapshot.rebufferingFrequency,
        totalRebufferingMs: snapshot.totalRebufferingMs,
        qualitySwitches: snapshot.qualitySwitches,
        downSwitches: snapshot.downSwitches,
        averageBitrateKbps: snapshot.averageBitrateKbps,
        currentBitrateKbps: snapshot.currentBitrateKbps,
        currentResolution: snapshot.currentResolution,
        bufferLevelVideoSec: snapshot.bufferLevelVideoSec,
        liveLatencySec: snapshot.liveLatencySec,
        droppedFrames: snapshot.droppedFrames,
        frozenFrameEvents: snapshot.frozenFrameEvents
      },
      Recovery: {
        recoveryTimeMs: snapshot.recoveryTimeMs
      }
    },
    null,
    2
  );
}, 1000);

// Example: before enabling netem packet loss/delay on the test machine,
// call this function to start measuring recovery time.
(document.querySelector('#impairmentBtn') as HTMLButtonElement | null)?.addEventListener('click', () => {
  monitor.markNetworkImpairmentStarted();
});
```

---

## 6. Simple Frontend Code for MOS Collection

```ts
interface MosVote {
  userId?: string;
  sessionId: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
}

class MosCollector {
  private votes: MosVote[] = [];

  addVote(vote: Omit<MosVote, 'createdAt'>): void {
    this.votes.push({
      ...vote,
      createdAt: new Date().toISOString()
    });
  }

  getMos(): number | null {
    if (this.votes.length === 0) return null;
    return this.votes.reduce((s, v) => s + v.score, 0) / this.votes.length;
  }

  getVotes(): MosVote[] {
    return this.votes;
  }
}
```

---

## 7. Node.js TypeScript for Measuring VMAF/PSNR/SSIM with FFmpeg

> This section runs in Node.js, not in the browser. It requires FFmpeg built with `libvmaf` support.

```ts
import { spawn } from 'node:child_process';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit'
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function computeVmaf(reference: string, distorted: string, outputJson = 'vmaf.json') {
  await run('ffmpeg', [
    '-i',
    distorted,
    '-i',
    reference,
    '-lavfi',
    `libvmaf=log_fmt=json:log_path=${outputJson}`,
    '-f',
    'null',
    '-'
  ]);
}

export async function computePsnr(reference: string, distorted: string, outputLog = 'psnr.log') {
  await run('ffmpeg', [
    '-i',
    distorted,
    '-i',
    reference,
    '-lavfi',
    `psnr=stats_file=${outputLog}`,
    '-f',
    'null',
    '-'
  ]);
}

export async function computeSsim(reference: string, distorted: string, outputLog = 'ssim.log') {
  await run('ffmpeg', [
    '-i',
    distorted,
    '-i',
    reference,
    '-lavfi',
    `ssim=stats_file=${outputLog}`,
    '-f',
    'null',
    '-'
  ]);
}
```

---

## 8. Experiment Design Recommendations for Protocol Comparison

When comparing HLS, LL-HLS, DASH/LL-DASH, WebRTC, SRT, or RTMP, the following should be standardized:

### 8.1. Network Conditions

Example using Linux `tc/netem`:

```bash
# Delay 100ms, jitter 20ms, packet loss 2%
sudo tc qdisc add dev eth0 root netem delay 100ms 20ms loss 2%

# Change network conditions
sudo tc qdisc change dev eth0 root netem delay 200ms 50ms loss 5%

# Remove the configuration
sudo tc qdisc del dev eth0 root
```

### 8.2. Measurement Scenarios

Each protocol should be run multiple times with the same content:

```text
Protocol: DASH, LL-DASH, HLS, LL-HLS, WebRTC, SRT
Network profile: stable, high RTT, high jitter, packet loss, bandwidth drop
Run duration: 3-10 minutes
Repetitions: at least 5-10 runs per profile
Metrics: QoS + QoE
```

### 8.3. Required Logs

Sample-level logs should be recorded:

```json
{
  "timestampUTC": "2026-08-24T04:20:31.125Z",
  "protocol": "DASH",
  "networkProfile": "loss_2_percent",
  "throughputMbps": 5.2,
  "httpLatencyMs": 83,
  "httpLatencyVariationMs": 12,
  "startupDelayToFirstRenderedFrameMs": 940,
  "startupDelayMethod": "first-rendered-frame",
  "rebufferingRatio": 0.01,
  "qualitySwitches": 3,
  "averageBitrateKbps": 2800,
  "liveLatencySec": 4.2,
  "droppedFrames": 15
}
```

---

## 9. Important Considerations When Interpreting Results

A protocol should not be concluded to be "better" on the basis of a single metric. For example:

- High throughput combined with frequent rebuffering still results in poor QoE.
- Low latency combined with a high frame drop rate may be unsuitable for content that requires stable quality.
- WebRTC achieves low latency but may sacrifice visual quality under poor network conditions.
- DASH/HLS have higher latency but are generally more stable for VOD and large-scale live streaming.
- LL-DASH/LL-HLS depend heavily on CMAF chunks, the CDN, the encoder, segment duration, live delay, and ABR configuration.

When writing a report, results should be presented as a causal chain:

```text
Network condition → Transport behavior → Player buffer/ABR behavior → QoE outcome
```

Example:

```text
When packet loss increases from 0% to 3%, HTTP latency and jitter increase, causing throughput estimation to fluctuate.
dash.js ABR responds by lowering the bitrate, leading to an increase in quality down-switches.
If the buffer is insufficient, the player incurs rebuffering, degrading QoE even though the average bitrate may remain moderate.
```

---

## 10. Metric Checklist for Streaming Comparison Studies

### VOD / High-Latency Live

- Startup Delay
- Rebuffering Ratio
- Rebuffering Frequency
- Average Bitrate
- Quality Switch Count
- Down-switch Count
- Buffer Level
- Throughput
- Goodput
- HTTP Latency/Jitter
- Frame Drops

### Low-latency live

- Live Latency
- Glass-to-Glass Latency, if measurable
- Rebuffering Ratio
- Frame Drops/Frozen Frames
- Catch-up playback rate
- Quality Switches
- Recovery Time
- Jitter
- Packet loss from network tools
- AV Sync, if suitable equipment/test streams are available

### Real-time / WebRTC / SRT

- End-to-End Latency
- Packet Loss
- Jitter
- RTT
- Frame Drops
- Frozen Frames
- AV Sync
- Bitrate adaptation
- NACK/FEC/retransmission stats
- MOS or subjective score
