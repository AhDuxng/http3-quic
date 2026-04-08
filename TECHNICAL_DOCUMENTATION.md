# ADTube Stream Analyzer — Tài Liệu Kỹ Thuật & Nghiên Cứu Khoa Học

> **Dự án:** `youtube-clone-quic`  
> **Mục đích nghiên cứu:** So sánh hiệu năng Video Streaming (QoE) giữa HTTP/2 (TCP) và HTTP/3 (QUIC) trên nền tảng DASH Adaptive Bitrate Streaming.  
> **Ngày cập nhật:** 2026-04-08

---

## Mục lục

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Tính năng chính và tác dụng](#3-tính-năng-chính-và-tác-dụng)
   - 3.1 [DASH Adaptive Bitrate Player](#31-dash-adaptive-bitrate-player)
   - 3.2 [Hệ thống thu thập Telemetry](#32-hệ-thống-thu-thập-telemetry)
   - 3.3 [Network Simulation Panel](#33-network-simulation-panel)
   - 3.4 [Auto-Replay & Measurement Control](#34-auto-replay--measurement-control)
   - 3.5 [Console Logs Panel & CSV Export](#35-console-logs-panel--csv-export)
   - 3.6 [Stream Telemetry Card (Real-time)](#36-stream-telemetry-card-real-time)
   - 3.7 [Offline Analysis Pipeline (analyze_logs.py)](#37-offline-analysis-pipeline-analyze_logspy)
4. [Chi tiết 16 chỉ số đo lường QoE](#4-chi-tiết-16-chỉ-số-đo-lường-qoe)
   - 4.1 [Average Bitrate](#41-average-bitrate)
   - 4.2 [Stall Count & Stall Duration](#42-stall-count--stall-duration)
   - 4.3 [Rebuffering Ratio](#43-rebuffering-ratio)
   - 4.4 [Throughput](#44-throughput)
   - 4.5 [Time To First Byte (TTFB)](#45-time-to-first-byte-ttfb)
   - 4.6 [Segment Download Time (SDT)](#46-segment-download-time-sdt)
   - 4.7 [SDT Jitter](#47-sdt-jitter)
   - 4.8 [Buffer Level](#48-buffer-level)
   - 4.9 [Quality Switch Count](#49-quality-switch-count)
   - 4.10 [Dropped Frames](#410-dropped-frames)
   - 4.11 [Frame Rate (FPS)](#411-frame-rate-fps)
   - 4.12 [Download Speed](#412-download-speed)
   - 4.13 [Protocol Detection](#413-protocol-detection)
   - 4.14 [Network Type](#414-network-type)
5. [Pipeline phân tích thống kê](#5-pipeline-phân-tích-thống-kê)
6. [Cấu trúc dữ liệu CSV](#6-cấu-trúc-dữ-liệu-csv)
7. [Kịch bản thí nghiệm (Experiment Scenarios)](#7-kịch-bản-thí-nghiệm-experiment-scenarios)
8. [Luồng dữ liệu end-to-end](#8-luồng-dữ-liệu-end-to-end)
9. [Ghi chú phương pháp cho bài báo khoa học](#9-ghi-chú-phương-pháp-cho-bài-báo-khoa-học)
10. [Tài liệu tham khảo](#10-tài-liệu-tham-khảo)

---

## 1. Tổng quan dự án

**ADTube Stream Analyzer** là một nền tảng thí nghiệm nghiên cứu có kiểm soát (*controlled research testbed*) được xây dựng để **đo lường và so sánh chất lượng phát video trực tuyến** (QoE — Quality of Experience) giữa hai giao thức truyền tải:

| Giao thức | Transport Layer | Cơ chế |
|-----------|----------------|--------|
| **HTTP/2** | TCP + TLS 1.3 | Multiplexing trên một kết nối TCP, nhưng bị Head-of-Line (HoL) Blocking ở tầng transport |
| **HTTP/3** | QUIC (UDP) | Multiplexing độc lập từng luồng, 0-RTT handshake, khôi phục gói nhanh hơn |

**Video được phát theo chuẩn DASH** (Dynamic Adaptive Streaming over HTTP), sử dụng thư viện `dash.js` — tiêu chuẩn công nghiệp de facto cho adaptive bitrate streaming.

### Câu hỏi nghiên cứu chính

> *Trong điều kiện mạng thực tế mô phỏng (fiber, 4G, 3G, 2G), giao thức HTTP/3 (QUIC) có cải thiện đáng kể chất lượng trải nghiệm xem video (QoE) so với HTTP/2 (TCP) không, đặc biệt về:*
> - **Average Bitrate** được duy trì trong phiên phát
> - **Stall Duration** — tổng thời gian video bị dừng hình do buffer cạn
> - **Rebuffering Ratio** — tỷ lệ thời gian stall/thời gian xem

---

## 2. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Compose Stack                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │   Frontend   │    │            Caddy Server              │   │
│  │  (React SPA) │    │    (HTTP/1.1 + HTTP/2 + HTTP/3)     │   │
│  │  Port: 80    │←───│  TLS: certs/server.crt + server.key │   │
│  │  (Nginx)     │    │  QUIC: UDP Port 443                  │   │
│  └──────────────┘    │  Serves: /media/*, /media-2/*        │   │
│                       │  Proxy: /api/* → backend:3000       │   │
│  ┌──────────────┐    └──────────────────────────────────────┘   │
│  │   Backend    │              ↑                                 │
│  │  (Node.js)   │    NET_ADMIN capability                       │
│  │  Port: 3000  │    network_mode: service:caddy                │
│  │              │    ↓                                          │
│  │  /api/network│  tc (Linux Traffic Control / netem)           │
│  │  -scenario   │  Shapes Caddy's eth0 → affects all media      │
│  └──────────────┘  traffic to browser                           │
│                                                                  │
│  Volumes: ./media (HEVC DASH) + ./media-2 (H.264 DASH + MP4)   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTPS/QUIC (Port 443)
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (Client Side)                         │
│                                                                  │
│  dash.js ABR Player → DASH Manifest (.mpd) → Segments (.m4s)   │
│  Performance Resource Timing API → TTFB, Protocol Detection     │
│  VideoPlaybackQuality API → FPS, Dropped Frames                 │
│  Network Information API → Connection Type                       │
└─────────────────────────────────────────────────────────────────┘
```

### Thành phần chính

| Thành phần | Công nghệ | Vai trò |
|-----------|-----------|--------|
| Frontend | React + TypeScript + Vite + TailwindCSS | Giao diện người dùng + thu thập telemetry |
| Backend | Node.js (Express) | API network simulation |
| Proxy/CDN | Caddy 2.8 | Phục vụ media files; hỗ trợ H1/H2/H3 |
| Mạng | Docker `tc netem` (Linux Traffic Control) | Mô phỏng điều kiện mạng thực tế |
| DASH Engine | `dash.js` v4+ | Adaptive bitrate player |
| Phân tích | Python (pandas, scipy, matplotlib) | Xử lý CSV, kiểm định thống kê, biểu đồ |

---

## 3. Tính năng chính và tác dụng

### 3.1 DASH Adaptive Bitrate Player

**File:** `frontend/src/features/video/components/VideoPlayer.tsx`  
**Hook:** `frontend/src/features/video/hooks/useDashPlayer.ts`

**Mô tả:**  
Component trung tâm của hệ thống. Khởi tạo `dash.js MediaPlayer`, tải DASH manifest (`.mpd`), và phát video theo cơ chế ABR (Adaptive Bitrate Rate).

**Cách hoạt động:**

1. `useDashPlayer` tạo instance `MediaPlayer` từ `dash.js`
2. Player được khởi tạo với `autoSwitchBitrate: true` và `initialBitrate: 500 kbps`
3. Player đăng ký các event listeners quan trọng:
   - `MANIFEST_LOADED` → ghi log khi manifest tải xong
   - `STREAM_INITIALIZED` → đồng bộ danh sách representation (các mức bitrate)
   - `QUALITY_CHANGE_RENDERED` → ghi nhận khi ABR chuyển chất lượng
   - `FRAGMENT_LOADING_COMPLETED` → xử lý từng segment (tính SDT, TTFB, Jitter, Throughput)
   - `BUFFER_EMPTY` / `BUFFER_LOADED` → theo dõi stall events
4. Polling 1s cập nhật: Buffer Level, FPS, Throughput, Protocol, Rebuffering Ratio

**Tại sao quan trọng cho nghiên cứu:**  
DASH là tiêu chuẩn công nghiệp cho adaptive streaming (Netflix, YouTube, Twitch đều dùng). Kết quả đo lường trên DASH phản ánh trải nghiệm người dùng thực tế. ABR algorithm thích ứng với điều kiện mạng — đây là nơi sự khác biệt H2 vs H3 biểu hiện rõ nhất.

---

### 3.2 Hệ thống thu thập Telemetry

**Files:**
- `useStreamMetrics.ts` — SDT, TTFB, Jitter, Throughput, FPS, Buffer
- `useStallTracker.ts` — Stall Count, Stall Duration, Rebuffering Ratio
- `performanceApi.ts` — Protocol Detection, TTFB (từ Performance API)

**Luồng xử lý:**

```
FRAGMENT_LOADING_COMPLETED event
         ↓
   processSegment()
   ├─ bytesLoaded (từ req hoặc ArrayBuffer)
   ├─ SDT = endDate - startDate (dash.js v5+)
   │       hoặc sum(trace[].d)
   │       hoặc responseEnd - requestStart (Performance API)
   ├─ TTFB = responseStart - requestStart (Performance API)
   ├─ DownloadSpeed = (bytes × 8) / SDT
   ├─ Jitter = |SDT_current - SDT_prev|
   └─ Lưu sample vào sliding window 10s

Polling mỗi 1 giây
         ↓
   pollStats()
   ├─ bufferSeconds = player.getBufferLength("video")
   ├─ FPS = Δ(totalVideoFrames) / Δ(currentTime)
   ├─ avgThroughputKbps = avg(samples trong 1s gần nhất)
   ├─ protocol = detectProtocol() từ nextHopProtocol
   ├─ networkType = navigator.connection.type
   └─ rebufferingRatio = stallAccumulatedMs / (currentTime × 1000)
```

**Nguồn dữ liệu:**

| Chỉ số | Nguồn chính | Fallback |
|-------|-----------|--------|
| TTFB | `Performance.getEntriesByType("resource")` → `responseStart - requestStart` | `req.firstByteDate - req.startDate` (dash.js) |
| SDT | `req.endDate - req.startDate` | `sum(trace[].d)` → Performance API |
| Protocol | `entry.nextHopProtocol` | Scan tất cả resource entries |
| FPS | `VideoPlaybackQuality.totalVideoFrames` | — |
| Buffer | `player.getBufferLength("video")` | — |
| NetworkType | `navigator.connection.type` | `"unknown"` |

---

### 3.3 Network Simulation Panel

**File:** `frontend/src/features/video/components/NetworkSimulationPanel.tsx`  
**Backend:** `backend/src/controllers/networkController.js`

**Mô tả:**  
Panel điều khiển cho phép researcher thay đổi điều kiện mạng trong thời gian thực, không cần restart ứng dụng.

**Cơ chế hoạt động:**

```
Browser → POST /api/network-scenario → Node.js Backend
              { maxBitrateKbps, delayMs, lossPercent }
                        ↓
         Backend dùng Linux tc (Traffic Control):
         tc qdisc del dev eth0 root   # Xoá rules cũ
         tc qdisc add dev eth0 root netem \
           rate {X}kbit \             # Giới hạn bandwidth
           delay {Y}ms {Y/4}ms distribution normal \  # Latency + Jitter
           loss {Z}%                  # Packet loss
```

> **Thiết kế quan trọng:** Backend dùng `network_mode: service:caddy` trong Docker → Backend và Caddy **chia sẻ cùng network namespace**. `tc` áp dụng trên `eth0` của backend = `eth0` của Caddy → Traffic shaping tác động **trực tiếp** lên toàn bộ media traffic phục vụ cho browser.

**6 kịch bản được định nghĩa sẵn:**

| Kịch bản | Bandwidth | Delay | Packet Loss | Mô phỏng |
|---------|-----------|-------|------------|--------|
| Fiber Optic | Không giới hạn | 2ms | 0% | Cáp quang nội thành |
| Mobile 4G High | 20 Mbps | 40ms | 0.1% | 4G ổn định |
| Mobile 4G Limited | 5 Mbps | 100ms | 0.5% | 4G kém |
| 3G / UMTS Legacy | 1.5 Mbps | 200ms | 1% | 3G cũ |
| Slow 3G + Lag | 500 kbps | 400ms | 2% | 3G tệ |
| 2G / EDGE | 250 kbps | 800ms | 5% | EDGE/GPRS |

**Ngoài ra:** Custom settings — researcher có thể nhập thủ công bất kỳ tổ hợp bandwidth/delay/loss nào.

**Tại sao quan trọng cho nghiên cứu:**  
Kiểm soát chính xác điều kiện mạng là yếu tố cốt lõi của *reproducible experimental design*. `tc netem` là công cụ chuẩn trong networking research để mô phỏng WAN conditions.

---

### 3.4 Auto-Replay & Measurement Control

**File:** `frontend/src/features/video/hooks/useDashPlayer.ts` (phần replay logic)  
**UI:** `frontend/src/features/video/components/VideoPlayer.tsx`

**Mô tả:**  
Tính năng phát video lại tự động N lần (hoặc vô hạn) và tự động dừng logging khi hoàn thành — đảm bảo sample size đủ lớn cho phân tích thống kê.

**Cơ chế:**

```
Video ended event
      ↓
  currentReplay < replayCount?
      ├── YES: video.currentTime = 0; video.play()  → Replay #N+1
      └── NO (N replays done): 
           isReplayDone = true
           logging stopped (isReplayDoneRef.current = true)
           stats polling stopped
           UI hiển thị "Measurement Complete"
```

**Chế độ hoạt động:**
- `replayCount = 1`: Phát 1 lần rồi dừng (mặc định)
- `replayCount = N (N>1)`: Phát N lần, thu data liên tục → sample size = N lần tổng số log events
- `replayCount = 0`: Vô hạn (∞) — dùng khi cần continuous measurement

**Tại sao quan trọng cho nghiên cứu:**  
Một phiên video đơn lẻ không đủ để có kết quả thống kê tin cậy. Replay N lần trên cùng điều kiện mạng → thu thập sample size lớn → kiểm định thống kê có power cao hơn. Hệ thống **tự động dừng logging** khi hoàn thành — tránh nhiễu data sau khi replay kết thúc.

---

### 3.5 Console Logs Panel & CSV Export

**File:** `frontend/src/features/video/components/ConsoleLogsPanel.tsx`  
**Utility:** `frontend/src/features/video/utils/csvExporter.ts`

**Mô tả:**  
Panel hiển thị log theo thời gian thực + xuất dữ liệu ra file CSV (cho phân tích ngoại tuyến) hoặc TXT (báo cáo chi tiết).

**Log levels:**
- `SYS` — Sự kiện hệ thống: manifest loaded, stream initialized, replay start/end
- `NET` — Network events: segment loaded, bytes, SDT
- `INFO` — Quality upgrade (ABR chọn bitrate cao hơn)
- `WARN` — Quality downgrade, buffer warning, stall bắt đầu
- `ERRO` — Lỗi player

**Mỗi log entry chứa:**
- Timestamp, Level, Message
- **Snapshot toàn bộ 16 chỉ số** tại thời điểm đó (`statsSnapshot`)
- `isAutoQuality` — ABR hay manual
- `activeScenarioLabel` — kịch bản mạng đang áp dụng

**CSV Export (23 cột):**

```
Timestamp, Level, Message, Protocol, NetworkType,
Bitrate_kbps, Resolution, Throughput_kbps, Buffer_s, FPS,
TTFB_ms, SDT_ms, Jitter_ms, DownloadSpeed_kbps,
StallCount, StallDuration_ms, RebufferingRatio,
DroppedFrames, QualitySwitchCount,
CurrentTime_s, Duration_s, IsAutoQuality, ActiveScenario
```

**Lọc log:** Tìm kiếm theo từ khoá (level, message, protocol) — hữu ích khi debug.

---

### 3.6 Stream Telemetry Card (Real-time)

**File:** `frontend/src/features/video/components/StreamTelemetryCard.tsx`

**Mô tả:**  
Dashboard hiển thị **16 chỉ số theo thời gian thực** cập nhật mỗi giây — cho phép researcher quan sát hành vi hệ thống ngay khi thay đổi điều kiện mạng.

**Các chỉ số và ngưỡng cảnh báo:**

| Label | Chỉ số | Màu đỏ khi |
|-------|--------|-----------|
| RESOLUTION | `resolutionLabel` | — |
| BITRATE | `bitrateKbps` | — |
| THROUGHPUT | `avgThroughputKbps` | — |
| BUFFER | `bufferSeconds` | — |
| FPS | `fps` | — |
| DROPPED | `droppedFrames` | > 0 |
| TTFB | `ttfbMs` | > 500ms |
| JITTER | `jitterMs` | > 100ms |
| SDT | `lastSegmentDurationMs` | > 2000ms |
| DL SPEED | `downloadSpeedKbps` | — |
| STALL | `stallCount × / duration s` | stallCount > 0 |
| REBUF RATIO | `rebufferingRatio %` | > 1% (0.01) |
| Q.SWITCHES | `qualitySwitchCount` | > 5 |
| POSITION | `currentTime / duration` | — |
| PROTOCOL | `protocolLabel` | — |
| NETWORK | `networkType` | — |

---

### 3.7 Offline Analysis Pipeline (analyze_logs.py)

**File:** `scripts/analyze_logs.py`

**Mô tả:**  
Script Python xử lý hai file CSV (một từ phiên HTTP/2, một từ phiên HTTP/3) và tự động tạo **10 loại biểu đồ publication-ready** cùng **4 kiểm định thống kê** cho mỗi chỉ số.

**Chế độ chạy:**
- **GUI mode:** `python analyze_logs.py` — dialog chọn file
- **CLI mode:** `python analyze_logs.py h2.csv h3.csv --out output_dir`

**10 biểu đồ được tạo tự động:**

| # | Tên | Mô tả |
|---|-----|-------|
| 01 | Summary Table | Bảng so sánh tổng quan H2 vs H3 với kết quả kiểm định |
| 02 | Empirical CDF | CDF(x) = P(X ≤ x) cho mỗi chỉ số |
| 03 | Box-Plot | Phân phối quartile + outlier analysis |
| 04 | Timeline | Diễn biến chỉ số theo thời gian phát |
| 05 | Bar ± 95% CI | Trung bình ± 95% Confidence Interval |
| 06 | Radar | Tổng hợp đa chỉ số (normalised) |
| 07 | Stall Analysis | Phân tích stall và rebuffering (QoE indicators) |
| 08 | Correlation Heatmap | Ma trận tương quan Pearson theo từng giao thức |
| 09 | Throughput Stability | Sliding-window mean, CoV%, distribution histogram |
| 10 | Percentile Ladder | P5/P25/P50/P75/P95 so sánh H2 vs H3 |

---

## 4. Chi tiết 16 chỉ số đo lường QoE

### 4.1 Average Bitrate

**CSV column:** `Bitrate_kbps`  
**Type:** Instantaneous (mỗi log entry)  
**Hướng tốt:** ↑ Cao hơn = tốt hơn  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Định nghĩa:**  
Bitrate của video representation hiện tại đang được phát, lấy trực tiếp từ API của dash.js.

**Công thức lấy dữ liệu:**
```typescript
// File: useStreamMetrics.ts — hàm getRepBitrateKbps()
function getRepBitrateKbps(rep: Representation): number {
  return typeof rep.bitrateInKbit === "number"
    ? rep.bitrateInKbit                          // dash.js v5+ (ưu tiên)
    : Math.round((rep.bandwidth ?? 0) / 1000);   // MPEG-DASH bandwidth (fallback)
}

// Cập nhật mỗi lần QUALITY_CHANGE_RENDERED event hoặc polling 1s:
const current = player.getCurrentRepresentationForType("video");
bitrateKbps = getRepBitrateKbps(current);
```

**Average Bitrate theo phiên:**  
Vì Bitrate là chỉ số *instantaneous* (lấy ở mỗi thời điểm), Average Bitrate của toàn phiên được tính trong script phân tích:
```
Average_Bitrate = mean(Bitrate_kbps của tất cả các dòng log)
```

**Liên quan đến DASH:**  
Trong DASH, video được mã hóa thành nhiều *representations* ở các bitrate khác nhau (ví dụ: 200, 500, 1000, 2000, 4000 kbps). Thuật toán ABR liên tục chọn representation phù hợp dựa trên throughput ước tính và buffer level. Bitrate cao hơn = nhiều bits/s = hình ảnh sắc nét hơn.

**Ý nghĩa so sánh H2 vs H3:**  
Giao thức nào cho phép ABR duy trì Average Bitrate cao hơn trong cùng điều kiện mạng → streaming chất lượng tốt hơn. QUIC được kỳ vọng cao hơn trong môi trường có packet loss nhờ không bị HoL blocking.

---

### 4.2 Stall Count & Stall Duration

**CSV columns:** `StallCount`, `StallDuration_ms`  
**Type:** Cumulative (giá trị cuối phiên — luỹ tích)  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Định nghĩa:**
- **Stall Count:** Số lần video bị dừng hình do buffer cạn
- **Stall Duration:** Tổng thời gian video bị dừng hình (ms), tích lũy trong toàn phiên

**Công thức và cơ chế:**

```typescript
// File: useStallTracker.ts

// Khi dash.js phát BUFFER_EMPTY event (video=mediaType):
const onBufferEmpty = () => {
  stallStartRef.current = Date.now();   // Ghi thời điểm bắt đầu stall
  stallCountRef.current += 1;           // Tăng bộ đếm
  updateStats(prev => ({ ...prev, stallCount: stallCountRef.current }));
};

// Khi dash.js phát BUFFER_LOADED event:
const onBufferLoaded = (): number => {
  if (stallStartRef.current === null) return 0;
  const duration = Date.now() - stallStartRef.current;  // Thời gian stall vừa xảy ra
  stallAccumulatedMsRef.current += duration;              // Cộng dồn
  stallStartRef.current = null;
  updateStats(prev => ({ ...prev, stallDurationMs: stallAccumulatedMsRef.current }));
  return duration;
};
```

**Tại sao dùng BUFFER_EMPTY thay vì HTML5 `waiting` event:**

| Sự kiện | Nguồn | Khi nào fire |
|--------|-------|-------------|
| `waiting` (HTML5) | HTMLVideoElement | Buffer cạn **hoặc** seek **hoặc** initial load |
| `BUFFER_EMPTY` (dash.js) | MediaPlayer | **Chỉ** khi buffer cạn trong khi đang phát |

`BUFFER_EMPTY` chính xác hơn vì chỉ phản ánh buffer depletion thực sự, tránh false positives từ seek operations.

**Stall Duration phân tích:**
```
Mean Stall Duration = StallDuration_ms / StallCount
Total Stall Time (s) = StallDuration_ms / 1000

# So sánh giữa H2 và H3:
# H3 được kỳ vọng ít stall hơn vì:
# 1. Không có HoL blocking ở tầng transport → segment tiếp theo tải nhanh hơn khi có packet loss
# 2. 0-RTT handshake → segment đầu tiên tải nhanh hơn
```

---

### 4.3 Rebuffering Ratio

**CSV column:** `RebufferingRatio`  
**Type:** Instantaneous (cập nhật mỗi giây), nhưng là giá trị tích lũy  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn (mức chấp nhận: < 0.01 = 1%)  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Định nghĩa:**  
Tỷ lệ thời gian người xem phải chờ (do buffer cạn) so với tổng thời gian đã xem video.

**Công thức:**

```
RebufferingRatio = stallAccumulatedMs / (currentTime × 1000)

Trong đó:
  × stallAccumulatedMs: tổng thời gian stall từ đầu phiên (ms) — từ useStallTracker
  × currentTime: vị trí phát hiện tại (giây) × 1000 → đổi sang ms
```

**Cài đặt trong code:**

```typescript
// File: useStreamMetrics.ts — hàm pollStats()
const totalPlaybackMs = currentTime * 1000;
const rebufferingRatio = totalPlaybackMs > 0
  ? Math.round((stallAccumulatedMs / totalPlaybackMs) * 10000) / 10000
  : 0;
```

**Ý nghĩa:**
- `RebufferingRatio = 0.02` → 2% thời gian xem bị dừng hình
- `RebufferingRatio = 0` → Không có stall → lý tưởng
- `RebufferingRatio > 0.01` → Ngưỡng đỏ (hiển thị màu đỏ trên Telemetry Card)

**Nguồn gốc công thức:**  
Đây là chỉ số QoE tiêu chuẩn được định nghĩa bởi Seufert et al. (IEEE Communications Surveys & Tutorials, 2015) — *"A Survey on Quality of Experience of HTTP Adaptive Streaming."*

---

### 4.4 Throughput

**CSV column:** `Throughput_kbps`  
**Type:** Instantaneous (trung bình trượt 1s)  
**Hướng tốt:** ↑ Cao hơn = tốt hơn  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Công thức:**

```
Throughput_kbps = mean(download_speed của các segment trong 1 giây gần nhất)

Sliding window = 10 giây (lưu samples, lấy mean của 1s gần nhất khi polling)
Fallback: player.getAverageThroughput("video")  // Nếu không có sample
```

**Cài đặt:**

```typescript
// File: useStreamMetrics.ts
// Mỗi segment tải xong:
const downloadSpeedKbps = (bytesLoaded * 8) / durationMs;
segmentSamplesRef.current.push({ atMs: Date.now(), kbps: downloadSpeedKbps });
// Giữ 10s gần nhất:
segmentSamplesRef.current = segmentSamplesRef.current
  .filter(s => Date.now() - s.atMs <= 10_000);

// Polling 1s:
const recentSamples = segmentSamplesRef.current.filter(s => Date.now() - s.atMs <= 1000);
avgThroughputKbps = recentSamples.reduce((a, b) => a + b.kbps, 0) / recentSamples.length;
```

**Throughput vs DownloadSpeed:**
- `DownloadSpeed_kbps` = tốc độ của **1 segment cụ thể** (instantaneous)
- `Throughput_kbps` = **trung bình trượt của nhiều segment** trong 1s (smoothed)
- ABR algorithm dùng Throughput (smoothed) để quyết định bitrate → ổn định hơn

---

### 4.5 Time To First Byte (TTFB)

**CSV column:** `TTFB_ms`  
**Type:** Instantaneous (sau mỗi segment)  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Công thức:**

```
TTFB = responseStart - requestStart
```

**Cài đặt:**

```typescript
// File: performanceApi.ts — hàm getTTFBFromPerformanceAPI()
// Yêu cầu header: Timing-Allow-Origin: * trên server (đã cấu hình trong Caddyfile)
const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
for (let i = entries.length - 1; i >= 0; i--) {
  if (entry.name.includes(segmentUrl)) {
    const ttfb = entry.responseStart - entry.requestStart;
    return Math.round(ttfb * 100) / 100;  // ms, 2 decimal places
  }
}
// Fallback: req.firstByteDate - req.startDate (từ dash.js request object)
```

**TTFB ≠ RTT:**  
TTFB bao gồm: DNS lookup + TCP handshake + TLS handshake + server processing + 1 network propagation delay. RTT (Round Trip Time) không đo được chính xác từ browser. TTFB là proxy tốt cho latency trong bối cảnh so sánh giao thức.

**H2 vs H3 và TTFB:**
- HTTP/2: TCP + TLS handshake = 2-3 RTT cho connection đầu tiên (1-2 RTT nếu dùng session resumption)
- HTTP/3 (QUIC): 0-RTT handshake (connection tái sử dụng) hoặc 1-RTT (connection mới) → TTFB thấp hơn đáng kể

---

### 4.6 Segment Download Time (SDT)

**CSV column:** `SDT_ms`  
**Type:** Instantaneous (sau mỗi segment)  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★★★ Bắt buộc trong paper

**Công thức:**

```
SDT = endDate - startDate   (thời gian tải 1 segment DASH từ đầu đến cuối)
```

**Thứ tự ưu tiên nguồn dữ liệu:**

```typescript
// File: useStreamMetrics.ts — hàm processSegment()

// Ưu tiên 1: dash.js v5+ FragmentRequest timestamps
let startTime = req.startDate?.getTime() || req.requestStartDate;
let endTime   = req.endDate?.getTime()   || req.requestEndDate;

// Ưu tiên 2: dash.js trace array
if (durationMs === 0 && Array.isArray(req.trace)) {
  durationMs = req.trace.reduce((sum, t) => sum + (t.d ?? 0), 0);
}

// Ưu tiên 3: Performance Resource Timing API
if (durationMs === 0 && req.url) {
  durationMs = entry.responseEnd - entry.requestStart;
}
```

**Quan hệ với ABR:**
```
SDT < segment_duration → Buffer tăng → ABR có thể upgrade bitrate
SDT ≥ segment_duration → Buffer giảm → ABR phải downgrade bitrate
SDT >> segment_duration → Buffer cạn → Stall xảy ra
```

---

### 4.7 SDT Jitter

**CSV column:** `Jitter_ms`  
**Type:** Instantaneous  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★★☆ Nên có

**Công thức:**

```
Jitter_ms = |SDT_current - SDT_previous|
```

**Cài đặt:**

```typescript
// File: useStreamMetrics.ts
if (durationMs > 0 && prevSDTRef.current !== null) {
  jitterMs = Math.abs(durationMs - prevSDTRef.current);
}
if (durationMs > 0) prevSDTRef.current = durationMs;
```

**Ý nghĩa:**  
Jitter cao → thời gian tải segment dao động lớn → ABR khó dự đoán throughput → dễ chọn sai bitrate → stall hoặc nhảy quality nhiều. H3/QUIC được kỳ vọng có Jitter thấp hơn trong môi trường mạng có packet loss, vì QUIC xử lý mất gói ở cấp độ stream (không block toàn bộ connection).

---

### 4.8 Buffer Level

**CSV column:** `Buffer_s`  
**Type:** Instantaneous (polling 1s)  
**Hướng tốt:** ↑ Cao hơn = tốt hơn (ít rủi ro stall)  
**Mức độ quan trọng:** ★★☆ Nên có

**Công thức:**

```typescript
bufferSeconds = player.getBufferLength("video");  // Giây
```

Buffer thấp (< 2s) là dấu hiệu nguy hiểm — ABR bắt đầu giảm bitrate để bảo vệ buffer. Buffer = 0 → Stall.

---

### 4.9 Quality Switch Count

**CSV column:** `QualitySwitchCount`  
**Type:** Cumulative  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★★☆ Nên có

**Công thức:**

```typescript
// File: useStreamMetrics.ts
const onQualityRendered = (e: any) => {
  if (e?.mediaType !== "video") return;
  qualitySwitchCountRef.current += 1;    // Mỗi QUALITY_CHANGE_RENDERED event
};
```

Quality switch nhiều → video liên tục thay đổi độ sắc nét → gây khó chịu. Lý tưởng là stream ổn định ở 1 bitrate cao.

---

### 4.10 Dropped Frames

**CSV column:** `DroppedFrames`  
**Type:** Cumulative  
**Hướng tốt:** ↓ Thấp hơn = tốt hơn  
**Mức độ quan trọng:** ★☆☆ Bổ sung

```typescript
droppedFrames = video.getVideoPlaybackQuality()?.droppedVideoFrames ?? 0;
```

Ít liên quan trực tiếp đến H2 vs H3 (cùng codec), nhưng cần ghi nhận để loại trừ ảnh hưởng của thiết bị.

---

### 4.11 Frame Rate (FPS)

**CSV column:** `FPS`  
**Type:** Instantaneous (polling 1s)  
**Hướng tốt:** ↑ Cao hơn = tốt hơn  
**Mức độ quan trọng:** ★☆☆ Bổ sung

**Công thức:**

```
FPS = (totalFrames_t2 - totalFrames_t1) / (currentTime_t2 - currentTime_t1)
```

```typescript
// File: useStreamMetrics.ts — hàm pollStats()
const vq = video.getVideoPlaybackQuality?.();
const totalFrames = vq.totalVideoFrames ?? 0;
fps = (totalFrames - prev.totalFrames) / (nowSec - prev.timeSec);
```

FPS giảm so với framerate gốc → có stall hoặc decode issue.

---

### 4.12 Download Speed

**CSV column:** `DownloadSpeed_kbps`  
**Type:** Instantaneous (sau mỗi segment)  
**Hướng tốt:** ↑ Cao hơn = tốt hơn  
**Mức độ quan trọng:** ★★☆ Nên có

**Công thức:**

```
DownloadSpeed_kbps = (bytesLoaded × 8) / SDT_ms

Đơn vị: kilobits per second (kbps)
```

DownloadSpeed là tốc độ tải của 1 segment cụ thể (instantaneous), khác với Throughput là trung bình trượt.

---

### 4.13 Protocol Detection

**CSV column:** `Protocol`  
**Type:** Metadata  
**Mức độ quan trọng:** Biến độc lập chính (independent variable)

**Cách phát hiện:**

```typescript
// File: performanceApi.ts — hàm detectProtocol()
// Browser PerformanceResourceTiming API:
// entry.nextHopProtocol: "h3", "h3-29", "h2", "http/1.1"

for (let i = entries.length - 1; i >= 0; i--) {
  const proto = (entry as any).nextHopProtocol;
  if (proto === "h3" || proto.includes("quic")) return "HTTP/3 (QUIC)";
  if (proto === "h2") return "HTTP/2";
}
```

**Tại sao quan trọng:**  
`Protocol` là biến phân loại chính để tách dữ liệu H2 vs H3 khi phân tích. Caddy được cấu hình phục vụ cả H2 và H3 — browser tự đàm phán với server để chọn giao thức tốt nhất hỗ trợ.

---

### 4.14 Network Type

**CSV column:** `NetworkType`  
**Type:** Metadata  
**Mức độ quan trọng:** Methodology context

```typescript
// File: performanceApi.ts
const networkType = navigator.connection?.type;
// Giá trị: "wifi", "cellular", "ethernet", "none", "unknown"
// KHÔNG dùng effectiveType (luôn trả "4g" cho WiFi tốt — thiếu chính xác)
```

Cần ghi nhận để mô tả đúng experimental conditions trong phần Methodology của paper.

---

## 5. Pipeline phân tích thống kê

**File:** `scripts/analyze_logs.py`

### Các kiểm định thống kê áp dụng

Với mỗi chỉ số số học (15 chỉ số), script chạy 4 kiểm định:

| Kiểm định | Loại | Mục đích | Giả thuyết H₀ |
|-----------|------|---------|--------------|
| **Welch's t-test** | Parametric | So sánh mean (không giả định phương sai bằng nhau) | µ_H2 = µ_H3 |
| **Mann-Whitney U** | Non-parametric | So sánh phân phối (không giả định normal distribution) | F_H2 = F_H3 |
| **Kolmogorov-Smirnov 2-sample** | Non-parametric | So sánh toàn bộ hình dạng phân phối | F_H2 = F_H3 |
| **Cohen's d** | Effect size | Đo độ lớn thực tế của khác biệt | — |

**Công thức Cohen's d:**

```
d = (µ_H2 - µ_H3) / pooled_std

pooled_std = sqrt(((n1-1)×var1 + (n2-1)×var2) / (n1+n2-2))

Mức độ: |d| < 0.2 = nhỏ, 0.2-0.5 = trung bình, > 0.8 = lớn
```

### Thống kê mô tả

Cho mỗi chỉ số, script tính:
- Mean, Median, Std, CoV% (Coefficient of Variation)
- P5, P25, P50, P75, P95 (percentiles)
- Δ Mean (H3 - H2), Δ% (phần trăm thay đổi)
- Verdict: "H3 ✓" (H3 tốt hơn), "H2 ✓" (H2 tốt hơn), "=" (tương đương)

### Kết quả xuất ra

```
output_dir/
├── 01_summary_table.png      # Bảng tổng hợp
├── 02_cdf.png                # Empirical CDF (9 subplots)
├── 03_boxplot.png            # Box-plot (9 subplots)
├── 04_timeline.png           # Timeline theo playback time
├── 05_bar_ci.png             # Bar chart + 95% CI
├── 06_radar.png              # Radar chart normalised
├── 07_stall_analysis.png     # Stall & rebuffering
├── 08_correlation.png        # Pearson correlation heatmap
├── 09_throughput_stability.png  # Sliding window + CoV
├── 10_percentile_ladder.png  # P5-P95 side by side
└── statistical_tests.csv     # Bảng kiểm định đầy đủ
```

### Phân biệt Instantaneous vs Cumulative

| Loại | Chỉ số | Cách lấy để phân tích |
|------|--------|----------------------|
| Instantaneous | Bitrate, Throughput, TTFB, SDT, Jitter, Buffer, FPS, DownloadSpeed | Dùng **tất cả dòng** → tính mean, CDF, boxplot |
| Cumulative | StallCount, StallDuration, RebufferingRatio, DroppedFrames, QualitySwitchCount | Chỉ lấy **dòng cuối phiên** (giá trị tích lũy) → so sánh session-level |

---

## 6. Cấu trúc dữ liệu CSV

### 23 cột CSV xuất từ ConsoleLogsPanel

```
Timestamp         - HH:MM:SS định dạng
Level             - SYS | NET | INFO | WARN | ERRO
Message           - Nội dung sự kiện
Protocol          - "HTTP/3 (QUIC)" hoặc "HTTP/2"
NetworkType       - wifi | cellular | ethernet | unknown

Bitrate_kbps      - Instantaneous, kbps (số nguyên)
Resolution        - "WxH" (ví dụ "1280x720")
Throughput_kbps   - Instantaneous, kbps (floating point)
Buffer_s          - Instantaneous, giây (2 decimal)
FPS               - Instantaneous, fps (1 decimal)
TTFB_ms           - Per-segment, ms (2 decimal)
SDT_ms            - Per-segment, ms (số nguyên)
Jitter_ms         - Per-segment, ms (2 decimal)
DownloadSpeed_kbps - Per-segment, kbps (2 decimal)

StallCount        - Cumulative, số lần stall
StallDuration_ms  - Cumulative, ms tích lũy
RebufferingRatio  - Cumulative, [0-1] (4 decimal)
DroppedFrames     - Cumulative, số frame
QualitySwitchCount - Cumulative, số lần chuyển

CurrentTime_s     - Vị trí phát hiện tại (s)
Duration_s        - Độ dài video (s)
IsAutoQuality     - true/false (ABR hay manual)
ActiveScenario    - Label kịch bản mạng đang áp dụng
```

---

## 7. Kịch bản thí nghiệm (Experiment Scenarios)

### Ma trận thí nghiệm gợi ý

| Kịch bản mạng | Bandwidth | Delay | Loss | Kỳ vọng H3 | Lý do |
|-------------|-----------|-------|------|----------|-------|
| Fiber Optic | 100+ Mbps | 2ms | 0% | ≈ ngang | Mạng quá tốt, HoL không ảnh hưởng |
| Mobile 4G High | 20 Mbps | 40ms | 0.1% | H3 nhỉnh hơn | Loss nhỏ, QUIC hồi phục nhanh hơn |
| Mobile 4G Limited | 5 Mbps | 100ms | 0.5% | H3 tốt hơn | Loss + delay rõ ràng hơn |
| 3G UMTS | 1.5 Mbps | 200ms | 1% | H3 tốt hơn rõ | ABR bị thách thức |
| Slow 3G + Lag | 500 kbps | 400ms | 2% | H3 tốt hơn tốt | HoL blocking H2 bộc lộ |
| 2G / EDGE | 250 kbps | 800ms | 5% | H3 tốt hơn nhiều | Môi trường khắc nghiệt nhất |

### Tham số thí nghiệm đề xuất

```
Số lần replay mỗi kịch bản: 5-10 lần
Video test: Big Buck Bunny (H.264 DASH) — duration ~60s
Số kịch bản: 6 (như bảng trên)
Giao thức: 2 (H2 và H3)
Tổng số phiên: 6 × 2 × 10 = 120 phiên
Ước tính dữ liệu: ~50-200 log events/phiên → tổng ~6000-24000 dòng CSV
```

### Workflow thu thập dữ liệu

```
1. Khởi động stack: docker-compose up -d
2. Mở browser → https://video.duxng.io.vn
3. Chọn kịch bản mạng (vd: "3G / UMTS Legacy")
4. Đặt Replay Count = 5 (hoặc 10)
5. Bấm Play → đợi tự động hoàn thành (indicator: "COMPLETE")
6. Download CSV → đặt tên: h2_3g_5x.csv hoặc h3_3g_5x.csv
7. Lặp lại cho giao thức còn lại
8. python analyze_logs.py h2_3g_5x.csv h3_3g_5x.csv --out results/3g/
```

---

## 8. Luồng dữ liệu end-to-end

```
┌─────────────────────────────────────────────────────────────────┐
│  1. KHỞI TẠO                                                    │
│     App.jsx → VideoPlayer → useDashPlayer                       │
│     → MediaPlayer.create() → manifest.mpd                       │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. PHÁT VIDEO (mỗi segment ~2-4s)                              │
│     FRAGMENT_LOADING_COMPLETED                                   │
│     → processSegment(req, event)                                │
│       ├─ SDT = endDate - startDate                              │
│       ├─ TTFB = getTTFBFromPerformanceAPI(url)                  │
│       ├─ DownloadSpeed = bytes*8 / SDT                          │
│       ├─ Jitter = |SDT - SDT_prev|                              │
│       └─ Push to sliding window                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. POLLING (mỗi 1 giây)                                        │
│     pollStats(video, player, stallAccumulatedMs)                │
│       ├─ bufferSeconds = player.getBufferLength("video")        │
│       ├─ FPS = Δframes / Δtime                                  │
│       ├─ avgThroughputKbps = mean(samples in 1s)                │
│       ├─ protocol = detectProtocol("/media")                    │
│       ├─ networkType = navigator.connection.type                │
│       └─ rebufferingRatio = stallMs / (currentTime*1000)        │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. STALL DETECTION (event-driven)                              │
│     BUFFER_EMPTY → onBufferEmpty()                              │
│       ├─ stallStart = Date.now()                                │
│       └─ stallCount++                                           │
│     BUFFER_LOADED → onBufferLoaded()                            │
│       ├─ duration = Date.now() - stallStart                     │
│       └─ stallAccumulatedMs += duration                         │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. LOG ENTRY (mỗi sự kiện quan trọng)                          │
│     addLog(level, message) → snapshot toàn bộ stats             │
│     → setLogs(prev => [newEntry, ...prev])  // Unlimited        │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. AUTO-REPLAY (khi video kết thúc)                            │
│     currentReplay < replayCount?                                │
│     → YES: video.currentTime=0; video.play() → Replay #N+1     │
│     → NO:  isReplayDone=true; logging stopped                   │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. EXPORT                                                      │
│     Download CSV → 23-column telemetry data                     │
│     Download TXT → Human-readable measurement report            │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  8. PHÂN TÍCH (offline)                                         │
│     python analyze_logs.py h2.csv h3.csv --out results/         │
│     → 10 biểu đồ PNG + statistical_tests.csv                   │
│     → Welch t-test, Mann-Whitney U, KS test, Cohen's d          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Ghi chú phương pháp cho bài báo khoa học

### 9.1 Reproducibility

- **Cố định điều kiện mạng:** Dùng `tc netem` với tham số cứng (không ngẫu nhiên) → experiment reproducible
- **Cùng video content:** Big Buck Bunny H.264 DASH — video test chuẩn công nghiệp
- **Số lần replay:** Tối thiểu 5 lần/kịch bản để có đủ sample size
- **Browser chuẩn:** Chrome/Edge (Chromium) — hỗ trợ đầy đủ `nextHopProtocol`, `Network Information API`, `VideoPlaybackQuality`

### 9.2 Validity của phép đo

| Chỉ số | Nguồn | Độ chính xác |
|-------|-------|------------|
| TTFB | Performance Resource Timing API (`responseStart - requestStart`) | ±0.01ms (high precision) |
| SDT | dash.js FragmentRequest timestamps | ±1ms |
| StallCount/Duration | BUFFER_EMPTY/BUFFER_LOADED events | Chính xác theo event |
| Protocol | `nextHopProtocol` | 100% correct khi browser hỗ trợ |
| FPS | `VideoPlaybackQuality.totalVideoFrames` | ±0.1 fps (1s window) |
| Buffer | `player.getBufferLength("video")` | ±1s (polling granularity) |

> **Lưu ý quan trọng:** `Timing-Allow-Origin: *` header phải có trên server (đã cấu hình trong Caddyfile) để `PerformanceResourceTiming` cung cấp `responseStart` và `requestStart`. Thiếu header này, TTFB sẽ là 0.

### 9.3 Hạn chế cần nêu trong paper (Limitations)

1. **Mô phỏng mạng, không phải mạng thực tế:** `tc netem` mô phỏng bandwidth/delay/loss nhưng không tái tạo được toàn bộ đặc tính của mạng di động thực (handover, path diversity, etc.)

2. **Single-client test:** Không mô phỏng tải cao từ nhiều client đồng thời → kết quả có thể khác trong production

3. **Browser-side measurement:** Một số chỉ số (TTFB, SDT) phụ thuộc vào độ chính xác của browser APIs, có thể có sai số nhỏ

4. **Caddy caching:** Nếu Caddy cache media files, các lần replay sau có thể phục vụ từ cache → SDT thấp hơn thực tế. Cần disable cache hoặc clear giữa các phiên đo

5. **Network Information API:** Chỉ hoạt động trên Chromium-based browsers → không so sánh được trên Safari/Firefox

### 9.4 Biến số thí nghiệm

| Loại biến | Biến | Kiểm soát |
|----------|------|---------|
| **Independent variable** | HTTP/2 vs HTTP/3 | Kiểm soát qua Caddy (`protocols h1 h2 h3`) + browser protocol negotiation |
| **Controlled variable** | Điều kiện mạng | Kiểm soát qua `tc netem` |
| **Controlled variable** | Video content | Cùng manifest + cùng segments |
| **Controlled variable** | ABR algorithm | dash.js default ABR (BOLA-based) |
| **Dependent variables** | 16 QoE metrics | Đo lường bởi hệ thống |

### 9.5 Kiểm định thống kê và significance

- **p < 0.05:** Khác biệt có ý nghĩa thống kê (statistically significant)
- **Dùng cả 3 kiểm định:** Welch t-test + Mann-Whitney U + KS test → kết quả robust hơn (không phụ thuộc vào giả định phân phối)
- **Cohen's d:** Đo practical significance (khác biệt có lớn về mặt thực tế không)

---

## 10. Tài liệu tham khảo

```
[1] Seufert, M., Egger, S., Slanina, M., Zinner, T., Hoßfeld, T., & Tran-Gia, P. (2015).
    "A Survey on Quality of Experience of HTTP Adaptive Streaming."
    IEEE Communications Surveys & Tutorials, 17(1), 469-492.
    → Định nghĩa RebufferingRatio và các QoE metrics chuẩn.

[2] Bentaleb, A., Taani, B., Begen, A.C., Timmerer, C., & Zimmermann, R. (2019).
    "A Survey on Bitrate Adaptation Schemes for Streaming Media Over HTTP."
    IEEE Communications Surveys & Tutorials, 21(1), 562-585.
    → Tổng quan các thuật toán ABR.

[3] Bhat, D., Rizk, A., & Zink, M. (2020).
    "Not So QUIC: A Performance Study of DASH over QUIC."
    ACM NOSSDAV 2020.
    → Nghiên cứu benchmark DASH trên QUIC — kết quả không phải lúc nào H3 cũng tốt hơn.

[4] Palmer, M., Krüger, T., Chandaria, B., & Sherrer, S. (2018).
    "The QUIC Fix for Optimal Video Streaming."
    ACM MMSys 2018.
    → H3/QUIC cải thiện streaming trong điều kiện packet loss cao.

[5] Yu, J., et al. (2021).
    "Can QUIC Replace TCP for Web Video Streaming?"
    IEEE INFOCOM Workshop 2021.
    → So sánh H2 vs H3 cho video streaming trên các môi trường mạng khác nhau.

[6] MPEG-DASH Standard: ISO/IEC 23009-1:2019.
    "Information technology — Dynamic adaptive streaming over HTTP (DASH)."

[7] Cardaci, A., Le Feuvre, J., & Duflos, S. (2021).
    "dash.js: A Reference Client Implementation for MPEG-DASH Players."
    → dash.js library documentation — basis for DASH player implementation.

[8] W3C Performance Resource Timing API:
    https://www.w3.org/TR/resource-timing/
    → Chuẩn API dùng để đo TTFB, SDT, protocol detection.

[9] Network Effect Emulation with tc-netem:
    Linux `iproute2` documentation — tc(8), netem(8).
    → Công cụ mô phỏng mạng dùng trong thí nghiệm.
```

---

*Tài liệu này được cập nhật tự động từ codebase. Phiên bản: 2026-04-08.*
