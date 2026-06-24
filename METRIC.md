# Metric đo chất lượng mạng và trải nghiệm video streaming

Tài liệu này tổng hợp các metric quan trọng khi đánh giá chất lượng truyền video, đặc biệt khi so sánh các giao thức hoặc cơ chế streaming như MPEG-DASH/dash.js, HLS/LL-HLS, WebRTC, SRT, RTMP hoặc các biến thể dùng TCP, QUIC, UDP.

Phần cuối tài liệu có code TypeScript mẫu cho `dash.js` để đo các metric có thể đo ở phía trình duyệt. Một số metric như packet loss thật, RTT thật ở tầng IP/TCP, VMAF/PSNR/SSIM, MOS hoặc Glass-to-Glass Latency thật không thể đo chính xác chỉ bằng `dash.js`; tài liệu sẽ ghi rõ cách đo đúng hoặc cách ước lượng.

---

## 1. Nhóm metric đo chất lượng mạng

### 1.1. Throughput / Bandwidth thực tế

**Throughput** là tốc độ dữ liệu tải xuống thực tế trong một khoảng thời gian.

Công thức:

```text
Throughput = total_bytes_received * 8 / download_time
```

Đơn vị thường dùng:

```text
bps, Kbps, Mbps
```

Trong streaming, throughput càng ổn định thì ABR càng dễ chọn chất lượng cao mà không gây rebuffering.

Với dash.js, có thể đo bằng:

```ts
player.getAverageThroughput('video')
```

hoặc tự tính từ thời gian tải segment:

```text
segment_throughput_mbps = segment_bytes * 8 / segment_download_time_ms / 1000
```

---

### 1.2. RTT / Latency tầng mạng

**RTT** là thời gian một gói tin đi từ client đến server rồi quay lại client.

```text
RTT = time_response_arrives - time_request_sent
```

Trong trình duyệt, JavaScript không đo được RTT IP/TCP thật. Với DASH qua HTTP, ta thường chỉ đo được **HTTP request latency / TTFB xấp xỉ**:

```text
HTTP_request_latency ≈ responseStart - requestStart
```

Metric này vẫn hữu ích để so sánh độ phản hồi ban đầu giữa CDN/server/cấu hình mạng, nhưng không nên gọi là RTT thật nếu không đo bằng `ping`, `tcpdump`, `tcptrace`, QUIC logs hoặc server-side telemetry.

---

### 1.3. Jitter

**Jitter** là độ dao động của độ trễ.

Với streaming real-time, jitter cao có thể gây vỡ tiếng, giật hình hoặc tăng yêu cầu buffer.

Cách tính đơn giản từ các mẫu latency liên tiếp:

```text
jitter = average(abs(latency[i] - latency[i - 1]))
```

Trong dash.js, jitter thường được ước lượng từ chuỗi HTTP request latency/TTFB hoặc thời gian tải fragment. Đây không phải RTP jitter chuẩn, nhưng dùng được để phân tích sự biến động mạng ở tầng ứng dụng.

---

### 1.4. Packet Loss Rate

**Packet Loss Rate** là tỷ lệ gói tin bị mất.

```text
packet_loss_rate = lost_packets / total_packets
```

Trong trình duyệt và dash.js, không thể đo packet loss thật ở tầng IP/TCP/QUIC vì browser không expose số packet bị mất hoặc số lần retransmission.

Cách đo đúng:

- Dùng `tc -s qdisc`, `netem`, `tcpdump`, `Wireshark`, `ss`, QUIC logs hoặc server-side transport logs.
- Với WebRTC có thể dùng `RTCPeerConnection.getStats()` để lấy `packetsLost`.

Với dash.js, chỉ nên dùng proxy metric:

```text
loss_proxy_rate = (failed_fragment_requests + abandoned_fragment_requests) / total_fragment_requests
```

---

### 1.5. Connection Setup Time

**Connection Setup Time** là thời gian thiết lập kết nối, gồm DNS, TCP handshake, TLS handshake và thời gian mở request đầu tiên.

