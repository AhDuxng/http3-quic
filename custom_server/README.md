# Custom H2 + H3/MPQUIC server

## Kiến trúc

```text
                         custom_server
                              │
              ┌───────────────┴───────────────┐
              │                               │
          TCP 443                         UDP 443
      TLS 1.3 + ALPN h2             picoquic + h3zero
              │                               │
     Node.js HTTP/2 API              QUIC hoặc MPQUIC
              └───────────────┬───────────────┘
                              │
                    /srv/video (read-only)
```

Node.js `http2` là thư viện HTTP/2 tương đương nghttp2. Listener TCP hỗ trợ TLS 1.3, H2, HTTP range, MIME DASH/HLS, frontend và reverse proxy `/api/`. Listener UDP dùng picoquic commit `4685671759703c1ba20d7251c766e055b779341c`, ghim cố định trong Dockerfile.

H3 của picoquic dùng chung frontend đã build và `/srv/video`. Patch `picoquic-dash.patch` bổ sung `GET`, `HEAD`, byte range đơn (`206/416`), `Content-Length`, `Accept-Ranges`, `Content-Range`, CORS/cache header và MIME:

- `.mpd`: `application/dash+xml`
- `.m4s`: `video/iso.segment`
- `.mp4`: `video/mp4`
- `.m3u8`: `application/vnd.apple.mpegurl`
- `.ts`: `video/mp2t`

## Mode

| Mode | TCP 443 | UDP 443 | Multipath |
|---|---|---|---|
| `h2` | H2 | Tắt | Không |
| `quic` | H2 | H3 picoquic | Không |
| `mpquic` | H2 | H3 picoquic | Có, phải được client thương lượng |

Hai listener có cùng semantics cần cho data plane video: file, MIME, `GET`/`HEAD`, range và cache/CORS header. H2 còn reverse proxy frontend và `/api/`; h3zero chỉ là static data plane, không phải reverse proxy API.

`CUSTOM_ADVERTISE_H3=true` là mặc định để trình duyệt nâng từ H2 lên H3 giống Caddy/LiteSpeed. `Alt-Svc` có phạm vi toàn origin nên trình duyệt cũng có thể đưa `/api/` sang h3zero; đặt `false` nếu phiên thử nghiệm cần giữ chắc chắn frontend/API trên H2:

```bash
CUSTOM_MODE=quic CUSTOM_ADVERTISE_H3=false ./scripts/switch-proxy.sh custom --prod
```

`curl --http3-only` và picoquic client kết nối UDP trực tiếp nên không phụ thuộc `CUSTOM_ADVERTISE_H3`.

Chạy production:

```bash
CUSTOM_MODE=mpquic RUN_ID=wifi-cell-001 ./scripts/switch-proxy.sh custom --prod
```

Script tự lưu `CUSTOM_MODE` và `CUSTOM_ADVERTISE_H3` vào `.env`; không cần sửa `.env` thủ công cho các lần chạy sau. `RUN_ID` chỉ áp dụng cho lần chạy hiện tại; nếu bỏ trống, container tự sinh ID UTC mới.

Đổi mode custom rồi recreate:

```bash
CUSTOM_MODE=h2 ./scripts/switch-proxy.sh custom --prod
CUSTOM_MODE=quic ./scripts/switch-proxy.sh custom --prod
CUSTOM_MODE=mpquic ./scripts/switch-proxy.sh custom --prod
```

## Multipath thật

Server chỉ bật transport parameter multipath bằng `picoquicdemo -M`. Client phải có hai địa chỉ/interface và chủ động probe path mới:

```bash
picoquicdemo \
  -M \
  -A "<WIFI_IP>/<WIFI_IFINDEX>,<CELL_IP>/<CELL_IFINDEX>" \
  -n video.duxng.io.vn \
  -q ./client-qlog \
  video.duxng.io.vn 443 \
  "/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd"
```

`WIFI_IFINDEX` và `CELL_IFINDEX` lấy bằng `ip link`. Cả hai path cần route được tới server; chỉ có hai interface nhưng không tạo path từ client thì kết nối vẫn là single-path.

Chrome/dash.js dùng HTTP/3 chuẩn nhưng không cung cấp API tạo hai path theo multipath draft của picoquic. Vì vậy test MPQUIC hai path cần picoquic client hoặc client nghiên cứu tương thích; trình duyệt vẫn dùng được mode `quic` và phần H3 chuẩn của mode `mpquic`.

Picoquic hiện chưa có API công khai chọn MinRTT. `CUSTOM_SCHEDULER=default` dùng scheduler mặc định: phân phối qua path khả dụng, path bị congestion sẽ mất lượt. Cấu hình khác bị từ chối để tránh gắn nhãn scheduler sai. Tham khảo [trao đổi chính thức với maintainer](https://github.com/private-octopus/picoquic/discussions/2111).

## Log

```text
logs/custom-server/access.jsonl              H2 request/segment log
logs/custom-server/h3-access.jsonl           H3/MPQUIC segment + path snapshot
logs/custom-server/qlog/*.qlog               H3/MPQUIC qlog gốc
logs/custom-server/picoquic-performance.csv  tổng kết connection picoquic
```

H2 access log có schema:

```text
protocol, run_id, segment, download_time_ms, bytes,
rtt_ms, loss, cwnd_bytes, path_id, scheduler
```

`download_time_ms` ở đây là thời gian server xử lý và ghi response, không phải QoE download time tại client. H2 để `rtt_ms/loss/cwnd_bytes/path_id=null` vì HTTP/2 API không cung cấp TCP_INFO một cách portable.

H3 access log ghi một row cho mỗi path đang hoạt động khi segment hoàn tất, gồm segment bytes/thời gian response và snapshot RTT/loss/cwnd/path. `loss` và `path_bytes_sent_cumulative` là bộ đếm cộng dồn của path, không phải loss riêng của segment.

Qlog picoquic là nguồn chi tiết theo packet cho RTT, packet loss, cwnd và `path_id` của QUIC. Patch ghi `reference_time` bằng Unix UTC microseconds; event vẫn dùng relative microseconds. Chuẩn hóa qlog sang JSONL:

```bash
CUSTOM_MODE=mpquic RUN_ID=wifi-cell-001 node custom_server/normalize-qlog.mjs \
  logs/custom-server/qlog/<connection>.qlog \
  logs/custom-server/transport-wifi-cell-001.jsonl
```

QUIC có thể multiplex một segment qua nhiều packet/path nên transport row không tự gán một packet cho `segment`; trường này để `null` thay vì suy diễn sai. Dùng `run_id` và timestamp để ghép với QoE/QoS log phía client.

Normalizer ghi `timestamp_source=qlog-reference-utc`. Với qlog cũ có reference monotonic, nó dùng mtime của file để ước lượng và ghi rõ `timestamp_source=qlog-mtime-estimate`, tránh tạo timestamp năm 1970.

## Kiểm tra

```bash
curl --http2 -I https://video.duxng.io.vn/custom-server/info
curl --http2 -I https://video.duxng.io.vn/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
curl --http3-only -I https://video.duxng.io.vn/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
```

Lệnh HTTP/3 cần curl được build với HTTP/3. Certificate dùng chung với OpenLiteSpeed tại `openlitespeed_config/certs/server.crt` và `server.key`; nếu không có, custom server tạo self-signed certificate để chạy local.
