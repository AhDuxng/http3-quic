# Server-Side Transport Capture

This guide explains how to record server-side congestion window (cwnd), RTT and loss data for each of the four configurations studied with NGIS Stream:

| Configuration | cwnd source | Output files |
|---|---|---|
| Caddy HTTP/2, OpenLiteSpeed HTTP/2 | Linux kernel tracepoint `tcp:tcp_probe` (one sample per ACK) | `*_tcp_server.qlog` |
| Caddy HTTP/3 | Native qlog of quic-go | `*_server.sqlog` |
| OpenLiteSpeed HTTP/3 | LSQUIC debug log rebuilt into qlog | `*_server.qlog` and `lsquic-debug.log` |

Run only one capture at a time. Every command below assumes the production stack (`docker-compose.prod.yml`). For the local stack, drop `-f docker-compose.prod.yml` and the `--prod` flag.

## Requirements

- A Linux server running the NGIS Stream stack (see the main [README](../README.md)).
- `python3` 3.8 or newer on the server. The scripts use only the standard library.
- Root access for the TCP capture. It reads `/sys/kernel/tracing` and uses `nsenter` and `ss` (package `iproute2`).
- A kernel that provides the `tcp:tcp_probe` and `tcp:tcp_retransmit_skb` tracepoints (Linux 4.16 or newer).
- Several GB of free disk space. One 45-minute LSQUIC debug capture produced about 1.8 GB of logs.

## Session setup

Open two shells on the server in the project directory: **shell A** runs the capture and **shell B** switches the server configuration.

Run this in both shells:

```bash
cd /path/to/ngis-stream
export BASE=/data/experiment-logs      # any directory with enough free space
export TRIAL=001                       # increment for each trial: 001, 002, ...
sudo install -d -o "$(id -u)" -g "$(id -g)" -m 0755 "$BASE"
df -h / "$BASE"
```

## Client setup

Fully quit Chrome before each trial and start it with a fresh profile, so that it cannot reuse a connection opened before the capture started. Replace `<domain>` with your `DOMAIN`.

```bash
# Force HTTP/2
open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-$RANDOM --disable-quic \
  https://<domain>/

# Force HTTP/3
open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-$RANDOM --enable-quic \
  --origin-to-force-quic-on=<domain>:443 https://<domain>/
```

These commands are for macOS. On Linux, run `google-chrome --user-data-dir=... <flags> https://<domain>/` instead.

Open DevTools → Network, enable the **Protocol** column and confirm that media requests show `h2` or `h3`. At the end of the trial, close Chrome first and then stop the capture.

---

## 1. Caddy HTTP/2

**Shell B:** switch to Caddy (skip this if Caddy is already active; check with `grep ^COMPOSE_PROFILES .env`).

```bash
./scripts/switch-proxy.sh caddy --prod
```

**Shell A:** start the capture and leave it running.

```bash
sudo python3 -u scripts/capture-tcp-cwnd.py $BASE/caddy-h2-$TRIAL
```

**Client:** start Chrome with HTTP/2 forced, play the video, then close Chrome.

**Shell A:** press `Ctrl+C` and wait for the line `Wrote ... TCP qlog files`. Then:

```bash
sudo chown -R "$(id -u):$(id -g)" $BASE/caddy-h2-$TRIAL
ls $BASE/caddy-h2-$TRIAL
```

## 2. Caddy HTTP/3

**Shell B:** switch to Caddy if needed, then enable quic-go qlog output.

```bash
./scripts/switch-proxy.sh caddy --prod
mkdir -p $BASE/caddy-h3-$TRIAL
CADDY_QLOGDIR=/qlog CADDY_QLOG_HOST_DIR=$BASE/caddy-h3-$TRIAL \
  COMPOSE_PROFILES=caddy PROXY_SERVICE=caddy \
  docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
docker exec caddy_server printenv QLOGDIR      # must print /qlog
```