Với Resource Timing API:

```text
dns_time = domainLookupEnd - domainLookupStart
tcp_time = connectEnd - connectStart
tls_time = connectEnd - secureConnectionStart
connection_setup_time = connectEnd - startTime
```

Lưu ý: nếu CDN không bật `Timing-Allow-Origin`, nhiều field của Resource Timing có thể bằng `0` hoặc không đủ dữ liệu.

---

### 1.6. Goodput

**Goodput** là lượng dữ liệu hữu ích thực sự được truyền thành công mỗi giây, bỏ qua overhead như HTTP header, TLS record, IP/TCP/UDP header.

```text
goodput = useful_payload_bytes * 8 / download_time
```

Trong browser, có thể lấy gần đúng:

```text
useful_payload_bytes ≈ encodedBodySize
total_transferred_bytes ≈ transferSize
```

Nếu không có Resource Timing đầy đủ, có thể dùng `bytesLoaded` của dash.js như xấp xỉ payload segment.

---

### 1.7. Overhead Ratio

**Overhead Ratio** cho biết tỷ lệ dữ liệu phụ trợ so với tổng dữ liệu truyền.

```text
overhead_ratio = (transferSize - encodedBodySize) / transferSize
```

Nếu `transferSize` và `encodedBodySize` không có do giới hạn CORS/Timing-Allow-Origin, không nên kết luận overhead từ browser.

---

## 2. Nhóm metric đo trải nghiệm người dùng

### 2.1. Startup Delay / Video Startup Time

**Startup Delay** là thời gian từ lúc người dùng nhấn Play đến khi frame đầu tiên xuất hiện.

```text
startup_delay = first_frame_time - play_request_time
```

Đây là một trong các QoE metric quan trọng nhất với VOD và live streaming.

Trong browser, có thể đo bằng:

- `loadeddata`: frame đầu tiên đã load.
- `playing`: video bắt đầu phát.
- `requestVideoFrameCallback`: đo sát thời điểm frame đầu tiên được render.

---

### 2.2. Rebuffering Ratio

**Rebuffering Ratio** là tỷ lệ thời gian video bị dừng để nạp buffer.

```text
rebuffering_ratio = total_rebuffering_time / total_session_time
```

Một công thức thường dùng:

```text
rebuffering_ratio = total_stall_time / (total_playing_time + total_stall_time)
```

---

### 2.3. Rebuffering Frequency

**Rebuffering Frequency** là số lần video bị dừng để nạp buffer trong một phiên xem.

```text
rebuffering_frequency = number_of_rebuffering_events
```

Trong browser, có thể đếm qua các event:

- `waiting`
- `stalled`
- dash.js `PLAYBACK_WAITING`
- dash.js `PLAYBACK_STALLED`

Nên loại trừ trạng thái chờ trước frame đầu tiên vì đó thuộc Startup Delay, không phải rebuffering.

---

### 2.4. Quality Switches / Bitrate Adaptations

**Quality Switches** là số lần ABR đổi chất lượng video.

```text
quality_switch_count = number_of_quality_change_rendered_events
```

Có thể tách thành:

```text
up_switches
down_switches
```

Down-switch đột ngột thường ảnh hưởng QoE mạnh hơn up-switch.

---

### 2.5. Average Bitrate / Average Resolution

**Average Bitrate** là bitrate trung bình mà người dùng thật sự xem trong phiên.

Công thức trung bình theo thời gian:

```text
average_bitrate = sum(bitrate_i * duration_i) / sum(duration_i)
```

Tương tự với độ phân giải:

```text
average_resolution_height = sum(height_i * duration_i) / sum(duration_i)
```

---

### 2.6. End-to-End Latency / Glass-to-Glass Latency

**Glass-to-Glass Latency** là độ trễ từ lúc hình ảnh được camera ghi nhận đến lúc hiển thị trên màn hình người xem.

