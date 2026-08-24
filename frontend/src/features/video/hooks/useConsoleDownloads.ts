import { useCallback, useMemo, useState } from "react";
import type { Representation } from "dashjs";
import type { NetworkScenario } from "../../../type/video";
import type {
  LogEntry,
  PlaybackQoeSample,
  SegmentQosRecord,
  StreamStats,
} from "../type/dashPlayer";
import { generateDetailedLog, generateLogsCsv, generateQoeCsv, generateQosCsv } from "../utils/csvExporter";

interface UseConsoleDownloadsArgs {
  logs: LogEntry[];
  getStatsSnapshot: () => StreamStats;
  getSegmentQosRecords: () => SegmentQosRecord[];
  getPlaybackQoeSamples: () => PlaybackQoeSample[];
  representations: Representation[];
  isAutoQuality: boolean;
  activeScenario: NetworkScenario;
  streamTitle: string;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([type.includes("csv") ? "\uFEFF" : "", content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function useConsoleDownloads({
  logs,
  getStatsSnapshot,
  getSegmentQosRecords,
  getPlaybackQoeSamples,
  representations,
  isAutoQuality,
  activeScenario,
  streamTitle,
}: UseConsoleDownloadsArgs) {
  const [filter, setFilter] = useState("");
  const filenameSlug = useMemo(
    () => streamTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    [streamTitle],
  );

  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return logs;
    const keyword = filter.toLowerCase();
    return logs.filter(
      (log) => log.message.toLowerCase().includes(keyword)
        || log.streamTitle.toLowerCase().includes(keyword)
        || log.segmentLabel.toLowerCase().includes(keyword)
        || log.level.toLowerCase().includes(keyword)
        || log.statsSnapshot.protocolLabel.toLowerCase().includes(keyword),
    );
  }, [logs, filter]);

  const downloadCsvBundle = useCallback(() => {
    const snapshotLogs = logs.slice();
    const snapshotQosRecords = getSegmentQosRecords();
    const snapshotQoeSamples = getPlaybackQoeSamples();
    if (snapshotLogs.length === 0 && snapshotQosRecords.length === 0 && snapshotQoeSamples.length === 0) return;

    const timestamp = createTimestamp();
    const exports = [
      ["logs", generateLogsCsv(snapshotLogs)],
      ["qos", generateQosCsv(snapshotQosRecords)],
      ["qoe", generateQoeCsv(snapshotQoeSamples)],
    ] as const;
    for (const [kind, content] of exports) {
      downloadFile(
        content,
        `adtube-${kind}-${filenameSlug}-${timestamp}.csv`,
        "text/csv;charset=utf-8",
      );
    }
  }, [filenameSlug, getPlaybackQoeSamples, getSegmentQosRecords, logs]);

  const downloadText = useCallback(() => {
    if (filteredLogs.length === 0) return;
    const text = generateDetailedLog({
      stats: getStatsSnapshot(),
      isAutoQuality,
      scenarioLabel: activeScenario.label,
      scenarioSpeed: activeScenario.speedLabel,
      representations,
      logs: filteredLogs,
      streamTitle,
    });
    downloadFile(text, `adtube-report-${filenameSlug}-${createTimestamp()}.txt`, "text/plain");
  }, [
    activeScenario.label,
    activeScenario.speedLabel,
    filenameSlug,
    filteredLogs,
    getStatsSnapshot,
    isAutoQuality,
    representations,
    streamTitle,
  ]);

  return {
    filter,
    setFilter,
    filteredLogs,
    downloadCsvBundle,
    downloadText,
  };
}
