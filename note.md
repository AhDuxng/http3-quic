Chạy lệnh FFmpeg để tạo DASH: Lệnh dưới đây sẽ tạo ra 2 mức chất lượng (Scale 320p và 640p) để test tính năng chuyển đổi bitrate.
docker run -v $(pwd)/media:/data jrottenberg/ffmpeg:4.4-alpine \
  -i /data/input.mp4 \
  -map 0:v -b:v:0 500k -s:v:0 640x360 -profile:v:0 main \
  -map 0:v -b:v:1 1000k -s:v:1 1280x720 -profile:v:1 main \
  -map 0:a? -c:a aac -b:a 128k \
  -use_template 1 -use_timeline 1 -seg_duration 4 \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  -f dash /data/stream.mpd

---

## Chay local co HTTP/3 (h3) tren Chrome

Dieu kien: HTTP/3 trong browser can HTTPS. Du an nay dung Caddy + QUIC, nen hay chay bang Docker Compose va mo `https://localhost/`.

### Build frontend

- `cd frontend`
- `npm install`
- `npm run build`

### Run docker

- Tai root project:
- `docker compose up -d --build`

Mo Chrome: `https://localhost/`

Goi y kiem tra HTTP/3:
- Mo DevTools -> Network -> chon request -> xem field `Protocol` (neu hien `h3` la OK)

## Deploy (domain that)

Dung file `docker-compose.prod.yml` + `caddy_config/Caddyfile.prod`.

Vi du:
- Set env `DOMAIN=your-domain.com`
- `docker compose -f docker-compose.prod.yml up -d --build`
