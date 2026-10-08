#!/usr/bin/env python3
"""Extract LSQUIC's qlog event arrays from OpenLiteSpeed debug log lines.

Usage: docker exec -i openlitespeed_server tail -n 0 -F \
  /usr/local/lsws/logs/error.log | python3 -u scripts/capture-lsquic-qlog.py DIR
"""

import json
import re
import sys
from pathlib import Path


CID = re.compile(r"\[QUIC:([0-9A-Fa-f]+)\]")
EVENT = re.compile(r'\[\s*\d+\s*,\s*"(?:CONNECTIVITY|SECURITY|TRANSPORT|RECOVERY)"')
TAIL = "]}]}"
DECODER = json.JSONDecoder()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: capture-lsquic-qlog.py OUTPUT_DIR")
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    files = {}
    counts = {}
    try:
        for line in sys.stdin:
            cid = CID.search(line)
            event = EVENT.search(line)
            if not cid or not event:
                continue
            try:
                parsed, _ = DECODER.raw_decode(line[event.start():])
            except json.JSONDecodeError:
                continue
            if not isinstance(parsed, list) or len(parsed) < 5:
                continue
            connection_id = cid.group(1).lower()
            if connection_id not in files:
                file = (output / f"{connection_id}_server.qlog").open("w+", encoding="utf-8")
                header = {
                    "qlog_version": "0.3",
                    "qlog_format": "JSON",
                    "traces": [{
                        "vantage_point": {"type": "server"},
                        "title": f"LSQUIC server connection {connection_id}",
                        "common_fields": {
                            "time_format": "absolute",
                            "event_fields": ["time", "category", "event", "trigger", "data"],
                        },
                        "events": [],
                    }],
                }
                prefix = json.dumps(header, separators=(",", ":"))
                prefix = prefix[:prefix.rfind("[]") + 1]
                file.write(prefix + TAIL)
                files[connection_id] = file
                counts[connection_id] = 0
            file = files[connection_id]
            file.seek(file.tell() - len(TAIL))
            if counts[connection_id]:
                file.write(",")
            file.write(json.dumps(parsed, separators=(",", ":")) + TAIL)
            file.flush()
            counts[connection_id] += 1
    except KeyboardInterrupt:
        pass
    finally:
        for file in files.values():
            file.close()
        print(f"Saved {sum(counts.values())} LSQUIC qlog events in {len(files)} files", file=sys.stderr)


if __name__ == "__main__":
    main()
