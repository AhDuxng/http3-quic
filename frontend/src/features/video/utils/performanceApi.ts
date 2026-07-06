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
    if (urlFragment) return detectProtocol(undefined);
  } catch {
    return "Detecting...";
  }
  return "Detecting...";
}

export function getTtfbFromPerformanceApi(segmentUrl: string, resourcePrefix?: string): number {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (resourcePrefix && !entry.name.includes(resourcePrefix) && !segmentUrl.includes(resourcePrefix)) {
        continue;
      }
      if (entry.name.includes(segmentUrl) || segmentUrl.includes(entry.name)) {
        const ttfb = entry.responseStart - entry.requestStart;
        if (ttfb > 0 && Number.isFinite(ttfb)) {
          return Math.round(ttfb * 100) / 100;
        }
      }
    }
  } catch {
    return 0;
  }
  return 0;
}

export function getNetworkType(): string {
  try {
    const connection = (navigator as any).connection;
    if (connection?.type) return connection.type;
  } catch {
    return "unknown";
  }
  return "unknown";
}
