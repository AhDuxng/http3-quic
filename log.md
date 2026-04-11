# Huong dan Log Metrics

Tai lieu giai thich cac chi so trong console log panel va file CSV (`adtube-metrics-*.csv`).

## 1) Cau truc Log Entry (UI)

Moi dong log co 4 cot:

- **Timestamp**: thoi diem tao event, dinh dang `HH:mm:ss.cs` (cs = phan tram giay).
- **Level**: muc do (`SYS`, `NET`, `INFO`, `WARN`, `ERRO`).
- **Protocol**: giao thuc mang phat hien tai thoi diem log (`HTTP/3 (QUIC)`, `HTTP/2`).
- **Message**: mo ta su kien.

He thong su dung "per-log snapshots" — moi log entry chua toan bo metric tai thoi diem tao.

## 2) Dinh nghia Log Level

- **SYS**: su kien he thong (init, start, pause, manifest, stall resolve...).
- **NET**: tai segment (size, SDT, TTFB...).
- **INFO**: thong tin (scenario applied, quality upgraded...).
- **WARN**: canh bao (quality reduced, stall detected...).
- **ERRO**: loi (player error, API failure...).

## 3) Cac cot CSV (23 cot)

### Nhom event

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `Timestamp` | `HH:mm:ss.cs` | He thong log |
| `Level` | Text | He thong log |
| `Message` | Text | He thong log |

### Nhom mang / giao thuc

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `Protocol` | Text | `PerformanceResourceTiming.nextHopProtocol` |
| `NetworkType` | Text (`wifi`, `cellular`, `ethernet`) | `navigator.connection.type` |

### Nhom chat luong video

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `Bitrate_kbps` | kbps | dash.js representation `bitrateInKbit`/`bandwidth` |
| `Resolution` | `WxH` | dash.js representation |
| `Throughput_kbps` | kbps | Trung binh trong so 10s (tong bits / tong SDT) / fallback `player.getAverageThroughput()` |
| `Buffer_s` | giay | `player.getBufferLength("video")` |
| `FPS` | so | `delta(totalVideoFrames) / delta(currentTime)` |

### Nhom mang / segment

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `TTFB_ms` | ms | `PerformanceResourceTiming: responseStart - requestStart` |
| `SDT_ms` | ms | `endDate - startDate` cua segment request |
| `Jitter_ms` | ms | `|SDT_hien_tai - SDT_truoc|` |
| `DownloadSpeed_kbps` | kbps | `(bytesLoaded × 8) / SDT_ms` |

### Nhom on dinh phat

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `StallCount` | so lan | So event `BUFFER_EMPTY` tu dash.js |
| `StallDuration_ms` | ms | Tong thoi gian `BUFFER_EMPTY → BUFFER_LOADED` |
| `RebufferingRatio` | [0, 1] | `totalStallDuration / totalPlaybackDuration` |
| `DroppedFrames` | so khung | `VideoPlaybackQuality.droppedVideoFrames` |
| `QualitySwitchCount` | so lan | So event `QUALITY_CHANGE_RENDERED` |

### Nhom vi tri phat

| Cot CSV | Don vi | Nguon |
|---|---|---|
| `CurrentTime_s` | giay | `HTMLVideoElement.currentTime` |
| `Duration_s` | giay | `HTMLVideoElement.duration` |

### Nhom ngu canh

| Cot CSV | Mo ta |
|---|---|
| `IsAutoQuality` | `true` = Auto ABR, `false` = Manual |
| `ActiveScenario` | Ten kich ban mang dang ap dung |

## 4) Cong thuc chinh

```
DownloadSpeed_kbps = (bytesLoaded × 8) / SDT_ms
Throughput_kbps    = tong bits cua cac segment trong 10 giay / tong SDT cua cac segment do
Jitter_ms          = |SDT_hien_tai − SDT_truoc|
TTFB_ms            = responseStart − requestStart  (Performance Resource Timing API)
RebufferingRatio   = totalStallDuration / (currentTime × 1000)
FPS                = (totalFrames_t2 - totalFrames_t1) / (currentTime_t2 - currentTime_t1)
```

## 5) Ghi chu ve do chinh xac

- **TTFB** yeu cau header `Timing-Allow-Origin` tren server. Khong co thi browser tra ve 0.
- **Protocol** lay tu `PerformanceResourceTiming.nextHopProtocol`.
- **NetworkType** dung `navigator.connection.type` (loai ket noi vat ly thuc), KHONG dung `effectiveType` (luon tra "4g" cho WiFi tot).
- **Stall** do tu dash.js `BUFFER_EMPTY`/`BUFFER_LOADED` — chinh xac hon HTML5 "waiting" event.
- **Throughput** duoc tinh tu mau 10 giay theo trung binh trong so (tong bits / tong SDT), giam nhieu khi dao dong so voi trung binh 1 giay.
- CSV xuat voi UTF-8 BOM de tuong thich Excel.
