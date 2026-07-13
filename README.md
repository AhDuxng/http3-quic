# YouTube Clone HTTP/3 (QUIC)

React/Vite + Node.js/Express + Caddy. Dùng để phát DASH video và test HTTP/1.1, HTTP/2, HTTP/3.

## Cấu trúc

```text
http3-quic/
├── backend/              # Express API
├── frontend/             # React/Vite app
│   └── dist/             # build output, Caddy serve ở production/dev compose
├── caddy_config/
│   └── Caddyfile         # Caddy reverse proxy + HTTP/3
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

Repo không kèm thư mục `video/`. Caddy mount thư mục này vào `/srv/video`, frontend gọi video theo dạng:

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

Mặc định Caddy đọc `caddy_config/Caddyfile`. Nếu deploy domain khác, sửa dòng site trong file này:

```caddyfile
video.duxng.io.vn, localhost, 127.0.0.1 {
```

thành domain/IP cần dùng, ví dụ:

```caddyfile
video.example.com, localhost, 127.0.0.1 {
```

Sau đó chạy lại:

```bash
docker compose up -d --build
```

## Kiểm tra

```bash
docker compose ps
docker compose logs -f caddy
curl -I https://<domain>/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
```

## Dừng

```bash
docker compose down
```

## Lỗi nhanh

- Video 404: sai cấu trúc thư mục `video/`.
- Frontend/API không lên: `docker compose logs -f`.
