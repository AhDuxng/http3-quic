// formatters.ts — Ham dinh dang du lieu dung chung

// Dinh dang thoi gian HH:mm:ss.cs (cs = phan tram giay)
export function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const cs = pad(Math.floor(date.getMilliseconds() / 10));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${cs}`;
}

// Dinh dang bitrate kbps voi dau phay, vi du: "1,234.5 kbps"
export function formatBitrateKbps(kbps: number): string {
  const safe = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
  return `${safe.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kbps`;
}

// Dinh dang thoi gian phat mm:ss
export function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