```text
glass_to_glass_latency = display_time_at_receiver - capture_time_at_camera
```

Với live DASH/dash.js, có thể lấy latency so với live edge:

```ts
player.getCurrentLiveLatency()
```

Nhưng đây là **live latency của player**, không phải Glass-to-Glass latency thật. Để đo Glass-to-Glass chuẩn, cần:

- Quay đồng hồ bấm giờ ở nguồn phát rồi so sánh với màn hình nhận.
- Hoặc chèn timestamp ở encoder và đọc timestamp ở decoder.
- Hoặc dùng PRFT/producer reference time nếu pipeline có hỗ trợ.

---

### 2.7. Frame Drops / Frozen Frames

**Frame Drops** là số frame bị bỏ qua.

Trong browser:

```ts
video.getVideoPlaybackQuality().droppedVideoFrames
```

**Frozen Frames** là các khoảng video đứng hình dù phiên phát chưa kết thúc. Có thể ước lượng bằng `requestVideoFrameCallback`: nếu thời gian thực trôi qua nhưng `mediaTime` không tăng trong một ngưỡng, coi là frozen frame interval.

---

### 2.8. Audio/Video Sync

**AV Sync** là độ lệch giữa âm thanh và hình ảnh.

```text
av_sync_error = audio_presentation_time - video_presentation_time
```

Browser/dash.js thông thường không expose PTS audio và PTS video riêng biệt cho JavaScript. Muốn đo chuẩn cần instrumentation ở decoder/player native, WebCodecs pipeline, test stream chuyên dụng có beep/flash marker, hoặc phân tích bản ghi đầu ra.

---

### 2.9. Objective Video Quality: VMAF, PSNR, SSIM

Các metric này cần so sánh video gốc với video sau nén/truyền tải.

- **VMAF**: metric do Netflix phát triển, sát cảm nhận thị giác hơn PSNR/SSIM trong nhiều trường hợp.
- **PSNR**: đo sai khác tín hiệu theo công thức toán học.
- **SSIM**: đo độ tương đồng cấu trúc hình ảnh.

Không thể tính chuẩn chỉ từ dash.js trong browser vì cần file video gốc và bản video đã nhận/ghi lại.

Ví dụ đo bằng FFmpeg:

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

**MOS - Mean Opinion Score** là điểm chủ quan do người thật chấm, thường từ 1 đến 5.

```text
MOS = average(user_scores)
```

Không thể tự động đo MOS chỉ bằng player. Có thể thu thập bằng form đánh giá sau phiên xem.

---

## 3. Metric đặc thù khi so sánh giao thức

### 3.1. So sánh TCP, QUIC, UDP và HOL Blocking

Khi mất gói:

- TCP có thể bị Head-of-Line blocking ở tầng transport: dữ liệu đến sau phải chờ dữ liệu bị mất được retransmit.
- QUIC loại bỏ HOL blocking giữa các stream ở tầng transport, nhưng stream đơn vẫn có thứ tự dữ liệu riêng.
- UDP-based protocols như WebRTC/SRT thường có cơ chế riêng để cân bằng giữa mất gói, retransmission, FEC, jitter buffer và latency.

Khi so sánh, nên đo đồng thời:

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

Metric này đo thời gian hệ thống phục hồi sau khi mạng xấu.

Ví dụ:

```text
recovery_time = time_quality_back_to_baseline - time_network_impairment_started
```

Điều kiện "phục hồi" nên định nghĩa rõ:

- Bitrate quay lại ít nhất 90% baseline.
- Buffer level quay lại trên ngưỡng an toàn, ví dụ 10 giây.
- Không còn rebuffering trong một khoảng, ví dụ 15 giây.
- Live latency quay lại gần target với low-latency streaming.

---

## 4. Bảng mapping metric với khả năng đo bằng dash.js

