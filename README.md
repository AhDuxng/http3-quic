# YouTube Clone HTTP/3 (QUIC)

React/Vite + Node.js/Express + OpenLiteSpeed/LSQUIC. Dùng để phát DASH video và test HTTP/1.1, HTTP/2, HTTP/3.

## Cấu trúc

```text
http3-quic/
├── backend/              # Express API
├── frontend/             # React/Vite app
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
docker compose up -d --build
```

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

## Kiểm tra

```bash
docker compose ps
docker compose logs -f openlitespeed
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
