# Hướng Dẫn Cài Đặt Dự Án YouTube Clone HTTP/3 (QUIC)

Tài liệu này hướng dẫn cài đặt và chạy dự án `youtube-clone-quic` trên máy cá nhân hoặc máy chủ. Dự án gồm:

- `frontend`: giao diện React/Vite phát video và hiển thị thông số streaming.
- `backend`: API Node.js/Express, cung cấp metadata video và điều khiển mô phỏng mạng.
- `caddy_config`: Caddy reverse proxy, phục vụ frontend/media và bật HTTP/3 (QUIC).
- `media`, `media-2`: dữ liệu video DASH/MP4 dùng để phát thử.

## 1. Yêu cầu hệ thống

Cài sẵn các công cụ sau:

- Docker Desktop hoặc Docker Engine.
- Docker Compose plugin, kiểm tra bằng lệnh `docker compose version`.
- Node.js 20+ và npm, cần khi chạy chế độ phát triển hoặc build production.
- Trình duyệt hỗ trợ HTTP/3 như Chrome, Edge hoặc Firefox bản mới.

Nếu chạy trên server, cần mở các cổng:

- TCP `80`: HTTP, thường dùng để redirect sang HTTPS.
- TCP `443`: HTTPS/HTTP/2.
- UDP `443`: HTTP/3/QUIC.

## 2. Chuẩn bị mã nguồn

Vào thư mục gốc của dự án:

```bash
cd youtube-clone-quic
```

Kiểm tra các thư mục video đã có dữ liệu:

```bash
ls media
ls media-2
```

Trên Windows PowerShell có thể dùng:

```powershell
Get-ChildItem media
Get-ChildItem media-2
```

## 3. Cấu hình domain hoặc localhost

File cấu hình local hiện nằm ở `caddy_config/Caddyfile`. Trong file này, site đang được khai báo bằng domain:

```caddyfile
video.duxng.io.vn {
```

Nếu chạy bằng domain đó và domain đã trỏ về máy/server hiện tại, có thể giữ nguyên.

Nếu chạy trên máy cá nhân, đổi dòng trên thành:

```caddyfile
localhost {
```

Khi dùng chứng chỉ local/self-signed, trình duyệt có thể hiện cảnh báo bảo mật. Đây là hành vi bình thường trong môi trường phát triển; chọn tiếp tục truy cập để kiểm thử.

Nếu triển khai production bằng domain thật, không cần sửa `Caddyfile`; dùng `docker-compose.prod.yml` và `caddy_config/Caddyfile.prod` theo phần production bên dưới.

## 4. Chạy bằng Docker Compose

Đây là cách khuyến nghị để kiểm thử đầy đủ Caddy, backend, frontend, media server và HTTP/3.

Từ thư mục gốc dự án, chạy:

```bash
docker compose up -d --build
```

Kiểm tra trạng thái container:

```bash
docker compose ps
```

Xem log khi cần:

```bash
docker compose logs -f caddy
docker compose logs -f backend
docker compose logs -f frontend
```

Truy cập ứng dụng:

- Nếu dùng `localhost` trong `caddy_config/Caddyfile`: mở `https://localhost/`.
- Nếu giữ domain hiện tại: mở `https://video.duxng.io.vn/`.
- Nếu đổi sang domain/IP khác: mở `https://<domain-hoac-ip-cua-ban>/`.

Backend API chạy phía sau Caddy, có thể kiểm tra nhanh:

```bash
curl -k https://localhost/api/video-info
curl -k https://localhost/api/media2-videos
```

Nếu không dùng `localhost`, thay URL bằng domain/IP đang cấu hình.

## 5. Kiểm tra HTTP/3 (QUIC)

Sau khi mở ứng dụng trong trình duyệt:

1. Mở Developer Tools.
2. Vào tab Network.
3. Bật cột Protocol nếu chưa thấy.
4. Reload trang.
5. Nếu các request hiển thị `h3`, HTTP/3 đã hoạt động.

