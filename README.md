# YouTube Clone HTTP/3 (QUIC)

## Giới thiệu dự án

Dự án YouTube Clone HTTP/3 là một ứng dụng web kết hợp hệ thống máy chủ cung cấp khả năng phát video trực tuyến (video streaming). Điểm cốt lõi của dự án là việc khai thác tối đa sức mạnh của giao thức HTTP/3 (QUIC) thay thế cho HTTP/1.1 hoặc HTTP/2 thông thường nhằm khắc phục các vấn đề về độ trễ, mất gói tin, bảo đảm tiến trình truyền tải đa phương tiện đạt mức tối ưu nhất. 

Ứng dụng được xây dựng theo chuẩn MPEG-DASH (Dynamic Adaptive Streaming over HTTP), hỗ trợ tính năng tự động thay đổi băng thông (Adaptive Bitrate). Gói giải pháp tổng thể sử dụng Caddy làm Reverse Proxy xử lý kết nối QUIC (UDP) đồng thời cấp phát chứng chỉ bảo mật TLS tự động, Node.js chịu trách nhiệm cung cấp API dữ liệu và cấu hình đường truyền máy chủ, cùng với ReactJS ở đầu cuối cho trải nghiệm người dùng hiện đại, sắc nét.

## Tính năng

- **Truyền phát video với HTTP/3 (QUIC)**: Giảm thiểu độ trễ kết nối, loại bỏ triệt để hiện tượng ngắt quãng truyền tải khi có gói tin thất lạc (Head-of-line blocking).
- **Phát luồng động thích ứng (MPEG-DASH)**: Hệ thống video hỗ trợ thay đổi độ phân giải và chất lượng video một cách năng động theo điều kiện mạng thực tế của người sử dụng.
- **Mô phỏng điều kiện mạng theo thời gian thực**: Backend tích hợp Endpoint kết nối với nhân hệ điều hành Linux (thông qua lệnh tc qdisc netem) cho phép người phát triển giới hạn mức băng thông, tăng thêm thời gian trễ mạng, hoặc tạo tỷ lệ rớt gói tin để kiểm tra khả năng phục hồi của luồng video ngay trên giao diện web.
- **Hệ thống theo dõi thông số kỹ thuật (Analytics Dashboard)**: Cung cấp đầy đủ các chỉ số trực tiếp về hiệu suất buffer video, kết xuất băng thông và tình trạng mạng qua giao diện Frontend.
- **Hỗ trợ đa định dạng mã hóa**: Cung cấp tùy chọn linh hoạt giữa chuẩn H.264 (tương thích mọi trình duyệt hiện hành) và chuẩn cao cấp HEVC dành riêng cho các quy trình thử nghiệm độ nén cao.

## Luồng hoạt động

1. **Khởi tạo kết nối**: Người dùng truy cập hệ thống bằng trình duyệt tương thích HTTP/3, gửi yêu cầu kết nối an toàn (HTTPS). 
2. **Tiếp nhận xử lý**: Máy chủ Caddy đóng vai trò cổng giao tiếp chính, nhận yêu cầu bằng giao thức QUIC qua cổng UDP 443 và HTTP/TCP truyền thống.
3. **Phân luồng dữ liệu**:
   - Các tệp tin phân mảnh video (DASH chunks), tệp tĩnh (Manifest .mpd) và giao diện Frontend được trả về trực tiếp bởi Caddy để đạt tốc độ tĩnh tối đa.
   - Các giao tiếp điều khiển linh hoạt được Caddy định tuyến về phía Backend (Node.js).
4. **Phản hồi điều hướng API**: Backend chịu trách nhiệm cung cấp thông tin metadata cho video hiện tại. Nếu nhận được lệnh yêu cầu thử nghiệm nghẽn mạng từ người dùng qua Frontend API, Backend sẽ thực thi trực tiếp các điều hướng mạng (Traffic Control) để thắt chặt băng thông hay phát sinh độ trễ lên hệ thống nội bộ máy chủ.
5. **Hiển thị đầu cuối**: Trên trình duyệt, hệ thống thư viện (như dash.js) liên tục cập nhật trạng thái kết nối mạng thực tế. Khi băng thông thực tế giảm, trình phát video phía Frontend sẽ chuyển dần phân mảnh video xuống chất lượng thấp hơn để hệ thống duy trì tính liên tục (không bị dừng đệm ngang chừng).

