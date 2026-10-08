#!/usr/bin/env python3
"""Build server-side qlog files from OpenLiteSpeed/LSQUIC debug log lines.

LSQUIC's own qlog module only emits PACKET_RX and a few handshake events, so
this script rebuilds the trace from LSQUIC debug modules instead:
  event   -> TX/RX packet number, type, size, frames, ACK ranges
  sendctl -> RTT samples, cwnd, bytes in flight, lost packets
  qlog    -> exact receive time (pi_received) used to correct RX timestamps

Capture (raw lines are kept in DIR/lsquic-debug.log, qlog is built on exit):
  docker exec -i openlitespeed_server tail -n 0 -F \
    /usr/local/lsws/logs/error.log | python3 -u scripts/capture-lsquic-qlog.py DIR
Rebuild qlog from a saved log:
  python3 scripts/capture-lsquic-qlog.py --from-log DIR/lsquic-debug.log DIR
"""

import argparse
import calendar
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


RAW_LOG = "lsquic-debug.log"
TIMESTAMP = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?")
LINE = re.compile(r"\[QUIC:([0-9A-Fa-f]+)\]\s+([\w-]+): (.*)$")
UTC_OFFSET = re.compile(r"^([+-])(\d{2}):?(\d{2})$")

TX = re.compile(r"TX packet #(\d+) (\S+) \(([^)]*)\), size (\d+)(?:.*?path: (\d+))?")
RX = re.compile(r"RX packet #(\d+) (\S+), size: (\d+)(?:.*?path: (\d+))?")
RX_ACK = re.compile(r"RX ACK frame: (.*)")
ACK_RANGE = re.compile(r"\[(\d+)-(\d+)\]")
RX_STREAM = re.compile(r"RX STREAM frame: stream (\d+); offset (\d+); size (\d+)")
RTT = re.compile(r"packno (\d+); rtt: (\d+); delta: (\d+); new srtt: (\d+)")
CAN_SEND = re.compile(r"b_out: \d+ = \((\d+) \+ \d+\); b_retx: \d+; cwnd: (\d+)")
LOST = re.compile(r"lost (?:retransmittable|unretransmittable|MTU probe in) packet #(\d+)")
LOSS_TRIGGER = re.compile(r"loss by (FACK|early retransmit|sent time) detected.*packet #(\d+)")
TIMEOUT = re.compile(r"^(\S+) timeout, mode (\S+)")
TIMEOUT_DONE = re.compile(r"^consider \S+ packets lost")
CC_SELECT = re.compile(r"srtt is (\d+) usec.*select (\S+) congestion controller")

PACKET_TYPES = {
    "SHORT": "1RTT", "INIT": "initial", "HSK": "handshake", "0-RTT": "0RTT",
    "RETRY": "retry", "VERNEG": "version_negotiation",
}
LOSS_TRIGGERS = {
    "FACK": "reordering_threshold", "early retransmit": "early_retransmit",
    "sent time": "time_threshold",
}


def parse_utc_offset(text):
    match = UTC_OFFSET.match(text)
    if not match:
        raise argparse.ArgumentTypeError("use +HH:MM, for example +07:00")
    sign = -1 if match.group(1) == "-" else 1
    return sign * (int(match.group(2)) * 3600 + int(match.group(3)) * 60) * 1_000_000


def wall_time_us(line, utc_offset_us):
    match = TIMESTAMP.match(line)
    if not match:
        return None, 0
    fields = [int(value) for value in match.groups()[:6]]
    fraction = match.group(7) or ""
    seconds = calendar.timegm((*fields, 0, 0, 0))
    micros = int((fraction + "000000")[:6])
    return seconds * 1_000_000 + micros - utc_offset_us, len(fraction)


def frame_list(text):
    return [{"frame_type": name.lower()} for name in text.split()]


class Connection:
    def __init__(self):
        self.events = []
        self.sent = {}
        self.last_rx = None
        self.metrics = {}
        self.loss_triggers = {}
        self.timeout = None

    def add(self, time_us, path_id, category, name, data):
        event = [time_us, path_id, category, name, data]
        self.events.append(event)
        return event

    def update_metrics(self, time_us, **values):
        changed = {key: value for key, value in values.items() if self.metrics.get(key) != value}
        if changed:
            self.metrics.update(changed)
            self.add(time_us, 0, "recovery", "metrics_updated", changed)


