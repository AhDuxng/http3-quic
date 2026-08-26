import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const output = process.argv[3] || "-";
const protocol = process.env.CUSTOM_MODE === "mpquic" ? "mpquic" : "h3";
const scheduler = protocol === "mpquic" ? "picoquic-default" : "single-path";
const runId = process.env.RUN_ID || path.basename(input || "qlog");

if (!input) {
  console.error("Dung: node normalize-qlog.mjs <input.qlog> [output.jsonl]");
  process.exit(2);
}

const document = JSON.parse(fs.readFileSync(input, "utf8"));
const destination = output === "-" ? process.stdout : fs.createWriteStream(output);
const pathState = new Map();
const inputMtimeUs = fs.statSync(input).mtimeMs * 1000;
const epoch2000Us = Date.UTC(2000, 0, 1) * 1000;

function write(record) {
  destination.write(`${JSON.stringify(record)}\n`);
}

function normalizeEvent(raw, fields) {
  if (!Array.isArray(raw)) return raw;
  const result = {};
  fields.forEach((field, index) => { result[field] = raw[index]; });
  return result;
}

for (const trace of document.traces || []) {
  const fields = trace.common_fields?.event_fields || trace.event_fields || document.event_fields
    || ["relative_time", "path_id", "category", "event", "data"];
  const rawReferenceTimeUs = Number(trace.common_fields?.reference_time);
  const normalizedEvents = (trace.events || []).map((raw) => normalizeEvent(raw, fields));
  const maximumRelativeTimeUs = normalizedEvents.reduce(
    (maximum, event) => Math.max(maximum, Number(event.relative_time ?? event.time ?? 0) || 0),
    0,
  );
  const referenceIsUtc = Number.isFinite(rawReferenceTimeUs) && rawReferenceTimeUs >= epoch2000Us;
  const referenceTimeUs = referenceIsUtc ? rawReferenceTimeUs : inputMtimeUs - maximumRelativeTimeUs;
  const timestampSource = referenceIsUtc ? "qlog-reference-utc" : "qlog-mtime-estimate";
  for (const event of normalizedEvents) {
    const data = event.data || {};
    const name = event.name || event.event || "unknown";
    const pathId = Number(event.path_id ?? data.path_id ?? 0);
    const state = pathState.get(pathId) || { rtt: null, loss: 0, cwnd: null };

    if (name.includes("metrics_updated")) {
      state.rtt = data.smoothed_rtt ?? state.rtt;
      state.cwnd = data.cwnd ?? state.cwnd;
    }
    if (name.includes("packet_lost")) state.loss += 1;
    pathState.set(pathId, state);

    if (!name.includes("metrics_updated") && !name.includes("packet_sent") && !name.includes("packet_lost")) continue;
    const relativeTimeUs = Number(event.relative_time ?? event.time ?? 0);
    write({
      timestamp_utc: Number.isFinite(referenceTimeUs)
        ? new Date((referenceTimeUs + relativeTimeUs) / 1000).toISOString()
        : null,
      timestamp_source: timestampSource,
      relative_time_us: relativeTimeUs,
      protocol,
      run_id: runId,
      segment: null,
      download_time_ms: null,
      bytes: Number(data.raw?.length ?? data.header?.packet_size ?? data.length ?? data.packet_size ?? 0),
      rtt_ms: state.rtt === null ? null : Number(state.rtt) / 1000,
      loss: state.loss,
      cwnd_bytes: state.cwnd === null ? null : Number(state.cwnd),
      path_id: pathId,
      scheduler,
      event: name,
      metric_scope: "quic-path-transport",
    });
  }
}

if (destination !== process.stdout) destination.end();