**Client:** start Chrome with HTTP/3 forced, play the video, then close Chrome. Wait about 30 seconds so that quic-go can finish writing its files.

**Shell B:** disable qlog output.

```bash
COMPOSE_PROFILES=caddy PROXY_SERVICE=caddy \
  docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
docker exec caddy_server printenv QLOGDIR      # must print nothing
sudo chown -R "$(id -u):$(id -g)" $BASE/caddy-h3-$TRIAL
ls $BASE/caddy-h3-$TRIAL
```

## 3. OpenLiteSpeed HTTP/2

**Shell B:** switch to OpenLiteSpeed (skip this if it is already active).

```bash
./scripts/switch-proxy.sh lsquic --prod
```

**Shell A:** start the capture and leave it running.

```bash
sudo python3 -u scripts/capture-tcp-cwnd.py $BASE/lsquic-h2-$TRIAL
```

**Client:** start Chrome with HTTP/2 forced, play the video, then close Chrome.

**Shell A:** press `Ctrl+C` and wait for the line `Wrote ... TCP qlog files`. Then:

```bash
sudo chown -R "$(id -u):$(id -g)" $BASE/lsquic-h2-$TRIAL
ls $BASE/lsquic-h2-$TRIAL
```

## 4. OpenLiteSpeed HTTP/3

The built-in qlog module of LSQUIC only emits `PACKET_RX` and a few handshake events. It records no sent packets, cwnd or loss. `scripts/capture-lsquic-qlog.py` therefore rebuilds a qlog trace from three LSQUIC debug modules:

- `event`: TX/RX packet number, type, size, frames and ACK ranges;
- `sendctl`: RTT samples, cwnd, bytes in flight and lost packets;
- `qlog`: the exact receive time (`pi_received`), used to correct RX timestamps.

Setting `LSQUIC_QLOG_CAPTURE=true` makes the container entrypoint switch the OpenLiteSpeed error log to `DEBUG`. The option is off by default.

**Shell B:** switch to OpenLiteSpeed if needed, then enable debug logging.

```bash
./scripts/switch-proxy.sh lsquic --prod
mkdir -p $BASE/lsquic-h3-$TRIAL
LSQUIC_QLOG_CAPTURE=true COMPOSE_PROFILES=openlitespeed PROXY_SERVICE=openlitespeed \
  docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate openlitespeed
docker exec openlitespeed_server grep -A1 '^errorlog' /usr/local/lsws/conf/httpd_config.conf
# expected: logLevel DEBUG
```

**Shell A:** start the capture and leave it running.

```bash
docker exec -i openlitespeed_server tail -n 0 -F /usr/local/lsws/logs/error.log | \
  python3 -u scripts/capture-lsquic-qlog.py $BASE/lsquic-h3-$TRIAL
```

**Client:** start Chrome with HTTP/3 forced, play the video, then close Chrome. While the capture runs, check the free disk space from shell B from time to time with `df -h /`.

**Shell A:** press `Ctrl+C` and wait for the line `Wrote ... qlog files`.

**Shell B:** disable debug logging immediately.

```bash
COMPOSE_PROFILES=openlitespeed PROXY_SERVICE=openlitespeed \
  docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate openlitespeed
docker exec openlitespeed_server grep -A1 '^errorlog' /usr/local/lsws/conf/httpd_config.conf
# expected: logLevel WARN
ls $BASE/lsquic-h3-$TRIAL
```

The script stores the raw QUIC log lines in `lsquic-debug.log` and, when stopped, writes one `<cid>_server.qlog` file per connection. If `Ctrl+C` does not print the `Wrote` line, do not rebuild the qlog on a server with little RAM. Copy `lsquic-debug.log` to another machine and rebuild it there (see below).

---

## Retrieving and rebuilding results

From your workstation, inside the project directory:

```bash
rsync -avz --progress <user>@<server-ip>:/data/experiment-logs/ ./experiment-logs/
```