def convert(log_path, output, utc_offset_us):
    connections = defaultdict(Connection)
    rx_mono = {}
    counts = Counter()
    precision = Counter()

    with open(log_path, encoding="utf-8", errors="replace") as lines:
        for line in lines:
            line = line.rstrip("\n")
            match = LINE.search(line)
            if not match:
                continue
            time_us, digits = wall_time_us(line, utc_offset_us)
            if time_us is None:
                counts["no_timestamp"] += 1
                continue
            precision[digits] += 1
            cid, module, message = match.group(1).lower(), match.group(2), match.group(3)
            if "<truncated" in message:
                counts["truncated"] += 1
            conn = connections[cid]

            if module == "event":
                if found := TX.match(message):
                    number, kind, frames, size, path = found.groups()
                    packet = {"packet_type": PACKET_TYPES.get(kind, kind.lower()),
                              "header": {"packet_number": int(number), "packet_size": int(size)}}
                    conn.sent[int(number)] = packet
                    conn.add(time_us, int(path or 0), "transport", "packet_sent",
                             {**packet, "frames": frame_list(frames)})
                    counts["packet_sent"] += 1
                elif found := RX.match(message):
                    number, kind, size, path = found.groups()
                    conn.last_rx = conn.add(time_us, int(path or 0), "transport", "packet_received", {
                        "packet_type": PACKET_TYPES.get(kind, kind.lower()),
                        "header": {"packet_number": int(number), "packet_size": int(size)},
                        "frames": [],
                    })
                    conn.last_rx.append((kind, int(number)))
                    counts["packet_received"] += 1
                elif (found := RX_ACK.match(message)) and conn.last_rx:
                    ranges = [[int(low), int(high)] for high, low in ACK_RANGE.findall(found.group(1))]
                    conn.last_rx[4]["frames"].append({"frame_type": "ack", "acked_ranges": ranges[::-1]})
                elif (found := RX_STREAM.match(message)) and conn.last_rx:
                    stream, offset, size = map(int, found.groups())
                    conn.last_rx[4]["frames"].append(
                        {"frame_type": "stream", "stream_id": stream, "offset": offset, "length": size})
                elif message == "connection created":
                    conn.add(time_us, 0, "connectivity", "connection_state_updated", {"new": "created"})
                elif message == "handshake completed":
                    conn.add(time_us, 0, "connectivity", "connection_state_updated", {"new": "handshake_completed"})

            elif module == "sendctl":
                if found := RTT.match(message):
                    _, rtt, delta, srtt = map(int, found.groups())
                    conn.update_metrics(time_us, latest_rtt=rtt, ack_delay=delta, smoothed_rtt=srtt)
                    counts["rtt_sample"] += 1
                elif found := CAN_SEND.search(message):
                    in_flight, cwnd = map(int, found.groups())
                    conn.update_metrics(time_us, cwnd=cwnd, bytes_in_flight=in_flight)
                    counts["cwnd_sample"] += 1
                elif found := LOSS_TRIGGER.match(message):
                    conn.loss_triggers[int(found.group(2))] = LOSS_TRIGGERS[found.group(1)]
                elif found := TIMEOUT.match(message):
                    conn.timeout = found.group(1).lower()
                elif TIMEOUT_DONE.match(message):
                    conn.timeout = None
                elif found := LOST.match(message):
                    number = int(found.group(1))
                    packet = conn.sent.get(number, {"header": {"packet_number": number}})
                    trigger = conn.loss_triggers.pop(number, None) or conn.timeout or "unknown"
                    conn.add(time_us, 0, "recovery", "packet_lost", {**packet, "trigger": trigger})
                    counts["packet_lost"] += 1
                elif found := CC_SELECT.match(message):
                    conn.add(time_us, 0, "recovery", "congestion_controller_selected",
                             {"smoothed_rtt": int(found.group(1)), "controller": found.group(2).lower()})

            elif module == "qlog" and '"PACKET_RX"' in message:
                try:
                    event, _ = json.JSONDecoder().raw_decode(message[message.index("["):])
                    header = event[4]["header"]
                    rx_mono[(cid, header["type"], int(header["packet_number"]))] = int(event[0])
                except (ValueError, KeyError, IndexError, TypeError):
                    counts["bad_qlog_rx"] += 1

    # pi_received uses CLOCK_MONOTONIC. The smallest log-minus-monotonic gap
    # over matched packets maps it onto the log's wall clock.
    matched = []
    for cid, conn in connections.items():
        for event in conn.events:
            if event[3] == "packet_received":
                mono = rx_mono.get((cid, *event[5]))
                if mono is not None:
                    matched.append((event, mono))
    offset = min((event[0] - mono for event, mono in matched), default=None)
    if offset is not None:
        for event, mono in matched:
            event[0] = mono + offset

    output.mkdir(parents=True, exist_ok=True)
    written = 0
    for cid, conn in connections.items():
        events = sorted(conn.events, key=lambda event: event[0])
        if not any(event[3] in ("packet_sent", "packet_received") for event in events):
            continue
        reference = events[0][0]
        trace = {
            "qlog_version": "draft-00",
            "title": f"LSQUIC server connection {cid}",
            "traces": [{
                "vantage_point": {"name": "lsquic", "type": "server"},
                "title": f"LSQUIC server connection {cid}",
                "description": "Rebuilt from OpenLiteSpeed LSQUIC debug log (event, sendctl, qlog modules)",
                "event_fields": ["relative_time", "path_id", "category", "event", "data"],
                "configuration": {"time_units": "us"},
                "common_fields": {"protocol_type": "QUIC_HTTP3", "reference_time": str(reference)},
                "events": [[event[0] - reference, *event[1:5]] for event in events],
            }],
        }
        with (output / f"{cid}_server.qlog").open("w", encoding="utf-8") as file:
            json.dump(trace, file, separators=(",", ":"))
        written += 1

    report = ", ".join(f"{key}={counts[key]}" for key in
                       ("packet_sent", "packet_received", "packet_lost", "rtt_sample", "cwnd_sample"))
    print(f"Wrote {written} qlog files to {output}: {report}", file=sys.stderr)
    if offset is None:
        print("Warning: no qlog PACKET_RX matched; RX times are log write times, not receive times", file=sys.stderr)
    else:
        print(f"RX times corrected from pi_received for {len(matched)}/{counts['packet_received']} packets",
              file=sys.stderr)
    if precision and min(precision) < 6:
        print(f"Warning: some log timestamps have only {min(precision)} fractional digits", file=sys.stderr)
    if not counts["packet_sent"]:
        print("Warning: no 'event' TX lines; LSQUIC event module is not logging at debug level", file=sys.stderr)
    if not counts["cwnd_sample"]:
        print("Warning: no 'sendctl' cwnd lines; LSQUIC sendctl module is not logging at debug level", file=sys.stderr)
    for key in ("no_timestamp", "truncated", "bad_qlog_rx"):
        if counts[key]:
            print(f"Warning: {counts[key]} lines skipped or partial ({key})", file=sys.stderr)


def capture(output):
    output.mkdir(parents=True, exist_ok=True)
    raw_path = output / RAW_LOG
    kept = 0
    with raw_path.open("a", encoding="utf-8") as raw:
        try:
            for line in sys.stdin:
                if "[QUIC:" in line:
                    raw.write(line)
                    kept += 1
                    if kept % 1000 == 0:
                        raw.flush()
        except KeyboardInterrupt:
            pass
    print(f"Saved {kept} LSQUIC log lines to {raw_path}", file=sys.stderr)
    return raw_path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, help="output directory")
    parser.add_argument("--from-log", type=Path, help="rebuild qlog from a saved debug log instead of stdin")
    parser.add_argument("--utc-offset", type=parse_utc_offset, default=0,
                        help="timezone of the OpenLiteSpeed log timestamps, default +00:00")
    args = parser.parse_args()
    log_path = args.from_log or capture(args.output)
    convert(log_path, args.output, args.utc_offset)


if __name__ == "__main__":
    main()
