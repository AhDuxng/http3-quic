# NGIS Stream

**Adaptive video streaming over HTTP/2 and HTTP/3 (QUIC), built for reproducible protocol experiments.**

NGIS Stream is a web-based MPEG-DASH video streaming platform. The same content and the same player can be served by two production-grade web servers with different HTTP/3 stacks, under controlled network conditions, while the client records detailed QoS and QoE metrics:

- **Two interchangeable reverse proxies:** [Caddy](https://caddyserver.com/) (HTTP/3 through quic-go) and [OpenLiteSpeed](https://openlitespeed.org/) (HTTP/3 through LSQUIC). Both serve HTTP/1.1, HTTP/2 and HTTP/3 on the same ports.
- **DASH player** based on [dash.js](https://github.com/Dash-Industry-Forum/dash.js) 5, with automatic ABR or a fixed representation, 1, 2, 4 or 6-second segments, and one, two or three concurrent players.
- **Network emulation** with Linux `tc`/`netem` (rate limit, delay with jitter, random loss), applied from the UI to the server's egress traffic.
- **In-browser measurement** of per-segment QoS (download time, throughput, TTFB, connection setup, failures) and time-sampled QoE (startup delay, bitrate, quality switches, stalls, rebuffering ratio, FPS, frozen frames). Results export as CSV.
- **Server-side transport traces:** scripts that record cwnd, RTT and loss as qlog for TCP (HTTP/2) and for both QUIC stacks (HTTP/3).

---

## Table of contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Requirements](#requirements)
4. [Quick start (local)](#quick-start-local)
5. [Preparing the video dataset](#preparing-the-video-dataset)
6. [TLS certificates and HTTP/3 in the browser](#tls-certificates-and-http3-in-the-browser)
7. [Switching between Caddy and OpenLiteSpeed](#switching-between-caddy-and-openlitespeed)
8. [Running an experiment](#running-an-experiment)
9. [Collected data](#collected-data)
10. [Server-side transport capture](#server-side-transport-capture)
11. [Production deployment](#production-deployment)
12. [Configuration reference](#configuration-reference)
13. [Development without Docker](#development-without-docker)
14. [Verification](#verification)
15. [Troubleshooting](#troubleshooting)
16. [Acknowledgements](#acknowledgements)

---

## Architecture

```text
                       Browser (dash.js player, QoS/QoE metrics)
                                       │
                       HTTPS: TCP 443 (H1/H2), UDP 443 (H3)
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│  Reverse proxy container: caddy  OR  openlitespeed  (one active at a time)   │
│                                                                              │
│   /video/*  ──► static DASH files (./video mounted read-only at /srv/video)  │
│   /api/*    ──► 127.0.0.1:3000  ──►  backend (Node.js / Express)            │
│   /*        ──► frontend:80     ──►  frontend container (nginx, React build)│
│                                                                              │
│   The backend shares this container's network namespace, so the tc/netem   │
│   qdisc it installs on eth0 shapes the server-to-client traffic.            │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Service | Image | Role |
|---|---|---|
| `caddy` | `caddy:2.11.4-alpine` + iproute2 | Reverse proxy, TLS, HTTP/1.1, HTTP/2, HTTP/3 (quic-go) |
| `openlitespeed` | `litespeedtech/openlitespeed:1.8.5-lsphp85` | Reverse proxy, TLS, HTTP/1.1, HTTP/2, HTTP/3 (LSQUIC) |
| `backend` | `node:20-alpine` + iproute2 | `POST /api/network-scenario` (tc/netem), `GET /api/protocol-info`, `GET /health` |
| `frontend` | `node:20-alpine` build → `nginx:1.27-alpine` | React 19 / Vite / Tailwind single-page application |

Both proxies serve media with `Cache-Control: no-store` (each run downloads every segment from the server) and `Timing-Allow-Origin: *` (the browser exposes detailed Resource Timing data).

## Repository layout

```text
ngis-stream/
├── backend/                    Express API (network emulation, health check)
│   └── src/{app,config,constants,controllers,routes}/
├── frontend/                   React/Vite client
│   └── src/features/video/     DASH player, metrics, panels, CSV export
├── caddy_config/               Caddy image and Caddyfiles (local / production)
├── openlitespeed_config/       OpenLiteSpeed image, server and vhost config, entrypoint
│   └── certs/                  TLS certificate for OpenLiteSpeed (not committed)
├── scripts/
│   ├── switch-proxy.sh         Switch the active proxy (Caddy ↔ OpenLiteSpeed)
│   ├── setup-certs.sh          Create a local certificate (mkcert or OpenSSL)
│   ├── capture-tcp-cwnd.py     Server-side TCP cwnd/RTT capture → qlog
│   └── capture-lsquic-qlog.py  LSQUIC debug log → qlog
├── docs/
│   ├── METRICS.md              Definitions of the network QoS and video QoE metrics
│   └── server-side-capture.md  Step-by-step transport capture procedure
├── video/                      DASH dataset (downloaded separately, not committed)
├── docker-compose.yml          Local stack
├── docker-compose.prod.yml     Production stack
└── .env.example                Environment template
```

## Requirements

| Component | Version / notes |
|---|---|
| Docker Engine + Docker Compose v2 | Compose must support `profiles` (Compose 2.x) |
| Host OS | Linux is recommended for experiments. Docker Desktop on macOS or Windows works for development; `tc`/`netem` then runs inside the Docker VM. |
| Free ports | `80/tcp`, `443/tcp`, `443/udp` |
| Disk space | About 44 GB for the full dataset (3 videos × 4 segment durations); about 4 GB for a single video at a single segment duration |
| Browser | Chrome or Chromium (recommended, supports the protocol-forcing flags below), Firefox or Edge |
| Optional | `mkcert` (locally trusted certificate), `wget` (dataset download), `python3` ≥ 3.8 (server-side capture), a curl build with HTTP/3 |

## Quick start (local)

```bash
# 1. Clone the repository
git clone https://github.com/AhDuxng/ngis-stream.git
cd ngis-stream

# 2. Create the environment file
cp .env.example .env

# 3. Download at least one video (see the next section for all videos)
mkdir -p video/BigBuckBunny/4sec
wget -r -np -nH --cut-dirs=4 -A "*.mpd,*.m4s,*.mp4" \
  -P video/BigBuckBunny/4sec \
  http://ftp.itec.aau.at/datasets/DASHDataset2014/BigBuckBunny/4sec/

# 4. (Recommended) Create a locally trusted certificate for HTTP/3
./scripts/setup-certs.sh localhost

# 5. Build and start the stack (OpenLiteSpeed by default)
docker compose up -d --build

# 6. Check that every container is running
docker compose ps
```

Open <https://localhost/>. Select a view mode, then a segment duration (choose **4 s** if you downloaded only the 4-second set above), and press play.

Without step 4, the OpenLiteSpeed container generates a self-signed certificate on first start. HTTPS works after you accept the browser warning, but browsers do not use HTTP/3 with an untrusted certificate (see [TLS certificates](#tls-certificates-and-http3-in-the-browser)).

To stop the stack:

```bash
docker compose down
```

## Preparing the video dataset

NGIS Stream uses the [ITEC DASH Dataset 2014](http://ftp.itec.aau.at/datasets/DASHDataset2014/) (Lederer et al., Alpen-Adria-Universität Klagenfurt). The repository does not include video files. The UI expects these manifests:

```text
video/<Video>/<N>sec/<Video>_<N>s_simple_2014_05_09.mpd
```

with `<Video>` ∈ {`BigBuckBunny`, `OfForestAndMen`, `TearsOfSteel`} and `<N>` ∈ {1, 2, 4, 6}. Each `*_simple_*.mpd` references bitrate subdirectories (for example `bunny_378355bps/`), and every subdirectory must contain its initialization segment `*_init.mp4` and its media segments `*.m4s`.

Download the complete dataset used by the UI (about 44 GB):

```bash
for video in BigBuckBunny OfForestAndMen TearsOfSteel; do
  for seconds in 1 2 4 6; do
    mkdir -p "video/${video}/${seconds}sec"
    wget -r -np -nH --cut-dirs=4 -A "*.mpd,*.m4s,*.mp4" \
      -P "video/${video}/${seconds}sec" \
      "http://ftp.itec.aau.at/datasets/DASHDataset2014/${video}/${seconds}sec/"
  done
done
```

Check the result:

```bash
ls video/*/*sec/*_simple_2014_05_09.mpd     # 12 manifests for the full dataset
```

To prepare the dataset on one machine and copy it to the server:

```bash
rsync -avz --progress --partial ./video/ <user>@<server-ip>:/path/to/ngis-stream/video/
```

## TLS certificates and HTTP/3 in the browser

Browsers only use HTTP/3 when the certificate is trusted. They discover HTTP/3 from the `Alt-Svc` header of an earlier HTTPS response, so the first requests of a session may still use HTTP/2.

| Proxy | Local certificate | Production certificate |
|---|---|---|
| OpenLiteSpeed | `openlitespeed_config/certs/server.{crt,key}`. Use `./scripts/setup-certs.sh` to create it; otherwise the container generates a self-signed one. | Copy a real certificate chain and key to the same two files. |
| Caddy | Issued by Caddy's internal CA (`tls internal`) | Obtained automatically from Let's Encrypt for `DOMAIN` |

**Option A: mkcert (recommended).** `mkcert -install` adds a local CA to the system trust store, and `./scripts/setup-certs.sh localhost` creates a certificate signed by that CA. Recreate OpenLiteSpeed to load it:

```bash
./scripts/setup-certs.sh localhost
docker compose up -d --force-recreate openlitespeed
```

**Option B: trust a specific certificate in Chrome only.** Chrome can accept a self-signed certificate over QUIC when its SPKI hash is passed on the command line:

```bash
SPKI=$(openssl x509 -pubkey -noout -in openlitespeed_config/certs/server.crt \
  | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64)
google-chrome --user-data-dir=/tmp/ngis-chrome --origin-to-force-quic-on=localhost:443 \
  --ignore-certificate-errors-spki-list="$SPKI" https://localhost/
```

For local Caddy, trust Caddy's root CA instead. It is stored in the `caddy_data` volume:

```bash
docker cp caddy_server:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
# Import caddy-root.crt into the system or browser trust store.
```

## Switching between Caddy and OpenLiteSpeed

Only one proxy runs at a time because both bind ports 80 and 443. `scripts/switch-proxy.sh` stops the backend and the inactive proxy, starts the target proxy, recreates the backend inside the target's network namespace (so network emulation keeps working) and saves the choice to `COMPOSE_PROFILES` in `.env`.

```bash
./scripts/switch-proxy.sh caddy          # Caddy / quic-go
./scripts/switch-proxy.sh lsquic         # OpenLiteSpeed / LSQUIC (alias: openlitespeed, ols)
./scripts/switch-proxy.sh status         # show the running containers

./scripts/switch-proxy.sh caddy --prod   # same commands with docker-compose.prod.yml
./scripts/switch-proxy.sh lsquic --prod
```

The service is unavailable for a few seconds while the containers are recreated.

## Running an experiment

The procedure below produces one measurement run. Repeat it for every combination of factors in your design (server × protocol × network profile × segment duration × video), with several repetitions each.

1. **Select the server.** Run `./scripts/switch-proxy.sh caddy` or `./scripts/switch-proxy.sh lsquic` and wait until `docker compose ps` shows the containers as running (the backend reports `healthy`).

2. **Start a clean browser and force the protocol.** Use a new profile for every run, so that no connection, cache entry or `Alt-Svc` record survives from an earlier run.

   ```bash
   # HTTP/2 only
   google-chrome --user-data-dir=/tmp/ngis-$RANDOM --disable-quic https://<domain>/

   # HTTP/3
   google-chrome --user-data-dir=/tmp/ngis-$RANDOM --enable-quic \
     --origin-to-force-quic-on=<domain>:443 https://<domain>/
   ```

   On macOS, use `open -na "Google Chrome" --args <flags> https://<domain>/`. Confirm the protocol in DevTools → Network (enable the **Protocol** column: `h2` or `h3`). The badge in the page header shows the protocol detected from the Resource Timing API.

3. **Configure the session in the UI.**
   - **View mode:** 1, 2 or 3 concurrent players. Use 1 for single-stream measurements and 2 or 3 to study competing streams on a shared connection.
   - **Segment duration:** 1, 2, 4 or 6 seconds.
   - **Quality:** keep *Auto* (dash.js ABR) or pin one representation from the quality menu on the video.

4. **Apply a network profile** in the *Network Simulation* panel. The backend installs a `netem` qdisc on the server's `eth0`:

   | Profile | Rate | Delay | Loss |
   |---|---|---|---|
   | Real Network (No TC) | not limited | 0 ms | 0 % |
   | Fiber Optic | not limited | 2 ms | 0 % |
   | Mobile 4G High | 20 Mbit/s | 40 ms | 0.1 % |
   | Mobile 4G Limited | 5 Mbit/s | 100 ms | 0.5 % |
   | QUIC Migration Test | 2.5 Mbit/s | 20 ms | 0 % |
   | 3G / UMTS Legacy | 1.5 Mbit/s | 200 ms | 1 % |
   | Slow 3G + Lag | 500 kbit/s | 400 ms | 2 % |
   | 2G / EDGE | 250 kbit/s | 800 ms | 5 % |
   | Custom | user-defined | user-defined | user-defined |

   Delay is applied with a normally distributed jitter equal to one quarter of the delay. Shaping applies to server egress only (the downlink seen by the client). The profile stays active until another profile is applied; select **Real Network (No TC)** to remove it.

   The resulting command can be inspected on the host:

   ```bash
   docker exec node_backend tc qdisc show dev eth0
   ```

5. **Set the number of replays** in the *Auto Replay* panel (0 means unlimited). The player restarts the stream automatically and labels every record with its replay number.

6. **Play.** Use the play button on the video or the global *Play* button in the header for all players. Wait until the *Measurement Complete* screen appears.

7. **Export the data** from the *Console Logs* panel of each player:
   - **CSV** downloads three files: `ngis-stream-logs-*.csv`, `ngis-stream-qos-*.csv` and `ngis-stream-qoe-*.csv`;
   - **TXT** downloads a readable summary report, `ngis-stream-report-*.txt`.

8. **Reset.** Apply *Real Network (No TC)*, close the browser and start the next run with a new profile.

Recommendations for valid comparisons:

- Keep the client, the server host, the network path and the dataset identical across the compared configurations, and change one factor at a time.
- Randomize or interleave the order of configurations to spread slow drifts in network conditions.
- Do not run server-side LSQUIC qlog captures and performance measurements in the same run: debug logging changes the server's throughput.
- Check the `Protocol` column of the exported data. Chrome can fall back from HTTP/3 to HTTP/2 when a QUIC handshake fails.

## Collected data

All timestamps are UTC (ISO 8601). Each row carries the stream name, the segment duration and the replay number.

| File | Granularity | Main fields |
|---|---|---|
| `ngis-stream-qos-*.csv` | One row per media request | status and HTTP code, URL, protocol, representation and quality index, bytes loaded, encoded body and transfer size, download time, download speed, encoded payload rate, TTFB, download-time variation, connection setup / DNS / connect / TLS handshake time |
| `ngis-stream-qoe-*.csv` | One row per sampling interval (1 s) | rendered bitrate and resolution, time-weighted average bitrate, FPS, dropped frames, freeze events, startup delay, stall count and duration, rebuffering ratio, quality switches (total, up, down), playback position, buffer level, fragment failure/abandon rate |
| `ngis-stream-logs-*.csv` | One row per player event | level (`INFO`, `WARN`, `ERRO`, `NET`, `SYS`), message, protocol, network type, ABR mode, active network profile |
| `ngis-stream-report-*.txt` | One per export | Summary of the session statistics and the filtered event log |

The definition, formula and limitations of every metric are documented in [docs/METRICS.md](docs/METRICS.md). Note in particular that browser-side TTFB is an application-level latency rather than the transport RTT, and that request failure rate is not packet loss.

## Server-side transport capture

For transport-level analysis, NGIS Stream records the server's congestion window, RTT and losses as qlog:

| Configuration | Tool |
|---|---|
| HTTP/2 on Caddy or OpenLiteSpeed | `sudo python3 -u scripts/capture-tcp-cwnd.py <dir>` (kernel `tcp:tcp_probe` tracepoint) |
| HTTP/3 on Caddy | quic-go qlog, enabled with `CADDY_QLOGDIR=/qlog` and `CADDY_QLOG_HOST_DIR=<dir>` |
| HTTP/3 on OpenLiteSpeed | `LSQUIC_QLOG_CAPTURE=true` and `scripts/capture-lsquic-qlog.py <dir>` |

The complete procedure, output format and limitations are described in [docs/server-side-capture.md](docs/server-side-capture.md).

## Production deployment

1. Point a DNS record for your domain to the server and open `80/tcp`, `443/tcp` and `443/udp` in the firewall and in any cloud security group.
2. Configure `.env`:

   ```dotenv
   DOMAIN=video.example.com
   CORS_ORIGIN=https://video.example.com
   COMPOSE_PROFILES=openlitespeed
   ```

3. Place the dataset in `video/` (see [Preparing the video dataset](#preparing-the-video-dataset)).
4. **OpenLiteSpeed** reads its certificate from two files:

   ```bash
   cp /etc/letsencrypt/live/video.example.com/fullchain.pem openlitespeed_config/certs/server.crt
   cp /etc/letsencrypt/live/video.example.com/privkey.pem   openlitespeed_config/certs/server.key
   chmod 600 openlitespeed_config/certs/server.key
   docker compose -f docker-compose.prod.yml up -d --build --force-recreate
   ```

   After every certificate renewal, copy the files again and recreate the `openlitespeed` service. WebAdmin is disabled; the whole configuration lives in this repository.

5. **Caddy** obtains and renews its certificate automatically and stores it in the `caddy_data` volume:

   ```bash
   ./scripts/switch-proxy.sh caddy --prod
   ```

   When you switch back to OpenLiteSpeed, it still needs its own certificate files from step 4.

## Configuration reference

Variables read by Docker Compose from `.env` or from the shell:

| Variable | Default | Description |
|---|---|---|
| `COMPOSE_PROFILES` | `openlitespeed` | Active proxy: `openlitespeed` or `caddy` |
| `PROXY_SERVICE` | value of `COMPOSE_PROFILES` | Service whose network namespace the backend joins. Set it together with `COMPOSE_PROFILES` when you run `docker compose` by hand. |
| `DOMAIN` | `localhost` | Served host name; used for certificates. Required by `docker-compose.prod.yml`. |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Host ports published by the proxy (HTTPS on TCP and UDP) |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Backend bind address inside the proxy namespace |
| `CORS_ORIGIN` | `*` | Allowed origins for the backend API (comma-separated) |
| `LSQUIC_QLOG_CAPTURE` | `false` | `true` switches the OpenLiteSpeed error log to `DEBUG` for LSQUIC qlog capture |
| `CADDY_QLOGDIR` | empty | Set to `/qlog` to make quic-go write qlog files |
| `CADDY_QLOG_HOST_DIR` | `./logs/caddy-qlog` | Host directory mounted at `/qlog` in the Caddy container |

## Development without Docker

Frontend with hot reload, proxied to a running stack:

```bash
cd frontend
npm ci
VITE_PROXY_TARGET=https://localhost npm run dev     # http://localhost:5173
npm run lint
npm run build
```

Backend on its own (serves `/api` and, for convenience, `/video` from the repository's `video/` directory):

```bash
cd backend
npm ci
PORT=3000 CORS_ORIGIN='*' npm start
```

Network emulation requires Linux, the `tc` binary and the `CAP_NET_ADMIN` capability. The backend expects an interface named `eth0`.

## Verification

```bash
docker compose ps
docker compose logs -f openlitespeed          # or: caddy, backend, frontend

curl -k  https://localhost/api/protocol-info
docker exec node_backend wget -qO- http://127.0.0.1:3000/health
curl -kI https://localhost/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
curl -kI --http3-only https://localhost/video/BigBuckBunny/4sec/BigBuckBunny_4s_simple_2014_05_09.mpd
```

The manifest must return `Content-Type: application/dash+xml`, and `.m4s` segments `video/iso.segment`. The last command needs a curl build with HTTP/3 support.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `404` for the manifest or segments | Wrong `video/` layout. Check `video/<Video>/<N>sec/<Video>_<N>s_simple_2014_05_09.mpd`. |
| `Player error: ..._init.mp4 is not available` | The bitrate subdirectory is missing its `*_init.mp4`. Download again with `-A "*.mpd,*.m4s,*.mp4"`. |
| The browser never uses `h3` | Untrusted certificate, `443/udp` blocked by a firewall, or `Alt-Svc` not yet seen. Use a trusted certificate and force QUIC with `--origin-to-force-quic-on`. |
| HTTP/3 to OpenLiteSpeed fails intermittently | Known LSQUIC 4.4.1 issue with a ClientHello split into many out-of-order CRYPTO frames (`cannot stash more CRYPTO frames`). Chrome falls back to HTTP/2; filter results by protocol. |
| Applying a network profile returns an error | The backend lacks `tc` or `CAP_NET_ADMIN`, or is not attached to the proxy namespace. Run `./scripts/switch-proxy.sh <proxy>` and check `docker compose logs backend`. |
| The backend does not start after a manual `docker compose up` | `PROXY_SERVICE` does not match the running proxy. Use `switch-proxy.sh`, or set `COMPOSE_PROFILES` and `PROXY_SERVICE` to the same value. |
| Wrong MIME type | `.mpd` must be `application/dash+xml` and `.m4s` must be `video/iso.segment`. Rebuild the OpenLiteSpeed image, which adds both types. |
| UI or API unreachable | `docker compose logs -f` for the failing service; check that ports 80 and 443 are not used by another process. |

## Acknowledgements

- Video content: ITEC DASH Dataset 2014 — S. Lederer, C. Müller and C. Timmerer, "Dynamic Adaptive Streaming over HTTP Dataset", ACM MMSys 2012. The films remain the property of their authors (Big Buck Bunny and Tears of Steel: Blender Foundation); see the dataset page for the license of each film.
- Player: [dash.js](https://github.com/Dash-Industry-Forum/dash.js) by the DASH Industry Forum.
- HTTP/3 stacks: [quic-go](https://github.com/quic-go/quic-go) (via Caddy) and [LSQUIC](https://github.com/litespeedtech/lsquic) (via OpenLiteSpeed).