## Cấu trúc thư mục

```text
youtube-clone-quic/
├── backend/                  # Máy chủ Node.js (Express), API và kiểm soát mạng ảo Docker
├── caddy_config/             # Tập tin cấu hình Caddy Proxy, định tuyến và cấp TLS tự động
├── frontend/                 # Ứng dụng React (Vite), phát luồng DASH và biểu đồ theo dõi
├── media/                    # Kho dữ liệu video phân mảnh và manifest định dạng HEVC
├── media-2/                  # Kho dữ liệu video phân mảnh và manifest định dạng H.264
├── scripts/                  # Kịch bản dòng lệnh hỗ trợ tự động hóa cấu hình, mã hóa
├── docker-compose.yml        # Điểm tập trung cấu hình Docker môi trường Development
└── docker-compose.prod.yml   # Cấu hình Docker rút gọn cho môi trường Production
```

## Hướng dẫn cài đặt và chạy dự án

### Yêu cầu hệ thống ban đầu

- Cài đặt hệ sinh thái Docker và Docker Compose phiên bản mới trên máy.
- Môi trường thực thi Node.js (phiên bản 18+ khuyến nghị) dành cho xây dựng Frontend cơ bản.
- Lựa chọn một trình duyệt hỗ trợ công nghệ HTTP/3 sẵn có, tiêu biểu là Google Chrome hoặc Microsoft Edge.

### Chuẩn bị mã nguồn

Mở ứng dụng Terminal hoặc Command Prompt, sao chép hoặc di chuyển tới thư mục gốc dự án:

```bash
cd youtube-clone-quic
```

### Xây dựng sản phẩm đầu cuối (Frontend)

Cài đặt các gói phụ thuộc và tiền xử lý mã nguồn bản trình chiếu cho máy chủ cung cấp ảnh tĩnh:

```bash
cd frontend
npm install
npm run build
cd ..
```

### Triển khai hệ thống tại máy trạm cá nhân (Local Development)

Tiến hành cho phép công cụ Docker xây dựng và chạy toàn bộ hình ảnh môi trường bằng lệnh sau ngay tại thư mục gốc:

```bash
docker compose up -d --build
```

Máy chủ hệ thống đã sẵn sàng đi vào hoạt động ở trạng thái tách rời. Caddy, Node Backend và hệ thống tệp tin tĩnh đã được liên kết với nhau trong mạng lưới phân tích nội bộ.

### Kiểm tra hệ thống với chuẩn HTTP/3

1. Mở trình duyệt Web (dùng Chrome làm khuyến nghị cơ sở).
2. Nhập thanh địa chỉ là đường dẫn an toàn: `https://localhost/` hoặc `https://127.0.0.1/`
3. Vui lòng cho phép bỏ qua cảnh báo bảo mật nếu trình duyệt yêu cầu xác thực chứng chỉ môi trường lập trình cá nhân tự ký (Self-signed certificate) từ Caddy.
4. Bạn có thể sử dụng công cụ Developer Tools của trình duyệt mạng (Nhấn F12), chuyển sang thẻ Network. Dò tìm các yêu cầu nhận tập tin, kiểm tra bảng "Protocol", nếu ghi nhận định danh là chuẩn `h3`, đồng nghĩa bạn đã thiết lập giao thức tương tác gốc HTTP/3 thành công.

### Triển khai lên máy chủ thật (Production)

Phiên bản dành cho cấp độ sản phẩm chính quy được điều hướng cụ thể qua một bộ mã lệnh mới với địa chỉ tên miền đăng ký xác thực. Thao tác thực thi:

```bash
# Thiết lập biến môi trường chứa tên miền đăng ký sẵn
export DOMAIN="your-domain.com"

# Tiến hành cho xây dựng và khởi động môi trường chuyên dụng
docker compose -f docker-compose.prod.yml up -d --build
```

