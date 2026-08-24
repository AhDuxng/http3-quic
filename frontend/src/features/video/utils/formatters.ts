export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

export function formatBitrateKbps(kbps: number): string {
  const safe = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
  return `${safe.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kbps`;
}

export function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
