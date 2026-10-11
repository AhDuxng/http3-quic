#!/usr/bin/env python3
"""Capture server-side TCP cwnd/RTT for HTTP/1.1 and HTTP/2 and write qlog files.

The kernel tracepoint tcp:tcp_probe fires on every ACK the server receives and
reports snd_cwnd, ssthresh, srtt and snd_nxt/snd_una. tcp:tcp_retransmit_skb
marks retransmissions. Both run on the host kernel, so this works for Caddy,
OpenLiteSpeed and the custom server without changing the containers. MSS is
sampled with `ss` inside each container network namespace to convert cwnd
from segments to bytes.

Capture (needs root, stop with Ctrl+C):
  sudo python3 -u scripts/capture-tcp-cwnd.py DIR
Rebuild qlog from a saved capture:
  python3 scripts/capture-tcp-cwnd.py --from-dir DIR DIR
"""

import argparse
import json
import re
import subprocess
import sys
import threading
import time
from collections import Counter, defaultdict
from pathlib import Path


TRACEFS = Path("/sys/kernel/tracing")
INSTANCE = "tcp_cwnd_capture"
PROBE_LOG = "tcp-probe.log"
MSS_LOG = "tcp-mss.log"
META = "capture-meta.json"
TRACE_LINE = re.compile(r"\s(\d+\.\d+): (tcp_probe|tcp_retransmit_skb): (.*)$")
FIELD = re.compile(r"(\w+)=(\S+)")
SS_SOCKET = re.compile(r"^\d+\s+\d+\s+(\S+)\s+(\S+)")
SS_MSS = re.compile(r"\bmss:(\d+)")
SSTHRESH_INFINITE = 0x7FFFFFFF


def write(path, value):
    path.write_text(value)


def setup_trace(port):
    instance = TRACEFS / "instances" / INSTANCE
    if not instance.exists():
        instance.mkdir()
    write(instance / "tracing_on", "0")
    write(instance / "trace_clock", "mono")
    write(instance / "buffer_size_kb", "16384")
    write(instance / "trace", "")
    for event in ("tcp_probe", "tcp_retransmit_skb"):
        write(instance / "events" / "tcp" / event / "filter", f"sport == {port}")
        write(instance / "events" / "tcp" / event / "enable", "1")
    write(instance / "tracing_on", "1")
    return instance


def teardown_trace(instance):
    try:
        write(instance / "tracing_on", "0")
        for event in ("tcp_probe", "tcp_retransmit_skb"):
            write(instance / "events" / "tcp" / event / "enable", "0")
        instance.rmdir()
    except OSError as error:
        print(f"Warning: could not remove trace instance {instance}: {error}", file=sys.stderr)


def namespace_pids():
    pids = ["1"]
    try:
        ids = subprocess.run(["docker", "ps", "-q"], capture_output=True, text=True, timeout=5).stdout.split()
        if ids:
            pids += subprocess.run(["docker", "inspect", "-f", "{{.State.Pid}}", *ids],
                                   capture_output=True, text=True, timeout=5).stdout.split()
    except (OSError, subprocess.SubprocessError):
        pass
    return pids


def sample_mss(path, port, stop):
    with path.open("a", encoding="utf-8") as output:
        while not stop.wait(0.5):
            for pid in namespace_pids():
                try:
                    lines = subprocess.run(
                        ["nsenter", "-t", pid, "-n", "ss", "-tinH", "state", "established",
                         f"( sport = :{port} )"],
                        capture_output=True, text=True, timeout=5).stdout.splitlines()
                except (OSError, subprocess.SubprocessError):
                    continue
                for socket_line, info_line in zip(lines[::2], lines[1::2]):
                    socket = SS_SOCKET.match(socket_line)
                    mss = SS_MSS.search(info_line)
                    if socket and mss:
                        output.write(f"{socket.group(2)} {mss.group(1)}\n")
            output.flush()


def capture(output, port):
    output.mkdir(parents=True, exist_ok=True)
    instance = setup_trace(port)
    offset_us = (time.time_ns() - time.monotonic_ns()) // 1000
    write(output / META, json.dumps({"mono_to_unix_offset_us": offset_us, "port": port}))
    stop = threading.Event()
    sampler = threading.Thread(target=sample_mss, args=(output / MSS_LOG, port, stop), daemon=True)
    sampler.start()
    kept = 0
    try:
        with (instance / "trace_pipe").open(encoding="utf-8", errors="replace") as pipe, \
                (output / PROBE_LOG).open("a", encoding="utf-8") as raw:
            for line in pipe:
                raw.write(line)
                kept += 1
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        teardown_trace(instance)
    print(f"Saved {kept} tracepoint lines to {output / PROBE_LOG}", file=sys.stderr)


