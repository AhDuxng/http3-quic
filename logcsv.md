# Chi tiet cot CSV — Tham chieu cho paper

Tai lieu mo ta day du tat ca 23 cot trong file CSV xuat tu "Download CSV" (`adtube-metrics-*.csv`).

## 1) Tong quan

Moi dong CSV la mot snapshot metric tai thoi diem tao log event.
- Cac dong cung Level co the co metric khac nhau (vi khac thoi diem).
- Du lieu la trang thai tai thoi diem event, KHONG phai trang thai hien tai.

## 2) Thu tu cot CSV

```
Timestamp, Level, Message, Protocol, NetworkType,
Bitrate_kbps, Resolution, Throughput_kbps, Buffer_s, FPS,
TTFB_ms, SDT_ms, Jitter_ms, DownloadSpeed_kbps,
StallCount, StallDuration_ms, RebufferingRatio,
DroppedFrames, QualitySwitchCount,
CurrentTime_s, Duration_s, IsAutoQuality, ActiveScenario
```

## 3) Dinh nghia tung cot

### Nhom event

| Cot | Ten hoc thuat | Don vi | Nguon |
|---|---|---|---|
| Timestamp | — | `HH:mm:ss.cs` | He thong log |
| Level | — | Text | He thong log |
| Message | — | Text | He thong log |

### Nhom giao thuc / mang

| Cot | Ten hoc thuat | Don vi | Nguon | Do chinh xac |
|---|---|---|---|---|
| Protocol | Network Protocol | Text | `PerformanceResourceTiming.nextHopProtocol` | ✅ Cao |
| NetworkType | Physical Network Type | Text | `navigator.connection.type` | ✅ Chinh xac loai ket noi vat ly |

### Nhom chat luong video

| Cot | Ten hoc thuat | Don vi | Nguon | Do chinh xac |
|---|---|---|---|---|
| Bitrate_kbps | Video Bitrate | kbps | dash.js `representation.bitrateInKbit` | ✅ Truc tiep |
| Resolution | Video Resolution | `WxH` | dash.js `representation.width/height` | ✅ Truc tiep |
| Throughput_kbps | Throughput | kbps | Trung binh trong so 10s (tong bits / tong SDT) / fallback `player.getAverageThroughput()` | ✅ Cao |
| Buffer_s | Buffer Occupancy | giay | `player.getBufferLength("video")` | ✅ Truc tiep |
| FPS | Frame Rate | fps (so) | `delta(totalVideoFrames) / delta(currentTime)` | ✅ Tinh toan |

### Nhom mang / segment

| Cot | Ten hoc thuat | Don vi | Nguon | Do chinh xac |
|---|---|---|---|---|
| TTFB_ms | Time To First Byte | ms | `PerformanceResourceTiming: responseStart - requestStart` | ✅ Cao (can `Timing-Allow-Origin`) |
| SDT_ms | Segment Download Time | ms | `endDate - startDate` request / fallback trace / fallback Performance API | ✅ Cao |
| Jitter_ms | SDT Jitter | ms | `|SDT_hien_tai - SDT_truoc|` | ✅ Tinh toan |
| DownloadSpeed_kbps | Download Speed | kbps | `(bytesLoaded × 8) / SDT_ms` | ✅ Tinh toan |

### Nhom on dinh phat lai

| Cot | Ten hoc thuat | Don vi | Nguon | Do chinh xac |
|---|---|---|---|---|
| StallCount | Stall Count | su kien | dash.js `BUFFER_EMPTY` event | ✅ Chuan hoc thuat |
| StallDuration_ms | Total Stall Duration | ms | `BUFFER_EMPTY → BUFFER_LOADED` timing | ✅ Chinh xac |
| RebufferingRatio | Rebuffering Ratio | [0, 1] | `totalStallDuration / (currentTime × 1000)` | ✅ Chuan QoE |
| DroppedFrames | Dropped Frames | khung hinh | `VideoPlaybackQuality.droppedVideoFrames` | ✅ Browser API |
| QualitySwitchCount | Quality Switch Count | su kien | `QUALITY_CHANGE_RENDERED` events | ✅ Truc tiep |

### Nhom vi tri

| Cot | Ten hoc thuat | Don vi | Nguon |
|---|---|---|---|
| CurrentTime_s | Playback Position | giay | `HTMLVideoElement.currentTime` |
| Duration_s | Media Duration | giay | `HTMLVideoElement.duration` |

### Nhom ngu canh

| Cot | Mo ta |
|---|---|
| IsAutoQuality | `true` = Auto ABR, `false` = Manual |
| ActiveScenario | Ten kich ban mang dang dung |

## 4) Cong thuc tinh toan

```
DownloadSpeed_kbps  = (bytesLoaded × 8) / SDT_ms
Throughput_kbps     = tong bits cac segment trong 10 giay gan nhat / tong SDT cac segment do
Jitter_ms           = |SDT_i − SDT_{i−1}|
TTFB_ms             = responseStart − requestStart
RebufferingRatio    = totalStallDuration_ms / (currentTime_s × 1000)
FPS                 = (totalFrames_t2 − totalFrames_t1) / (time_t2 − time_t1)
```

## 5) Huong dan phan tich nhanh

- **Chat luong video**: `Bitrate_kbps`, `Throughput_kbps`, `QualitySwitchCount`
- **On dinh phat**: `StallCount`, `StallDuration_ms`, `RebufferingRatio`, `Buffer_s`, `DroppedFrames`
- **Hieu nang mang**: `TTFB_ms`, `Jitter_ms`, `SDT_ms`, `DownloadSpeed_kbps`, `Protocol`
- **Ngu canh**: `NetworkType`, `ActiveScenario`

## 6) Quy uoc ten chi so

Ten chi so tuan theo quy uoc IEEE/ACM trong nghien cuu adaptive streaming QoE:

- **SDT** (Segment Download Time) — KHONG dung "Latency" (mo ho)
- **TTFB** (Time To First Byte) — KHONG dung "RTT" (khong do chinh xac tu browser)
- **Stall** — do tu dash.js `BUFFER_EMPTY`/`BUFFER_LOADED` (chuan hoc thuat)
- **Rebuffering Ratio** — chi so QoE chuan: `tong_thoi_gian_stall / tong_thoi_gian_phat`

## 7) Ghi chu quan trong

- `Protocol` va metric mang phu thuoc API cua browser (`Resource Timing`, `Network Information API`).
- Khong co du lieu thi mot so cot fallback ve `Detecting...`, `0`, hoac `unknown`.
- CSV xuat voi UTF-8 BOM tuong thich Excel.
- Header `Timing-Allow-Origin` phai duoc cau hinh tren server de TTFB chinh xac.
