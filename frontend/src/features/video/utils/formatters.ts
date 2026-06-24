export function formatTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const cs = pad(Math.floor(date.getMilliseconds() / 10));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${cs}`;
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
