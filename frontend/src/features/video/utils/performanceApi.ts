// performanceApi.ts — Tien ich do luong tu Performance API va Network Information API

/**
 * Phat hien giao thuc HTTP thuc te tu Performance Resource Timing API.
 * entry.nextHopProtocol: "h3" -> HTTP/3, "h2" -> HTTP/2, "http/1.1" -> HTTP/1.1
 */
export function detectProtocol(urlFragment?: string): string {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const relevant = entries
      .filter((e) => !urlFragment || e.name.includes(urlFragment))
      .slice(-10);

    for (let i = relevant.length - 1; i >= 0; i--) {
      const proto = (relevant[i] as any).nextHopProtocol as string | undefined;
      if (!proto) continue;
      const p = proto.toLowerCase();
      if (p === "h3" || p === "h3-29" || p.includes("quic")) return "HTTP/3 (QUIC)";
      if (p === "h2") return "HTTP/2";
      if (p.startsWith("http/1")) return "HTTP/1.1";
    }
    // Fallback: tim tren tat ca resource entries
    if (urlFragment) return detectProtocol(undefined);
  } catch { /* API khong ho tro */ }
  return "Detecting...";
}

/**
 * Lay TTFB chinh xac tu Performance Resource Timing API.
 * TTFB = responseStart - requestStart
 * Yeu cau header Timing-Allow-Origin tren server.
 */
export function getTTFBFromPerformanceAPI(segmentUrl: string): number {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.name.includes(segmentUrl) || segmentUrl.includes(entry.name)) {
        const ttfb = entry.responseStart - entry.requestStart;
        if (ttfb > 0 && Number.isFinite(ttfb)) {
          return Math.round(ttfb * 100) / 100;
        }
      }
    }
  } catch { /* Performance API khong kha dung */ }
  return 0;
}

/**
 * Lay loai ket noi mang VAT LY tu Network Information API.
 * Dung connection.type (tra ve "wifi", "cellular", "ethernet", "none")
 * KHONG dung effectiveType (luon tra "4g" cho WiFi tot).
 */
export function getNetworkType(): string {
  try {
    const conn = (navigator as any).connection;
    if (conn?.type) return conn.type;
  } catch { /* API khong ho tro */ }
  return "unknown";
}
