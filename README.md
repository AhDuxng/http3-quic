# YouTube Clone HTTP/3 (QUIC)

React/Vite + Node.js/Express, có thể chuyển giữa Caddy, OpenLiteSpeed/LSQUIC và custom picoquic server. Dùng để phát DASH video và test HTTP/1.1, HTTP/2, HTTP/3/MPQUIC.

## Cấu trúc

```text
http3-quic/
├── backend/              # Express API
├── frontend/             # React/Vite app
├── caddy_config/         # Caddy local/production + HTTP/3
├── custom_server/        # H2 + picoquic H3/MPQUIC
├── openlitespeed_config/
│   ├── Dockerfile        # image OpenLiteSpeed 1.8.5
│   ├── httpd_config.conf # HTTP/HTTPS listeners + HTTP/3
│   └── vhosts/App/       # static DASH + reverse proxy frontend/API
├── video/                # tự tải/upload, không nằm trong repo
│   └── BigBuckBunny/
│       └── 4sec/
│           ├── BigBuckBunny_4s_simple_2014_05_09.mpd
│           └── *.m4s
├── docker-compose.yml
└── README.md
```

## Yêu cầu

- Docker + Docker Compose
- Mở port `80/tcp`, `443/tcp`, `443/udp`
- Domain trỏ về server nếu deploy public

## Chuẩn bị video

Repo không kèm thư mục `video/`. OpenLiteSpeed mount thư mục này vào `/srv/video`, frontend gọi video theo dạng:

```text
/video/<VideoName>/<segment>sec/<VideoName>_<segment>s_simple_2014_05_09.mpd
```

Ví dụ file cần có:

```text
video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
video/BigBuckBunny/4sec/bunny_378355bps/BigBuckBunny_4s_init.mp4
video/BigBuckBunny/4sec/bunny_378355bps/BigBuckBunny_4s1.m4s
```

File `*_simple_*.mpd` sẽ trỏ tới các thư mục bitrate con như `bunny_378355bps/`. Mỗi thư mục bitrate cần có cả file init `*_init.mp4` và các segment `*.m4s`; nếu thiếu `*_init.mp4`, dash.js sẽ báo lỗi kiểu `Player error: ..._init.mp4 is not available`.

Tải nhanh:

```bash
mkdir -p video/BigBuckBunny/4sec
wget -r -np -nH --cut-dirs=4 -A "*.mpd,*.m4s,*.mp4" \
  -P video/BigBuckBunny/4sec \
  http://ftp.itec.aau.at/datasets/DASHDataset2014/BigBuckBunny/4sec/
```

Nếu tải video ở máy khác rồi đẩy lên server:

```bash
rsync -avz --progress --partial ./video/ <user>@<server-ip>:/path/to/http3-quic/video/
```

Các video app đang dùng:

```text
BigBuckBunny: 1sec, 2sec, 4sec, 6sec
OfForestAndMen: 1sec, 2sec, 4sec, 6sec
TearsOfSteel: 1sec, 2sec, 4sec, 6sec
```

## Chạy bằng Docker

```bash
git clone <repo-url>
cd http3-quic
cp .env.example .env
docker compose up -d --build
```

Mặc định dùng OpenLiteSpeed/LSQUIC. Biến `COMPOSE_PROFILES` trong `.env` xác định proxy đang dùng: `openlitespeed` hoặc `caddy`.

Lần chạy đầu, container tự tạo self-signed certificate cho giá trị `DOMAIN`. HTTPS sẽ chạy ngay nhưng trình duyệt có thể cảnh báo certificate. Để tạo certificate local được tin cậy, cài `mkcert` rồi chạy:

```bash
./scripts/setup-certs.sh localhost
docker compose up -d --force-recreate openlitespeed
```

Nếu `mkcert` không có, script sẽ tạo self-signed certificate bằng OpenSSL.

## Production

Đặt domain trong `.env`:

```dotenv
DOMAIN=video.example.com
CORS_ORIGIN=https://video.example.com
COMPOSE_PROFILES=openlitespeed
```

OpenLiteSpeed đọc certificate thật từ hai file sau:

```text
openlitespeed_config/certs/server.crt  # full certificate chain
openlitespeed_config/certs/server.key  # private key
```

Ví dụ với certificate đã được Let's Encrypt cấp:

