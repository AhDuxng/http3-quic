const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const media2Dir = path.join(rootDir, "media-2");
const outputDir = path.join(media2Dir, "dash");

const entries = fs
  .readdirSync(media2Dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /\d+bps$/.test(entry.name))
  .map((entry) => {
    const bps = Number(entry.name.match(/(\d+)bps$/)[1]);
    const mp4File = fs.readdirSync(path.join(media2Dir, entry.name)).find((file) => file.endsWith(".mp4"));
    return { name: entry.name, bps, file: mp4File ? path.join(media2Dir, entry.name, mp4File) : null };
  })
  .filter((entry) => entry.file && entry.bps > 0)
  .sort((firstEntry, secondEntry) => firstEntry.bps - secondEntry.bps);

console.log(`Tim thay ${entries.length} video.\n`);
if (!entries.length) {
  console.error("Khong co video!");
  process.exit(1);
}

if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const repInfos = [];

for (let index = 0; index < entries.length; index++) {
  const entry = entries[index];
  const repDir = path.join(outputDir, `_rep${index}`);
  fs.mkdirSync(repDir, { recursive: true });

  console.log(`[${index + 1}/${entries.length}] ${entry.name} (${(entry.bps / 1000).toFixed(0)} kbps)`);

  try {
    execSync(
      `ffmpeg -y -i "${entry.file}" -c:v copy -f dash -seg_duration 4 stream.mpd`,
      { cwd: repDir, stdio: "pipe", maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {}

  if (!fs.existsSync(path.join(repDir, "stream.mpd"))) {
    console.error(`  SKIP: khong tao duoc MPD`);
    fs.rmSync(repDir, { recursive: true, force: true });
    continue;
  }

  let width = 0;
  let height = 0;
  try {
    const probe = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${entry.file}"`,
      { encoding: "utf-8" }
    ).trim();
    const [w, h] = probe.split(",").map(Number);
    width = w || 0;
    height = h || 0;
  } catch {}

  const mpdContent = fs.readFileSync(path.join(repDir, "stream.mpd"), "utf-8");
  const timelineMatch = mpdContent.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/);
  const timeline = timelineMatch ? timelineMatch[1].trim() : "";

  const timescaleMatch = mpdContent.match(/timescale="(\d+)"/);
  const timescale = timescaleMatch ? timescaleMatch[1] : "24";

  const initSrc = path.join(repDir, "init-stream0.m4s");
  if (fs.existsSync(initSrc)) {
    const initDest = path.join(outputDir, `init-stream${index}.m4s`);
    fs.copyFileSync(initSrc, initDest);
  }

  const chunkFiles = fs.readdirSync(repDir)
    .filter((file) => file.startsWith("chunk-stream0-"))
    .sort();
  for (const chunkFile of chunkFiles) {
    const newName = chunkFile.replace("chunk-stream0-", `chunk-stream${index}-`);
    fs.copyFileSync(path.join(repDir, chunkFile), path.join(outputDir, newName));
  }

  try {
    fs.rmSync(repDir, { recursive: true, force: true });
  } catch {}

  repInfos.push({ id: index, bps: entry.bps, width, height, timeline, timescale, chunkCount: chunkFiles.length });
  console.log(`  OK: ${width}x${height}, ${chunkFiles.length} chunks`);
}

console.log(`\nTao manifest (${repInfos.length} representations)...`);

let duration = "PT9M56.5S";
try {
  const rawDuration = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${entries[0].file}"`,
    { encoding: "utf-8" }
  ).trim();
  const seconds = parseFloat(rawDuration);
  if (Number.isFinite(seconds)) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    duration = `PT${minutes}M${remainingSeconds}S`;
  }
} catch {}

const timescale = repInfos[0]?.timescale || "24";

const repsXml = repInfos.map((repInfo) =>
  `\t\t\t<Representation id="${repInfo.id}" mimeType="video/mp4" codecs="avc1.64001f" bandwidth="${repInfo.bps}" width="${repInfo.width}" height="${repInfo.height}" sar="1:1">
\t\t\t\t<SegmentTemplate timescale="${timescale}" initialization="init-stream$RepresentationID$.m4s" media="chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1">
\t\t\t\t\t<SegmentTimeline>
${repInfo.timeline}
\t\t\t\t\t</SegmentTimeline>
\t\t\t\t</SegmentTemplate>
\t\t\t</Representation>`
).join("\n");

const maxWidth = Math.max(...repInfos.map((repInfo) => repInfo.width));
const maxHeight = Math.max(...repInfos.map((repInfo) => repInfo.height));

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
\t\t<AdaptationSet id="0" contentType="video" startWithSAP="1" segmentAlignment="true" bitstreamSwitching="true" frameRate="24/1" maxWidth="${maxWidth}" maxHeight="${maxHeight}" par="16:9" lang="und">
${repsXml}
\t\t</AdaptationSet>
\t</Period>
</MPD>
`;

fs.writeFileSync(path.join(outputDir, "stream.mpd"), mpd, "utf-8");

const outputFiles = fs.readdirSync(outputDir);
console.log(`\nHoan thanh!`);
console.log(`  Representations: ${repInfos.length}`);
console.log(`  Init segments: ${outputFiles.filter((file) => file.startsWith("init-")).length}`);
console.log(`  Media chunks: ${outputFiles.filter((file) => file.startsWith("chunk-")).length}`);
console.log(`  Output: ${outputDir}`);