Nếu chưa thấy `h3`, kiểm tra lại:

- Cổng UDP `443` đã được mở.
- Trình duyệt hỗ trợ HTTP/3.
- Website đang chạy qua HTTPS.
- Domain/chứng chỉ TLS hợp lệ hoặc đã được trình duyệt chấp nhận trong môi trường local.

## 6. Dừng hệ thống

Dừng container nhưng giữ volume:

```bash
docker compose down
```

Dừng và xóa cả volume Caddy:

```bash
docker compose down -v
```

Chỉ dùng `-v` khi muốn xóa dữ liệu volume như cache/certificate do Caddy tạo.

## 7. Chạy chế độ phát triển frontend/backend

Chế độ này phù hợp khi sửa code nhanh. Lưu ý: cách chạy này không kiểm thử HTTP/3 đầy đủ vì bỏ qua Caddy.

Chạy backend:

```bash
cd backend
npm install
npm start
```

Backend mặc định lắng nghe tại `http://localhost:3000`.

Mở terminal khác để chạy frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend Vite mặc định chạy tại:

```text
http://localhost:5173
```

Nếu muốn Vite proxy trực tiếp đến backend local thay vì Caddy, tạo file `frontend/.env` với nội dung:

```env
VITE_PROXY_TARGET=http://localhost:3000
```

Sau đó khởi động lại `npm run dev`.

## 8. Build frontend thủ công

Khi cần build frontend:

```bash
cd frontend
npm install
npm run build
```

Kết quả build nằm trong:

```text
frontend/dist
```

## 9. Triển khai production

Production dùng `docker-compose.prod.yml` và `caddy_config/Caddyfile.prod`. Cách này phù hợp khi có domain thật trỏ về server.

Chuẩn bị file `.env` ở thư mục gốc:

```env
DOMAIN=video.example.com
CORS_ORIGIN=https://video.example.com
```

Thay `video.example.com` bằng domain thật của bạn.

Build frontend trước:

```bash
cd frontend
npm install
npm run build
cd ..
```

Khởi động production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Kiểm tra container:

```bash
docker compose -f docker-compose.prod.yml ps
```

Xem log Caddy để kiểm tra cấp chứng chỉ TLS:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Khi production chạy đúng, truy cập:

```text
https://video.example.com/
```

## 10. Lỗi thường gặp

### Cổng 80 hoặc 443 đã bị chiếm

Dừng dịch vụ đang dùng cổng đó, ví dụ nginx, Apache, IIS hoặc một container khác. Sau đó chạy lại:

```bash
docker compose up -d --build
```

### Không thấy HTTP/3

Kiểm tra UDP `443` đã mở trên firewall/router/cloud provider. HTTP/3 dùng UDP, nên chỉ mở TCP `443` là chưa đủ.

### Trình duyệt báo chứng chỉ không tin cậy

Với môi trường local, có thể tiếp tục truy cập sau cảnh báo. Với production, cần dùng domain thật để Caddy tự cấp chứng chỉ Let's Encrypt.

### Video không phát

Kiểm tra các file media:

- `media/stream.mpd` phải tồn tại nếu phát DASH.
- `media/` phải có các file segment `.m4s`.
- `media-2/` phải có các thư mục hoặc file video MP4 tương ứng.

Sau khi thêm hoặc đổi video, khởi động lại container nếu cần:

```bash
docker compose restart caddy backend
```

### API mô phỏng mạng không hoạt động

Tính năng mô phỏng mạng dùng lệnh `tc` và quyền `NET_ADMIN`, nên nên chạy bằng Docker Compose. Khi chạy backend trực tiếp bằng `npm start`, tính năng này có thể không hoạt động đầy đủ trên Windows/macOS.

## 11. Các lệnh nhanh

```bash
# Chạy development đầy đủ qua Docker
docker compose up -d --build

# Xem trạng thái
docker compose ps

# Xem log
docker compose logs -f

# Dừng
docker compose down

# Build frontend
cd frontend
npm install
npm run build
```