class Connection:
    def __init__(self, client):
        self.client = client
        self.events = []
        self.metrics = {}


def convert(source, output):
    meta = json.loads((source / META).read_text())
    offset_us = meta["mono_to_unix_offset_us"]
    mss_by_client = {}
    if (source / MSS_LOG).exists():
        for line in (source / MSS_LOG).read_text().splitlines():
            client, mss = line.rsplit(" ", 1)
            mss_by_client[client.strip("[]")] = int(mss)

    connections = {}
    socket_cookie = {}
    counts = Counter()
    with (source / PROBE_LOG).open(encoding="utf-8", errors="replace") as lines:
        for line in lines:
            match = TRACE_LINE.search(line)
            if not match:
                continue
            time_us = round(float(match.group(1)) * 1_000_000) + offset_us
            fields = dict(FIELD.findall(match.group(3)))
            if match.group(2) == "tcp_probe":
                cookie = fields["sock_cookie"]
                socket_cookie[fields["skaddr"]] = cookie
                conn = connections.get(cookie)
                if conn is None:
                    conn = connections[cookie] = Connection(fields["dest"])
                mss = mss_by_client.get(fields["dest"].strip("[]"))
                cwnd = int(fields["snd_cwnd"])
                ssthresh = int(fields["ssthresh"])
                values = {
                    "cwnd_segments": cwnd,
                    "ssthresh_segments": None if ssthresh >= SSTHRESH_INFINITE else ssthresh,
                    "smoothed_rtt": int(fields["srtt"]),
                    "bytes_in_flight": (int(fields["snd_nxt"], 16) - int(fields["snd_una"], 16)) % 2**32,
                }
                if mss:
                    values["mss"] = mss
                    values["cwnd"] = cwnd * mss
                changed = {key: value for key, value in values.items() if conn.metrics.get(key) != value}
                if changed:
                    conn.metrics.update(changed)
                    conn.events.append([time_us, 0, "recovery", "metrics_updated", changed])
                counts["probe"] += 1
            else:
                cookie = socket_cookie.get(fields["skaddr"])
                if cookie in connections:
                    connections[cookie].events.append(
                        [time_us, 0, "recovery", "packet_lost", {"trigger": "tcp_retransmit_skb"}])
                    counts["retransmit"] += 1

    output.mkdir(parents=True, exist_ok=True)
    without_mss = 0
    for cookie, conn in connections.items():
        if not conn.events:
            continue
        without_mss += "mss" not in conn.metrics
        reference = conn.events[0][0]
        name = re.sub(r"[^0-9A-Za-z]+", "_", conn.client).strip("_")
        trace = {
            "qlog_version": "draft-00",
            "title": f"TCP server connection {conn.client}",
            "traces": [{
                "vantage_point": {"name": "linux-tcp", "type": "server"},
                "title": f"TCP server connection {conn.client}",
                "description": "Kernel tcp:tcp_probe and tcp:tcp_retransmit_skb; cwnd in bytes = snd_cwnd * mss",
                "event_fields": ["relative_time", "path_id", "category", "event", "data"],
                "configuration": {"time_units": "us"},
                "common_fields": {"protocol_type": "TCP", "reference_time": str(reference),
                                  "client": conn.client, "sock_cookie": cookie},
                "events": [[event[0] - reference, *event[1:]] for event in conn.events],
            }],
        }
        with (output / f"{name}_{cookie}_tcp_server.qlog").open("w", encoding="utf-8") as file:
            json.dump(trace, file, separators=(",", ":"))

    written = sum(1 for conn in connections.values() if conn.events)
    print(f"Wrote {written} TCP qlog files to {output}: probe={counts['probe']}, "
          f"retransmit={counts['retransmit']}", file=sys.stderr)
    if without_mss:
        print(f"Warning: {without_mss} connections have no MSS sample; only cwnd_segments is available",
              file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, help="output directory")
    parser.add_argument("--from-dir", type=Path, help="rebuild qlog from a saved capture directory")
    parser.add_argument("--port", type=int, default=443, help="server TCP port, default 443")
    args = parser.parse_args()
    if args.from_dir:
        convert(args.from_dir, args.output)
    else:
        capture(args.output, args.port)
        convert(args.output, args.output)


if __name__ == "__main__":
    main()
