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
  payloadRateKbps: number;
  segmentDownloadTimeVariationMs: number;
  ttfbMs: number;
  encodedBodySizeBytes: number;
  transferSizeBytes: number;
  resourceTimingSizeDeltaBytes: number;
  dnsMs: number;
  connectMs: number;
  secureHandshakeMs: number;
  connectionSetupMs: number;
  responseStatus: number;
  nextHopProtocol: string;
}

export function getLatestResourceTiming(url?: string, resourcePrefix?: string): PerformanceResourceTiming | null {
  if (!url) return null;
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (resourcePrefix && !entry.name.includes(resourcePrefix) && !url.includes(resourcePrefix)) {
        continue;
      }
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

function getTraceBytes(trace: unknown) {
  if (!Array.isArray(trace)) return 0;
  return trace.reduce((total, item) => {
    const chunks = Array.isArray(item?.b) ? item.b : [];
    return total + chunks.reduce((sum: number, bytes: unknown) => (
      sum + (typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0)
    ), 0);
  }, 0);
}

export function getSegmentBytes(
  req: any,
  event: any,
  resourceTiming: PerformanceResourceTiming | null,
  dashHttpRequest?: any,
) {
  if (Number.isFinite(req?.bytesLoaded) && req.bytesLoaded > 0) return req.bytesLoaded;
  if (Number.isFinite(req?.bytesTotal) && req.bytesTotal > 0) return req.bytesTotal;
  if (event?.response instanceof ArrayBuffer) return event.response.byteLength;
  if (Number.isFinite(event?.response?.byteLength) && event.response.byteLength > 0) return event.response.byteLength;
  const traceBytes = getTraceBytes(dashHttpRequest?.trace);
  if (traceBytes > 0) return traceBytes;
  if (resourceTiming?.encodedBodySize && resourceTiming.encodedBodySize > 0) return resourceTiming.encodedBodySize;
  return 0;
}

export function getSegmentDurationMs(
  req: any,
  resourceTiming: PerformanceResourceTiming | null,
  requestStartMs: number,
  dashHttpRequest?: any,
) {
  const requestEndMs = getRequestTime(dashHttpRequest?._tfinish)
    || getRequestTime(req?.endDate)
    || getRequestTime(req?.requestEndDate)
    || Date.now();
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

export function calculateFragmentFailureOrAbandonRate(
  totalRequests: number,
  failedRequests: number,
  abandonedRequests: number,
) {
  // Ty le request loi hoac bi bo, khong phai mat goi.
  return totalRequests > 0
    ? Math.round(((failedRequests + abandonedRequests) / totalRequests) * 10000) / 10000
    : 0;
}

export function calculateSegmentQosMetrics(args: {
  req: any;
  event: any;
  previousSegmentDurationMs: number | null;
  wallDurationMs?: number | null;
  resourcePrefix?: string;
  dashHttpRequest?: any;
}): SegmentQosMetrics {
  const resourceTiming = getLatestResourceTiming(args.req?.url, args.resourcePrefix);
  const requestStartMs = getRequestTime(args.dashHttpRequest?.trequest)
    || getRequestTime(args.req?.startDate)
    || getRequestTime(args.req?.requestStartDate)
    || getRequestTime(args.req?.firstByteDate);
  const bytesLoaded = getSegmentBytes(args.req, args.event, resourceTiming, args.dashHttpRequest);
  // Do tu event de tinh ca thoi gian retry.
  const durationMs = args.wallDurationMs && args.wallDurationMs > 0
    ? Math.round(args.wallDurationMs)
    : getSegmentDurationMs(args.req, resourceTiming, requestStartMs, args.dashHttpRequest);

  const encodedBodySize = resourceTiming?.encodedBodySize && resourceTiming.encodedBodySize > 0
    ? resourceTiming.encodedBodySize
    : bytesLoaded;
  const transferSizeBytes = resourceTiming?.transferSize && resourceTiming.transferSize > 0
    ? resourceTiming.transferSize
    : 0;

  // QoS: toc do tai segment = so byte nhan duoc * 8 / thoi gian tai segment.
  const downloadSpeedKbps = durationMs > 0 ? (bytesLoaded * 8) / durationMs : 0;

  // Toc do payload ma hoa, khong phai goodput transport.
  const payloadRateKbps = durationMs > 0 ? (encodedBodySize * 8) / durationMs : downloadSpeedKbps;

  // Delta Resource Timing khong phai overhead transport.
  const resourceTimingSizeDeltaBytes = transferSizeBytes > 0
    ? Math.max(0, transferSizeBytes - encodedBodySize)
    : 0;

  // Bien thien thoi gian tai, khong phai jitter mang.
  const segmentDownloadTimeVariationMs = durationMs > 0 && args.previousSegmentDurationMs !== null
    ? Math.abs(durationMs - args.previousSegmentDurationMs)
    : 0;

  // QoS: do tre HTTP/TTFB xap xi RTT o tang ung dung, khong phai RTT TCP/IP that.
  let ttfbMs = resourceTiming ? getPositiveDelta(resourceTiming.responseStart, resourceTiming.requestStart) : 0;
  if (ttfbMs === 0 && args.req?.url) ttfbMs = getTtfbFromPerformanceApi(args.req.url, args.resourcePrefix);
  const firstByteDate = args.dashHttpRequest?.tresponse ?? args.req?.firstByteDate;
  if (ttfbMs === 0 && firstByteDate && requestStartMs > 0) {
    const firstByteTime = getRequestTime(firstByteDate);
    if (firstByteTime > requestStartMs) ttfbMs = Math.round(firstByteTime - requestStartMs);
  }

  // QoS: thoi gian setup ket noi lay tu Resource Timing API khi server cho phep Timing-Allow-Origin.
  const dnsMs = resourceTiming ? getPositiveDelta(resourceTiming.domainLookupEnd, resourceTiming.domainLookupStart) : 0;
  // Connect cua HTTP/3 la QUIC, khong phai TCP.
  const connectMs = resourceTiming ? getPositiveDelta(resourceTiming.connectEnd, resourceTiming.connectStart) : 0;
  const secureHandshakeMs = resourceTiming && resourceTiming.secureConnectionStart > 0
    ? getPositiveDelta(resourceTiming.connectEnd, resourceTiming.secureConnectionStart)
    : 0;
  // Bo qua thoi gian xep hang va redirect.
  const setupStart = resourceTiming
    ? (resourceTiming.domainLookupStart > 0 ? resourceTiming.domainLookupStart : resourceTiming.connectStart)
    : 0;
  const connectionSetupMs = resourceTiming ? getPositiveDelta(resourceTiming.connectEnd, setupStart) : 0;

  return {
    bytesLoaded,
    durationMs,
    downloadSpeedKbps,
    payloadRateKbps,
    segmentDownloadTimeVariationMs,
    ttfbMs,
    encodedBodySizeBytes: encodedBodySize,
    transferSizeBytes,
    resourceTimingSizeDeltaBytes,
    dnsMs,
    connectMs,
    secureHandshakeMs,
    connectionSetupMs,
    responseStatus: Number(
      args.dashHttpRequest?.responsecode
        ?? args.event?.error?.data?.response?.status
        ?? args.event?.response?.status
        ?? args.event?.request?.responsecode
        ?? resourceTiming?.responseStatus
        ?? args.req?.responsecode
        ?? 0,
    ) || 0,
    nextHopProtocol: resourceTiming?.nextHopProtocol ?? "",
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
