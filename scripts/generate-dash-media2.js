/**
 * generate-dash-media2.js
 *
 * Script tao DASH segments va manifest tu cac video MP4 trong media-2.
 * Segment tung file rieng biet bang ffmpeg, sau do tao MPD chua tat ca representations.
 *
 * Cach chay: node scripts/generate-dash-media2.js
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MEDIA2_DIR = path.join(ROOT, "media-2");
const OUTPUT_DIR = path.join(MEDIA2_DIR, "dash");

// Doc danh sach thu muc bitrate, sap xep tang dan
const entries = fs
  .readdirSync(MEDIA2_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /\d+bps$/.test(e.name))
  .map((e) => {
    const bps = Number(e.name.match(/(\d+)bps$/)[1]);
    const mp4 = fs.readdirSync(path.join(MEDIA2_DIR, e.name)).find((f) => f.endsWith(".mp4"));
    return { name: e.name, bps, file: mp4 ? path.join(MEDIA2_DIR, e.name, mp4) : null };
  })
  .filter((e) => e.file && e.bps > 0)
  .sort((a, b) => a.bps - b.bps);

console.log(`Tim thay ${entries.length} video.\n`);
if (!entries.length) { console.error("Khong co video!"); process.exit(1); }

// Xoa va tao lai output dir
if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const repInfos = [];

for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  const repDir = path.join(OUTPUT_DIR, `_rep${i}`);
  fs.mkdirSync(repDir, { recursive: true });

  console.log(`[${i + 1}/${entries.length}] ${entry.name} (${(entry.bps / 1000).toFixed(0)} kbps)`);

  // Chay ffmpeg tao DASH cho 1 file (CWD = repDir de output vao day)
  try {
    execSync(
      `ffmpeg -y -i "${entry.file}" -c:v copy -f dash -seg_duration 4 stream.mpd`,
      { cwd: repDir, stdio: "pipe", maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {
    // ffmpeg exit 1 du thanh cong
  }

  if (!fs.existsSync(path.join(repDir, "stream.mpd"))) {
    console.error(`  SKIP: khong tao duoc MPD`);
    fs.rmSync(repDir, { recursive: true, force: true });
    continue;
  }

  // Probe resolution
  let width = 0, height = 0;
  try {
    const probe = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${entry.file}"`,
      { encoding: "utf-8" }
    ).trim();
    const [w, h] = probe.split(",").map(Number);
    width = w || 0;
    height = h || 0;
  } catch {}

  // Doc SegmentTimeline tu MPD vua tao
  const mpdContent = fs.readFileSync(path.join(repDir, "stream.mpd"), "utf-8");
  const tlMatch = mpdContent.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/);
  const timeline = tlMatch ? tlMatch[1].trim() : "";

  // Lay timescale tu MPD
  const tsMatch = mpdContent.match(/timescale="(\d+)"/);
  const timescale = tsMatch ? tsMatch[1] : "24";

  // Di chuyen init file (dung copy+delete tranh EBUSY tren Windows)
  const initSrc = path.join(repDir, "init-stream0.m4s");
  if (fs.existsSync(initSrc)) {
    const dest = path.join(OUTPUT_DIR, `init-stream${i}.m4s`);
    fs.copyFileSync(initSrc, dest);
  }

  // Di chuyen chunk files (doi ten stream0 -> stream{i})
  const chunkFiles = fs.readdirSync(repDir)
    .filter((f) => f.startsWith("chunk-stream0-"))
    .sort();
  for (const cf of chunkFiles) {
    const newName = cf.replace("chunk-stream0-", `chunk-stream${i}-`);
    fs.copyFileSync(path.join(repDir, cf), path.join(OUTPUT_DIR, newName));
  }

  // Xoa thu muc tam
  try { fs.rmSync(repDir, { recursive: true, force: true }); } catch {}

  repInfos.push({ id: i, bps: entry.bps, width, height, timeline, timescale, chunkCount: chunkFiles.length });
  console.log(`  OK: ${width}x${height}, ${chunkFiles.length} chunks`);
}

// Tao MPD manifest tong hop
console.log(`\nTao manifest (${repInfos.length} representations)...`);

let duration = "PT9M56.5S";
try {
  const d = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${entries[0].file}"`,
    { encoding: "utf-8" }
  ).trim();
  const secs = parseFloat(d);
  if (Number.isFinite(secs)) {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    duration = `PT${m}M${s}S`;
  }
} catch {}

// Dung timescale chung (tat ca video 24fps -> timescale=24)
const timescale = repInfos[0]?.timescale || "24";

const repsXml = repInfos.map((r) =>
  `\t\t\t<Representation id="${r.id}" mimeType="video/mp4" codecs="avc1.64001f" bandwidth="${r.bps}" width="${r.width}" height="${r.height}" sar="1:1">
\t\t\t\t<SegmentTemplate timescale="${timescale}" initialization="init-stream$RepresentationID$.m4s" media="chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1">
\t\t\t\t\t<SegmentTimeline>
${r.timeline}
\t\t\t\t\t</SegmentTimeline>
\t\t\t\t</SegmentTemplate>
\t\t\t</Representation>`
).join("\n");

const maxW = Math.max(...repInfos.map((r) => r.width));
const maxH = Math.max(...repInfos.map((r) => r.height));

const mpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
\txmlns="urn:mpeg:dash:schema:mpd:2011"
\txsi:schemaLocation="urn:mpeg:DASH:schema:MPD:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd"
\tprofiles="urn:mpeg:dash:profile:isoff-live:2011"
\ttype="static"
\tmediaPresentationDuration="${duration}"
\tmaxSegmentDuration="PT4.0S"
\tminBufferTime="PT4.0S">
\t<Period id="0" start="PT0.0S">
\t\t<AdaptationSet id="0" contentType="video" startWithSAP="1" segmentAlignment="true" bitstreamSwitching="true" frameRate="24/1" maxWidth="${maxW}" maxHeight="${maxH}" par="16:9" lang="und">
${repsXml}
\t\t</AdaptationSet>
\t</Period>
</MPD>
`;

fs.writeFileSync(path.join(OUTPUT_DIR, "stream.mpd"), mpd, "utf-8");

// Thong ke
const all = fs.readdirSync(OUTPUT_DIR);
console.log(`\nHoan thanh!`);
console.log(`  Representations: ${repInfos.length}`);
console.log(`  Init segments: ${all.filter((f) => f.startsWith("init-")).length}`);
console.log(`  Media chunks: ${all.filter((f) => f.startsWith("chunk-")).length}`);
console.log(`  Output: ${OUTPUT_DIR}`);
