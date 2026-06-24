import type { MediaPlayerClass } from "dashjs";
import { getTtfbFromPerformanceApi } from "./performanceApi";

export interface SegmentSample {
  atMs: number;
  bits: number;
  durationMs: number;
  kbps: number;
}

export interface SegmentQosMetrics {
  bytesLoaded: number;
  durationMs: number;
  downloadSpeedKbps: number;
  goodputKbps: number;
  jitterMs: number;
  ttfbMs: number;
  overheadRatio: number;
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  connectionSetupMs: number;
}

export function getLatestResourceTiming(url?: string): PerformanceResourceTiming | null {
  if (!url) return null;
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.name.includes(url) || url.includes(entry.name)) return entry;
    }
  } catch {
    return null;
  }
  return null;
}

export function getRequestTime(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getPositiveDelta(end: number, start: number) {
  const delta = end - start;
  return Number.isFinite(delta) && delta > 0 ? Math.round(delta * 100) / 100 : 0;
}

export function getSegmentBytes(req: any, event: any, resourceTiming: PerformanceResourceTiming | null) {
  if (Number.isFinite(req?.bytesLoaded) && req.bytesLoaded > 0) return req.bytesLoaded;
  if (Number.isFinite(req?.bytesTotal) && req.bytesTotal > 0) return req.bytesTotal;
  if (event?.response instanceof ArrayBuffer) return event.response.byteLength;
  if (Number.isFinite(event?.response?.byteLength) && event.response.byteLength > 0) return event.response.byteLength;
  if (resourceTiming?.encodedBodySize && resourceTiming.encodedBodySize > 0) return resourceTiming.encodedBodySize;
  return 0;
}

export function getSegmentDurationMs(
  req: any,
  resourceTiming: PerformanceResourceTiming | null,
  requestStartMs: number,
) {
  const requestEndMs = getRequestTime(req?.endDate) || getRequestTime(req?.requestEndDate) || Date.now();
  let durationMs = requestStartMs > 0 && requestEndMs > requestStartMs ? requestEndMs - requestStartMs : 0;

  if (durationMs === 0 && Array.isArray(req?.trace) && req.trace.length > 0) {
    let traceDuration = 0;
    for (const traceItem of req.trace) traceDuration += (traceItem.d ?? traceItem.duration ?? 0);
    if (traceDuration > 0) durationMs = traceDuration;
  }

  if (durationMs === 0 && resourceTiming) {
    const perfDuration = resourceTiming.responseEnd - resourceTiming.requestStart;
    if (perfDuration > 0) durationMs = Math.round(perfDuration);
  }

  return durationMs;
}

export function calculateLossProxyRate(totalRequests: number, failedRequests: number, abandonedRequests: number) {
  // QoS: ty le loi xap xi = (request segment loi + request segment bi huy) / tong request segment.
  return totalRequests > 0
    ? Math.round(((failedRequests + abandonedRequests) / totalRequests) * 10000) / 10000
    : 0;
}

export function calculateSegmentQosMetrics(args: {
  req: any;
  event: any;
  previousSegmentDurationMs: number | null;
}): SegmentQosMetrics {
  const resourceTiming = getLatestResourceTiming(args.req?.url);
  const requestStartMs = getRequestTime(args.req?.startDate)
    || getRequestTime(args.req?.requestStartDate)
    || getRequestTime(args.req?.firstByteDate);
  const bytesLoaded = getSegmentBytes(args.req, args.event, resourceTiming);
  const durationMs = getSegmentDurationMs(args.req, resourceTiming, requestStartMs);

  if (bytesLoaded === 0) {
    return {
      bytesLoaded: 0,
      durationMs: 0,
      downloadSpeedKbps: 0,
      goodputKbps: 0,
      jitterMs: 0,
      ttfbMs: 0,
      overheadRatio: 0,
      dnsMs: 0,
      tcpMs: 0,
      tlsMs: 0,
      connectionSetupMs: 0,
    };
  }

  const encodedBodySize = resourceTiming?.encodedBodySize && resourceTiming.encodedBodySize > 0
    ? resourceTiming.encodedBodySize
    : bytesLoaded;
  const transferSize = resourceTiming?.transferSize && resourceTiming.transferSize > 0
    ? resourceTiming.transferSize
    : 0;

  // QoS: toc do tai segment = so byte nhan duoc * 8 / thoi gian tai segment.
  const downloadSpeedKbps = durationMs > 0 ? (bytesLoaded * 8) / durationMs : 0;

  // QoS: goodput = so byte payload huu ich * 8 / thoi gian tai segment.
  const goodputKbps = durationMs > 0 ? (encodedBodySize * 8) / durationMs : downloadSpeedKbps;

  // QoS: ty le overhead = (tong byte truyen - byte payload huu ich) / tong byte truyen.
  const overheadRatio = transferSize > 0
    ? Math.max(0, Math.round(((transferSize - encodedBodySize) / transferSize) * 10000) / 10000)
    : 0;

  // QoS: jitter xap xi = do lech tuyet doi giua hai thoi gian tai segment lien tiep.
  const jitterMs = durationMs > 0 && args.previousSegmentDurationMs !== null
    ? Math.abs(durationMs - args.previousSegmentDurationMs)
    : 0;

  // QoS: do tre HTTP/TTFB xap xi RTT o tang ung dung, khong phai RTT TCP/IP that.
  let ttfbMs = resourceTiming ? getPositiveDelta(resourceTiming.responseStart, resourceTiming.requestStart) : 0;
  if (ttfbMs === 0 && args.req?.url) ttfbMs = getTtfbFromPerformanceApi(args.req.url);
  if (ttfbMs === 0 && args.req?.firstByteDate && requestStartMs > 0) {
    const firstByteTime = getRequestTime(args.req.firstByteDate);
    if (firstByteTime > requestStartMs) ttfbMs = Math.round(firstByteTime - requestStartMs);
  }

  // QoS: thoi gian setup ket noi lay tu Resource Timing API khi server cho phep Timing-Allow-Origin.
  const dnsMs = resourceTiming ? getPositiveDelta(resourceTiming.domainLookupEnd, resourceTiming.domainLookupStart) : 0;
  const tcpMs = resourceTiming ? getPositiveDelta(resourceTiming.connectEnd, resourceTiming.connectStart) : 0;
  const tlsMs = resourceTiming && resourceTiming.secureConnectionStart > 0
    ? getPositiveDelta(resourceTiming.connectEnd, resourceTiming.secureConnectionStart)
    : 0;
  const connectionSetupMs = resourceTiming ? getPositiveDelta(resourceTiming.connectEnd, resourceTiming.startTime) : 0;

  return {
    bytesLoaded,
    durationMs,
    downloadSpeedKbps,
    goodputKbps,
    jitterMs,
    ttfbMs,
    overheadRatio,
    dnsMs,
    tcpMs,
    tlsMs,
    connectionSetupMs,
  };
}

export function calculateAverageThroughputKbps(
  segmentSamples: SegmentSample[],
  player: MediaPlayerClass,
) {
  // QoS: throughput trung binh gan day = tong bit tai ve / tong thoi gian tai.
  if (segmentSamples.length > 0) {
    const totalBits = segmentSamples.reduce((sum, sample) => sum + sample.bits, 0);
    const totalDurationMs = segmentSamples.reduce((sum, sample) => sum + sample.durationMs, 0);
    return totalDurationMs > 0 ? totalBits / totalDurationMs : 0;
  }

  try {
    const averageThroughput = player.getAverageThroughput?.("video");
    return typeof averageThroughput === "number" && averageThroughput > 0 ? averageThroughput : 0;
  } catch {
    return 0;
  }
}