Hệ thống sẽ dựa vào Caddy để kết nối tới Let's Encrypt, khởi tạo tự động các chứng chỉ tin cậy của máy chủ. Bạn truy cập qua địa chỉ bảo mật thực tế của riêng mình để sử dụng cơ chế truyền hình tối ưu mới nhất từ hệ thống.

## Hướng dẫn thêm video và phân mảnh (DASH)

Để có thể phát một video mới trên hệ thống với công nghệ phân mảnh DASH và tương thích liên tục nhiều mức độ phân giải (Adaptive Bitrate), bạn cần làm việc bằng công cụ giải mã. Hệ thống đã chuẩn bị sẵn mã lệnh chạy FFmpeg tiên tiến thông qua Docker, giúp tiến trình xử lý trở nên gọn gàng mà không yêu cầu bạn cài đặt FFmpeg trực tiếp lên máy cá nhân.

### Bước 1: Chuẩn bị video gốc

- Khởi đầu bằng việc thả một video có định dạng MP4 truyền thống của bạn (ví dụ mang tên: `input.mp4`) trực tiếp vào bên trong thư mục `media/` hoặc `media-2/` của dự án dự phòng sẵn.
- Nên ưu tiên đặt tại `media-2` đối với video phổ thông mã hóa bằng H.264 (Dễ thao tác trên mọi màn hình).

### Bước 2: Chạy bộ tiền xử lý và cắt mạch video

Đứng tại thư mục thiết lập của dự án và khởi lệnh bằng chương trình Docker như sau. Tập lệnh thực hiện tách dải hình ảnh, phân xuất kích thước, đồng thời tạo ra hai loại hình chuẩn độ mượt riêng biệt là góc 360p (500k bitrate) và toàn ảnh 720p (1000k bitrate). Mọi kết quả được liên kết logic với hệ thống tệp tin trung tâm `stream.mpd`:

```bash
docker run -v $(pwd)/media:/data jrottenberg/ffmpeg:4.4-alpine \
  -i /data/input.mp4 \
  -map 0:v -b:v:0 500k -s:v:0 640x360 -profile:v:0 main \
  -map 0:v -b:v:1 1000k -s:v:1 1280x720 -profile:v:1 main \
  -map 0:a? -c:a aac -b:a 128k \
  -use_template 1 -use_timeline 1 -seg_duration 4 \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  -f dash /data/stream.mpd
```

Một số lưu ý cho quản trị viên tùy biến:
- Từ khóa `input.mp4` ở dòng số 2 là tên cơ sở của dữ liệu thô. Hãy chỉnh thành gốc video của riêng bạn.
- Khi điều tiết video tại thư mục `media-2/`, cần đổi đầu nối ở dòng đầu tiên thành `$(pwd)/media-2:/data`.
- Gốc `seg_duration 4` định nghĩa khoảng cắt của mỗi đoạn cấu hình nhỏ dài 4 giây. Đoạn phân mảnh ngắn giúp màn hình xem nhận định mức thay đổi băng thông (từ đường mạng thắt cổ chai) và phản ứng thay đổi cấp phân giải một cách nhanh chóng.

### Bước 3: Cấu hình hệ thống Frontend đón dữ liệu

Sau khi dòng lệnh trả về sự đồng thuận, trong kho chứa thư mục media của bạn sẽ lấp đầy dần các lớp phân mảnh nhỏ gọn và kèm ở cuối là một tệp `stream.mpd`. 

Để kích hoạt đoạn phim vừa làm xong:
1. Mở tập tin chứa thành phần React nằm ở `frontend/src/App.jsx`.
2. Di chuyển đến khối định nghĩa nguồn khai báo `VIDEO_SOURCES`.
3. Chỉ đường dẫn của đối tượng `manifestUrl` về phía `stream.mpd` vừa khởi tạo. Nếu thay đổi của bạn nằm ở thư mục hai thì tham chiếu tương tự mẫu là `/media-2/stream.mpd`. Trình chiếu DASH sau đó sẽ tự động bắt lấy mạch kết nối khi giao diện được tải lại, phô diễn liền mạch những phân lớp video theo đúng kiến trúc tối tân của hệ thống.
