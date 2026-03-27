# CSV Log Metrics Reference

Tài liệu này mô tả các cột trong file CSV khi bấm Download CSV (`adtube-metrics-*.csv`).

## 1) Tổng quan

Mỗi dòng CSV là một snapshot metrics tại thời điểm một sự kiện log được tạo.
Điều này có nghĩa:

- Các dòng có thể cùng `Level` nhưng số liệu khác nhau.
- Giá trị không phải là "trạng thái hiện tại" tại lúc bạn mở file, mà là tại thời điểm event xảy ra.

## 2) Danh sách cột và ý nghĩa

| Cột CSV | Ý nghĩa | Đơn vị / Định dạng | Nguồn dữ liệu |
|---|---|---|---|
| Timestamp | Mốc thời gian của event log | `HH:mm:ss.cs` | Hệ thống log |
| Level | Mức độ log (`SYS`, `NET`, `INFO`, `WARN`, `ERRO`) | Text | Hệ thống log |
| Message | Nội dung event | Text | Hệ thống log |
| Resolution | Độ phân giải stream hiện tại | `WxH` | dash.js representation |
| Bitrate_kbps | Bitrate quality đang render | kbps | representation (`bitrateInKbit`/`bandwidth`) |
| Throughput_kbps | Throughput ước tính gần thời điểm log | kbps | Mẫu segment + fallback dash.js |
| Buffer_s | Độ dài bộ đệm video | giây (s) | `player.getBufferLength("video")` |
| FPS | Tốc độ khung hình realtime | fps | `getVideoPlaybackQuality()` |
| DroppedFrames | Số frame bị rơi | frames | `VideoPlaybackQuality` |
| TotalFrames | Tổng frame đã render | frames | `VideoPlaybackQuality` |
| Latency_ms | Thời gian tải segment gần nhất | ms | Request timing |
| Jitter_ms | Biên độ dao động latency giữa 2 segment liên tiếp | ms | Tự tính toán |
| RTT_ms | RTT ước tính | ms | Tự tính toán |
| DownloadSpeed_kbps | Tốc độ tải segment gần nhất | kbps | Từ `bytesLoaded/durationMs` |
| SegmentSize_KB | Kích thước segment gần nhất | KB | Request bytes |
| SegmentDuration_ms | Thời gian tải segment gần nhất | ms | Request timing |
| TotalDownloaded_MB | Tổng dung lượng đã tải | MB | Tổng bytes tích lũy |
| RebufferCount | Số lần playback bị stall/waiting | lần | Event `waiting` |
| RebufferDuration_ms | Tổng thời gian stall tích lũy | ms | Đo thời gian waiting -> play |
| QualitySwitchCount | Số lần đổi quality | lần | Event quality change |
| CurrentTime_s | Vị trí playback tại lúc log | giây (s) | HTMLVideoElement |
| Duration_s | Tổng thời lượng media | giây (s) | HTMLVideoElement |
| Codec | Codec của representation đang phát | Text | Representation info |
| QualityIndex | Thứ tự quality hiện tại | số nguyên (0-based) | So khớp trong danh sách reps |
| QualityCount | Tổng số quality levels | số nguyên | Danh sách reps |
| Protocol | Giao thức mạng phát hiện được | Text | Resource Timing `nextHopProtocol` |
| ConnectionType | Loại kết nối trình duyệt báo | Text (ví dụ `4g`) | Network Information API |
| EstimatedBandwidth_Mbps | Băng thông ước tính từ browser | Mbps | Network Information API (`downlink`) |
| IsAutoQuality | Có đang bật ABR auto hay không | `true` / `false` | Player state |
| ActiveScenario | Tên network scenario đang active | Text | UI/Scenario state |

## 3) Công thức tính các chỉ số quan trọng

- `DownloadSpeed_kbps = (bytesLoaded * 8) / durationMs`
- `Jitter_ms = abs(latency_hien_tai - latency_truoc)`
- `TotalDownloaded_MB = tong_bytes / (1024 * 1024)`
- `Throughput_kbps`: ưu tiên trung bình mẫu segment gần nhất; nếu thiếu mẫu thì fallback API throughput của player.

## 4) Cách đọc nhanh CSV khi phân tích

- Kiểm tra chất lượng:
  - `Bitrate_kbps`, `QualityIndex`, `QualitySwitchCount`
- Kiểm tra độ ổn định playback:
  - `Buffer_s`, `RebufferCount`, `RebufferDuration_ms`, `DroppedFrames`
- Kiểm tra chất lượng mạng:
  - `Latency_ms`, `Jitter_ms`, `RTT_ms`, `DownloadSpeed_kbps`, `Protocol`
- Kiểm tra bối cảnh kết nối:
  - `ConnectionType`, `EstimatedBandwidth_Mbps`, `ActiveScenario`

## 5) Lưu ý thực tế

- `Protocol` và các thông số mạng phụ thuộc khả năng browser expose API.
- Nếu browser không cung cấp dữ liệu đầy đủ, một số trường có thể là fallback (`DASH / HTTPS`, `0`, hoặc `—`).
- File CSV đã được xuất UTF-8 BOM để mở bằng Excel không bị lỗi ký tự.