| Metric | dash.js/browser đo trực tiếp? | Cách đo |
|---|---:|---|
| Throughput | Có | `player.getAverageThroughput()` hoặc tự tính từ fragment |
| Goodput | Có, gần đúng | `encodedBodySize` hoặc `bytesLoaded` |
| RTT thật | Không | Chỉ đo HTTP latency/TTFB xấp xỉ |
| Jitter | Gần đúng | Dao động của HTTP latency hoặc fragment download time |
| Packet Loss | Không | Dùng network tool; dash.js chỉ có failure/abandon proxy |
| Connection Setup Time | Có, nếu Resource Timing đủ dữ liệu | `PerformanceResourceTiming` |
| Startup Delay | Có | `play` → first frame/`playing` |
| Rebuffering Ratio | Có | Tổng thời gian `waiting/stalled` sau khi đã bắt đầu phát |
| Rebuffering Frequency | Có | Đếm số lần stall |
| Quality Switches | Có | `QUALITY_CHANGE_RENDERED` |
| Average Bitrate | Có | Tích phân bitrate theo thời gian phát |
| End-to-End Latency thật | Không hoàn toàn | `getCurrentLiveLatency()` chỉ là live-edge latency |
| Frame Drops | Có | `getVideoPlaybackQuality()` hoặc dash.js dropped frame metric |
| Frozen Frames | Gần đúng | `requestVideoFrameCallback()` |
| AV Sync | Không | Cần test stream/instrumentation riêng |
| VMAF/PSNR/SSIM | Không trong dash.js | Đo offline bằng FFmpeg |
| MOS | Không tự động | Thu thập đánh giá người dùng |

---

## 5. Code TypeScript đo QoS/QoE với dash.js

### 5.1. Cài đặt

```bash
npm install dashjs
```

HTML tối thiểu:

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
  goodputMbps: number;
  overheadRatio: number | null;
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
  direction: 'up' | 'down' | 'same' | 'unknown';
}

interface MonitorSnapshot {
  timestampMs: number;

  // QoS
  avgThroughputVideoMbps: number | null;
  avgThroughputAudioMbps: number | null;
  lastFragmentThroughputMbps: number | null;
  lastFragmentGoodputMbps: number | null;
  avgHttpLatencyMs: number | null;
  jitterMs: number | null;
  packetLossProxyRate: number | null;
  connectionSetupMs: number | null;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  overheadRatio: number | null;

  // QoE
  startupDelayMs: number | null;
  firstFrameDelayMs: number | null;
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

  // Comparison / recovery
  recoveryTimeMs: number | null;
}

function nowMs(): number {
  return performance.now();
}

function dateLikeToMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();

  if (typeof value === 'number') {
    // dash.js có thể dùng epoch ms hoặc performance-relative ms.
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

  // dash.js HTTPRequest có thể có trace list; mỗi trace có thể chứa b[].
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
   * Gọi hàm này ngay khi user bấm Play.
   * Không nên chỉ dựa vào event play vì autoplay/browser policy có thể làm lệch mốc đo.
   */
  public markPlayRequested(): void {
    this.playRequestedAtMs = nowMs();
  }

  /**
   * Đánh dấu thời điểm bắt đầu làm xấu mạng.
   * Ví dụ: trước khi bật tc/netem packet loss/delay.
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

    const overheadValues = recentFragments
      .map((f) => f.overheadRatio)
      .filter((v): v is number => v !== null && Number.isFinite(v));

    const packetLossProxyRate =
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
      timestampMs: Date.now(),

      avgThroughputVideoMbps: this.kbpsToMbps(
        this.safeDashCall(() => this.player.getAverageThroughput('video'))
      ),
      avgThroughputAudioMbps: this.kbpsToMbps(
        this.safeDashCall(() => this.player.getAverageThroughput('audio'))
      ),
      lastFragmentThroughputMbps: lastFragment?.throughputMbps ?? null,
      lastFragmentGoodputMbps: lastFragment?.goodputMbps ?? null,
      avgHttpLatencyMs: avg(this.httpLatencySamplesMs.slice(-20)),
      jitterMs: avgAbsDiff(this.httpLatencySamplesMs.slice(-20)),
      packetLossProxyRate,
      connectionSetupMs: connection.connectionSetupMs,
      dnsMs: connection.dnsMs,
      tcpMs: connection.tcpMs,
      tlsMs: connection.tlsMs,
      overheadRatio: overheadValues.length > 0 ? avg(overheadValues) : null,

      startupDelayMs:
        this.playRequestedAtMs !== null && this.firstPlayingAtMs !== null
          ? this.firstPlayingAtMs - this.playRequestedAtMs
          : null,
      firstFrameDelayMs:
        this.playRequestedAtMs !== null && this.firstFrameRenderedAtMs !== null
          ? this.firstFrameRenderedAtMs - this.playRequestedAtMs
          : this.playRequestedAtMs !== null && this.firstLoadedDataAtMs !== null
            ? this.firstLoadedDataAtMs - this.playRequestedAtMs
            : null,
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

    const bytes = encodedBodySize ?? dashBytes;
    const totalBytesForThroughput = transferSize ?? bytes;

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
      downloadTimeMs > 0 ? (totalBytesForThroughput * 8) / downloadTimeMs / 1000 : 0;
    const goodputMbps =
      downloadTimeMs > 0 ? (bytes * 8) / downloadTimeMs / 1000 : 0;

    const overheadRatio =
      transferSize !== null && encodedBodySize !== null && transferSize > 0
        ? Math.max(0, (transferSize - encodedBodySize) / transferSize)
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
      goodputMbps,
      overheadRatio,
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
    // Không tính waiting trước lần phát đầu tiên là rebuffering.
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

    // Chỉ cộng thời gian khi video đang phát thật.
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
    tcpMs: number | null;
    tlsMs: number | null;
  } {
    const resource = latestResourceTimingByUrl(this.manifestUrl);

    if (!resource) {
      return {
        connectionSetupMs: null,
        dnsMs: null,
        tcpMs: null,
        tlsMs: null
      };
    }

    const dnsMs =
      resource.domainLookupEnd > resource.domainLookupStart
        ? resource.domainLookupEnd - resource.domainLookupStart
        : null;

    const tcpMs =
      resource.connectEnd > resource.connectStart
        ? resource.connectEnd - resource.connectStart
        : null;

    const tlsMs =
      resource.secureConnectionStart > 0 && resource.connectEnd > resource.secureConnectionStart
        ? resource.connectEnd - resource.secureConnectionStart
        : null;

    const connectionSetupMs =
      resource.connectEnd > resource.startTime
        ? resource.connectEnd - resource.startTime
        : null;

    return {
      connectionSetupMs,
      dnsMs,
      tcpMs,
      tlsMs
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
        !this.video.ended
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

### 5.3. Cách dùng trong app TypeScript

```ts
import * as dashjs from 'dashjs';
import { DashMetricsMonitor } from './dash-metrics-monitor';

const manifestUrl = 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd';

const video = document.querySelector('#videoPlayer') as HTMLVideoElement;
const playBtn = document.querySelector('#playBtn') as HTMLButtonElement;
const metricsBox = document.querySelector('#metrics') as HTMLPreElement;

const player = dashjs.MediaPlayer().create();
player.initialize(video, manifestUrl, false);

// Bật low latency nếu stream MPD hỗ trợ CMAF low latency.
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
        goodputMbps: snapshot.lastFragmentGoodputMbps,
        avgHttpLatencyMs: snapshot.avgHttpLatencyMs,
        jitterMs: snapshot.jitterMs,
        packetLossProxyRate: snapshot.packetLossProxyRate,
        overheadRatio: snapshot.overheadRatio,
        connectionSetupMs: snapshot.connectionSetupMs
      },
      QoE: {
        startupDelayMs: snapshot.startupDelayMs,
        firstFrameDelayMs: snapshot.firstFrameDelayMs,
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

// Ví dụ: trước khi bạn bật netem packet loss/delay ở máy test,
// gọi hàm này để bắt đầu đo recovery time.
(document.querySelector('#impairmentBtn') as HTMLButtonElement | null)?.addEventListener('click', () => {
  monitor.markNetworkImpairmentStarted();
});
```

---

## 6. Code đo MOS đơn giản ở frontend

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

## 7. Node.js TypeScript đo VMAF/PSNR/SSIM bằng FFmpeg

> Phần này chạy ở Node.js, không chạy trong browser. Cần cài FFmpeg có hỗ trợ `libvmaf`.

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

## 8. Gợi ý thiết kế thí nghiệm so sánh giao thức

Khi so sánh HLS, LL-HLS, DASH/LL-DASH, WebRTC, SRT hoặc RTMP, nên thống nhất:

### 8.1. Điều kiện mạng

Ví dụ dùng Linux `tc/netem`:

```bash
# Delay 100ms, jitter 20ms, packet loss 2%
sudo tc qdisc add dev eth0 root netem delay 100ms 20ms loss 2%

# Thay đổi điều kiện mạng
sudo tc qdisc change dev eth0 root netem delay 200ms 50ms loss 5%

# Xóa cấu hình
sudo tc qdisc del dev eth0 root
```

### 8.2. Kịch bản đo

Mỗi giao thức nên chạy nhiều lần với cùng một nội dung:

```text
Protocol: DASH, LL-DASH, HLS, LL-HLS, WebRTC, SRT
Network profile: stable, high RTT, high jitter, packet loss, bandwidth drop
Run duration: 3-10 phút
Repetitions: ít nhất 5-10 lần mỗi profile
Metrics: QoS + QoE
```

### 8.3. Log bắt buộc

Nên lưu sample-level log:

```json
{
  "timestampMs": 1710000000000,
  "protocol": "DASH",
  "networkProfile": "loss_2_percent",
  "throughputMbps": 5.2,
  "httpLatencyMs": 83,
  "jitterMs": 12,
  "startupDelayMs": 940,
  "rebufferingRatio": 0.01,
  "qualitySwitches": 3,
  "averageBitrateKbps": 2800,
  "liveLatencySec": 4.2,
  "droppedFrames": 15
}
```

---

## 9. Lưu ý quan trọng khi diễn giải kết quả

Không nên kết luận giao thức "tốt hơn" chỉ dựa trên một metric. Ví dụ:

- Throughput cao nhưng rebuffering nhiều vẫn là QoE kém.
- Latency thấp nhưng frame drop cao có thể không phù hợp cho nội dung cần chất lượng ổn định.
- WebRTC có latency thấp nhưng có thể hy sinh chất lượng hình ảnh khi mạng xấu.
- DASH/HLS có latency cao hơn nhưng thường ổn định hơn cho VOD và live streaming số lượng lớn.
- LL-DASH/LL-HLS phụ thuộc rất mạnh vào CMAF chunk, CDN, encoder, segment duration, live delay và ABR configuration.

Khi viết báo cáo, nên trình bày theo chuỗi nguyên nhân:

```text
Network condition → Transport behavior → Player buffer/ABR behavior → QoE outcome
```

Ví dụ:

```text
Khi packet loss tăng từ 0% lên 3%, HTTP latency và jitter tăng làm throughput estimation dao động.
dash.js ABR phản ứng bằng cách giảm bitrate, dẫn đến số lần quality down-switch tăng.
Nếu buffer không đủ, player phát sinh rebuffering, làm QoE giảm mặc dù average bitrate vẫn có thể ở mức trung bình.
```

---

## 10. Checklist metric nên dùng cho bài so sánh streaming

### VOD / Live latency cao

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
- Glass-to-Glass Latency nếu đo được
- Rebuffering Ratio
- Frame Drops/Frozen Frames
- Catch-up playback rate
- Quality Switches
- Recovery Time
- Jitter
- Packet loss từ network tool
- AV Sync nếu có thiết bị/test stream phù hợp

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
- MOS hoặc subjective score
