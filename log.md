# Log Metrics Guide

Tài liệu này giải thích các thông số trong console log và file CSV (`adtube-metrics-*.csv`).

## 1) Cấu trúc 1 dòng log (UI)

Mỗi dòng log trên panel gồm 4 cột:

- Timestamp: thời điểm tạo log, định dạng `HH:mm:ss.cs` (cs = centisecond).
- Level: mức độ log (`SYS`, `NET`, `INFO`, `WARN`, `ERRO`).
- Protocol: giao thức mạng tại thời điểm tạo log (ví dụ: `HTTP/3 (QUIC)`, `HTTP/2`, `HTTP/1.1`, `DASH / HTTPS`).
- Message: nội dung sự kiện.

Lưu ý: hệ thống đang dùng "snapshot theo từng log", nghĩa là mỗi log giữ bộ metrics riêng tại thời điểm phát sinh.

## 2) Ý nghĩa các Level

- SYS: sự kiện hệ thống/player (init, start, pause, load manifest...).
- NET: sự kiện tải segment mạng (kích thước, latency segment...).
- INFO: sự kiện thông tin (áp dụng scenario thành công, đổi quality tăng...).
- WARN: cảnh báo (giảm quality, rebuffering...).
- ERRO: lỗi (player error, API scenario fail...).

## 3) Các cột trong CSV và ý nghĩa

### Nhóm sự kiện

- Timestamp: thời điểm của bản ghi log.
- Level: cấp độ log.
- Message: mô tả sự kiện.

### Nhóm video/quality

- Resolution: độ phân giải hiện tại (`WxH`).
- Bitrate_kbps: bitrate representation đang phát (kbps).
- Throughput_kbps: throughput đo được (kbps), ưu tiên mẫu segment gần nhất.
- FPS: khung hình/giây đo realtime từ `VideoPlaybackQuality`.
- DroppedFrames: tổng số frame bị rơi.
- TotalFrames: tổng số frame đã render.
- Codec: codec của representation hiện tại (ví dụ `avc1...`).
- QualityIndex: index quality hiện tại (bắt đầu từ 0).
- QualityCount: tổng số quality level có sẵn.
- QualitySwitchCount: số lần chuyển quality trong phiên.

### Nhóm buffer/playback

- Buffer_s: độ dài bộ đệm video (giây).
- CurrentTime_s: vị trí phát hiện tại (giây).
- Duration_s: tổng thời lượng media (giây).
- RebufferCount: số lần bị stall/waiting.
- RebufferDuration_ms: tổng thời gian stall tích lũy (ms).

### Nhóm mạng/segment

- Protocol: giao thức mạng phát hiện từ Resource Timing (`nextHopProtocol`).
- Latency_ms: thời gian tải segment gần nhất (ms).
- Jitter_ms: biên độ dao động latency, tính bằng `abs(latency_hien_tai - latency_truoc)`.
- RTT_ms: RTT ước tính (ms).
- DownloadSpeed_kbps: tốc độ tải segment gần nhất (kbps).
- SegmentSize_KB: kích thước segment gần nhất (KB).
- SegmentDuration_ms: thời gian tải segment gần nhất (ms).
- TotalDownloaded_MB: tổng dung lượng đã tải (MB).
- ConnectionType: loại mạng trình duyệt báo (ví dụ `4g`, `wifi` tùy browser).
- EstimatedBandwidth_Mbps: băng thông ước tính từ `Network Information API` (`downlink`).

### Nhóm ngữ cảnh điều khiển

- IsAutoQuality: chế độ quality tại thời điểm log (`true` = ABR auto, `false` = manual).
- ActiveScenario: tên network scenario đang active.

## 4) Công thức tính nhanh một số cột

- DownloadSpeed_kbps = `(bytesLoaded * 8) / durationMs`.
- Throughput_kbps = trung bình các mẫu download speed trong cửa sổ gần nhất.
- Jitter_ms = `|latency_now - latency_prev|`.
- TotalDownloaded_MB = tổng bytes tải được đổi sang MB.

## 5) Tại sao cùng level nhưng số liệu có thể khác?

Vì mỗi log là một snapshot riêng. 2 dòng cùng `NET` hoặc `SYS` vẫn có metrics khác nhau nếu tạo ở thời điểm khác nhau.

## 6) Lưu ý độ chính xác

- Protocol và thông số mạng phụ thuộc browser support (`Resource Timing`, `Network Information API`).
- Trong một số trường hợp browser không expose dữ liệu đầy đủ, giá trị có thể fallback (`DASH / HTTPS`, `0`, hoặc `—`).
- CSV được xuất UTF-8 BOM để mở bằng Excel không bị lỗi ký tự.