`experiment-logs/` is listed in `.gitignore`.

Rebuild qlog files from the raw captures when needed:

```bash
python3 scripts/capture-lsquic-qlog.py --from-log \
  experiment-logs/lsquic-h3-001/lsquic-debug.log experiment-logs/lsquic-h3-001
python3 scripts/capture-tcp-cwnd.py --from-dir \
  experiment-logs/caddy-h2-001 experiment-logs/caddy-h2-001
```

If the OpenLiteSpeed container does not run in UTC, pass its offset to the LSQUIC script, for example `--utc-offset +07:00`.

## Quick check with curl

A curl build with HTTP/3 support (for example Homebrew curl on macOS) can fetch one segment over each protocol without a browser:

```bash
CURL=/opt/homebrew/opt/curl/bin/curl
URL=https://<domain>/video/BigBuckBunny/6sec/bunny_2395950bps/BigBuckBunny_6s78.m4s
$CURL -s --http2      -o /dev/null -w "%{http_version} ttfb=%{time_starttransfer}s total=%{time_total}s\n" $URL
$CURL -s --http3-only -o /dev/null -w "%{http_version} ttfb=%{time_starttransfer}s total=%{time_total}s\n" $URL
```

## Output format

- TCP and LSQUIC captures are written as qlog `draft-00` JSON: relative time in microseconds, `reference_time` in Unix UTC microseconds, and events `packet_sent`, `packet_received`, `metrics_updated` and `packet_lost`. They open in [qvis](https://qvis.quictools.info/).
- Caddy writes `.sqlog` files in JSON-SEQ format (qlog 0.3). qvis opens them directly.
- **Units:** cwnd is always in bytes; TCP traces also include `cwnd_segments` and `mss`. RTT is in **milliseconds** in Caddy `.sqlog` files and in **microseconds** in LSQUIC and TCP traces.

## Accuracy and limitations

- **Debug overhead.** Per-packet debug logging in OpenLiteSpeed costs CPU and I/O and can change throughput. Run qlog trials for LSQUIC separately and do not use them as performance measurements.
- **LSQUIC timestamps.** Send times come from the OpenLiteSpeed log line timestamp, written right after the packet is handed to the socket. Receive times come from `pi_received` (`CLOCK_MONOTONIC`), aligned to the log clock with the smallest observed offset between the two sources.
- **LSQUIC frames.** Each sent packet carries only the list of frame types, without frame counts or order, because that is all LSQUIC logs. Received ACK frames include all ranges.
- **LSQUIC cwnd.** `cwnd` and `bytes_in_flight` come from the most recent send-permission check in `sendctl`, independent of the congestion controller (Cubic, BBR or adaptive).
- **Log rotation.** In capture mode the container deletes rotated `error.log.*` files after about one minute so that the disk does not fill up. The capture script keeps its own copy.
- **Script warnings.** Both scripts print event counts per type. The LSQUIC script warns when the `event` or `sendctl` module is not logging at debug level or when log timestamps have fewer than six fractional digits. Check these warnings on the first run.
- **Connection reuse.** If the browser reuses an HTTP/3 connection opened before the capture, the trace has no handshake and the first packet number is large. Always use a fresh browser profile.
- **TCP `packet_lost`** marks kernel retransmissions and may include spurious retransmissions.
- **Congestion control.** LSQUIC selected BBRv1 (adaptive mode, srtt > 1.5 ms) in our runs; Caddy HTTP/3 uses the quic-go default; TCP uses the kernel default (`cubic` on most distributions).
- **OpenLiteSpeed HTTP/3 handshake failures.** LSQUIC 4.4.1 closes the connection when a ClientHello is split into more than ten CRYPTO frames that arrive out of order (log message: `cannot stash more CRYPTO frames`). In our trials, 7 of 15 curl attempts and 11 of 38 Chrome handshakes failed. Chrome may then fall back to HTTP/2, so always filter requests by the protocol column when analysing results.