```bash
cp /etc/letsencrypt/live/video.example.com/fullchain.pem openlitespeed_config/certs/server.crt
cp /etc/letsencrypt/live/video.example.com/privkey.pem openlitespeed_config/certs/server.key
chmod 600 openlitespeed_config/certs/server.key
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

Sau mỗi lần certificate được gia hạn, cập nhật hai file trên và recreate service `openlitespeed`. WebAdmin không được public; toàn bộ cấu hình nằm trong repo.

### Chuyển đổi server

Script chuyển đổi sẽ dừng backend và proxy cũ trước, sau đó bật proxy mới và recreate backend trong cùng network namespace. Cách này giữ nguyên chức năng mô phỏng mạng bằng `tc/netem` và tránh tranh chấp cổng `80/443`.

Local:

```bash
./scripts/switch-proxy.sh caddy
./scripts/switch-proxy.sh lsquic
CUSTOM_MODE=mpquic RUN_ID=local-001 ./scripts/switch-proxy.sh custom
./scripts/switch-proxy.sh status
```

Production:

```bash
./scripts/switch-proxy.sh caddy --prod
./scripts/switch-proxy.sh lsquic --prod
CUSTOM_MODE=mpquic RUN_ID=wifi-cell-001 ./scripts/switch-proxy.sh custom --prod
```

Khi dùng Caddy production, Caddy tự cấp và gia hạn certificate trong volume `caddy_data`. Khi chuyển về OpenLiteSpeed, certificate thật vẫn phải có tại:

```text
openlitespeed_config/certs/server.crt
openlitespeed_config/certs/server.key
```

Caddy, OpenLiteSpeed và custom server đều public `80/tcp`, `443/tcp`, `443/udp`; mode custom `h2` không mở listener UDP. Quá trình chuyển có một khoảng gián đoạn ngắn khi container cũ dừng và container mới khởi động.

Custom server hỗ trợ `h2`, `quic`, `mpquic`, dùng chung certificate/domain và mount video. Chi tiết client multipath, scheduler và log thí nghiệm xem tại [custom_server/README.md](custom_server/README.md).

### Thu qlog LSQUIC theo từng lượt thử

Module qlog có sẵn của LSQUIC chỉ phát `PACKET_RX` và vài event handshake, không có packet gửi, cwnd hay loss. Vì vậy script dựng qlog từ debug log của LSQUIC: module `event` (TX/RX packet, size, frame, ACK range), `sendctl` (RTT, cwnd, bytes in flight, packet lost) và `qlog` (thời điểm nhận chính xác `pi_received`). Chế độ thu bật debug cho OpenLiteSpeed và mặc định tắt. Trên server, sau khi cập nhật source, chạy tại thư mục project:

```bash
sudo install -d -o "$(id -u)" -g "$(id -g)" -m 0755 \
  /data/experiment-logs /data/experiment-logs/qlog-lsquic-trial-001
LSQUIC_QLOG_CAPTURE=true COMPOSE_PROFILES=openlitespeed PROXY_SERVICE=openlitespeed \
  docker compose -f docker-compose.prod.yml up -d --build --no-deps --force-recreate openlitespeed
docker exec -i openlitespeed_server tail -n 0 -F /usr/local/lsws/logs/error.log | \
  python3 -u scripts/capture-lsquic-qlog.py /data/experiment-logs/qlog-lsquic-trial-001
```

Giữ lệnh `tail | python3` chạy trong suốt lượt thử. Tạo kết nối H3 mới sau khi bắt đầu thu. Nhấn `Ctrl+C` để dừng thu, rồi tắt debug của OpenLiteSpeed:

```bash
LSQUIC_QLOG_CAPTURE=false COMPOSE_PROFILES=openlitespeed PROXY_SERVICE=openlitespeed \
  docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate openlitespeed
find /data/experiment-logs/qlog-lsquic-trial-001 -name '*.qlog' -type f -ls
```

Script lưu các dòng log QUIC gốc vào `lsquic-debug.log` trong thư mục thu, rồi khi dừng sẽ ghi một file `<cid>_server.qlog` cho mỗi connection. Định dạng giống qlog của picoquic (`draft-00`, thời gian tương đối tính bằng µs, `reference_time` là Unix UTC µs), nên đọc được bằng qvis và `custom_server/normalize-qlog.mjs`. Có thể dựng lại qlog từ log đã lưu:

```bash
python3 scripts/capture-lsquic-qlog.py --from-log \
  /data/experiment-logs/qlog-lsquic-trial-001/lsquic-debug.log /data/experiment-logs/qlog-lsquic-trial-001
```

Độ chính xác và giới hạn:

- Thời điểm gửi lấy từ timestamp của dòng log OpenLiteSpeed, ghi ngay sau khi gói được gửi xuống socket. Thời điểm nhận lấy từ `pi_received` (`CLOCK_MONOTONIC`), quy về đồng hồ của log bằng độ lệch nhỏ nhất giữa hai nguồn.
- Timestamp log là giờ địa phương của container. Nếu container không chạy UTC, truyền thêm `--utc-offset +07:00`.
- Mỗi packet chỉ có danh sách loại frame, không có số lượng hay thứ tự frame, vì LSQUIC chỉ ghi như vậy. ACK nhận được có đủ range.
- `cwnd` và `bytes_in_flight` lấy từ lần kiểm tra quyền gửi gần nhất của `sendctl`, không phụ thuộc thuật toán congestion control (Cubic, BBR hay adaptive).
- Ghi debug cho từng packet tốn CPU và I/O, nên lượt thu qlog có thể làm thay đổi throughput. Chạy lượt thu qlog riêng, không gộp với lượt đo hiệu năng.
- Script in ra số event mỗi loại và cảnh báo khi thiếu module `event`/`sendctl` ở mức debug hoặc khi timestamp log không đủ 6 chữ số thập phân. Lần đầu chạy, kiểm tra các cảnh báo này trước khi dùng dữ liệu.
- Trình duyệt có thể dùng lại connection H3 đã mở trước khi thu. Khi đó qlog thiếu handshake và packet đầu tiên có số lớn. Đóng hẳn trình duyệt hoặc dùng profile mới trước mỗi lượt.

## Kiểm tra

```bash
docker compose ps
docker compose logs -f openlitespeed
docker compose logs -f caddy
curl -kI https://<domain>/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
curl --http3-only -I https://<domain>/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
```

Lệnh cuối cần bản `curl` được build với HTTP/3 và certificate được tin cậy. Có thể kiểm tra trong Chrome DevTools bằng cách bật cột `Protocol`; request HTTP/3 sẽ hiển thị `h3`.

## Dừng

```bash
docker compose down
```

## Lỗi nhanh

- Video 404: sai cấu trúc thư mục `video/`.
- Không có HTTP/3: kiểm tra certificate có được tin cậy và firewall đã mở `443/udp`.
- Sai MIME: `.mpd` phải trả `application/dash+xml`, `.m4s` phải trả `video/iso.segment`.
- Frontend/API không lên: `docker compose logs -f`.
