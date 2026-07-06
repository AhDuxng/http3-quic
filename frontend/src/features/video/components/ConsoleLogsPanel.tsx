import { memo } from "react";
import type { Representation } from "dashjs";
import { FaTerminal, FaDownload, FaSearch } from "react-icons/fa";
import type { LogEntry, LogLevel, StreamStats } from "../type/dashPlayer";
import type { NetworkScenario } from "../../../type/video";
import { useConsoleDownloads } from "../hooks/useConsoleDownloads";
import { PanelHeader } from "./shared/PanelHeader";

interface ConsoleLogsPanelProps {
  logs: LogEntry[];
  getStatsSnapshot: () => StreamStats;
  representations: Representation[];
  isAutoQuality: boolean;
  activeScenario: NetworkScenario;
  streamTitle: string;
  compact?: boolean;
}

const logStyle: Record<LogLevel, { color: string; bg: string; label: string }> = {
  INFO: { color: "text-emerald-600", bg: "bg-emerald-50", label: "INFO" },
  WARN: { color: "text-amber-600", bg: "bg-amber-50", label: "WARN" },
  ERRO: { color: "text-red-600", bg: "bg-red-50", label: "ERRO" },
  NET:  { color: "text-blue-600", bg: "bg-blue-50", label: "NET" },
  SYS:  { color: "text-slate-500", bg: "bg-slate-100", label: "SYS" },
};

function ConsoleLogsPanelComponent({
  logs, getStatsSnapshot, representations, isAutoQuality, activeScenario, streamTitle, compact = false,
}: ConsoleLogsPanelProps) {
  const {
    filter,
    setFilter,
    filteredLogs,
    downloadCsv,
    downloadText,
  } = useConsoleDownloads({
    logs,
    getStatsSnapshot,
    representations,
    isAutoQuality,
    activeScenario,
    streamTitle,
  });

  return (
    <div className={`bg-white rounded-lg border border-slate-200 flex flex-col ${compact ? "h-[280px]" : "h-[380px]"} shrink-0 overflow-hidden`}>
      <PanelHeader
        icon={<FaTerminal className="text-slate-400 w-3 h-3" />}
        title="CONSOLE LOGS"
        meta={<span className="text-[10px] text-slate-400 font-mono">({filteredLogs.length}/{logs.length})</span>}
        actions={(
          <div className="flex items-center gap-1.5">
            <button onClick={() => downloadCsv("logs")} title="Download logs CSV" className="h-6 min-w-7 px-1.5 rounded border border-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <span className="text-[9px] font-bold">LOG</span>
            </button>
            <button onClick={() => downloadCsv("qos")} title="Download QoS CSV" className="h-6 min-w-7 px-1.5 rounded border border-slate-100 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
              <span className="text-[9px] font-bold">QoS</span>
            </button>
            <button onClick={() => downloadCsv("qoe")} title="Download QoE CSV" className="h-6 min-w-7 px-1.5 rounded border border-slate-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <span className="text-[9px] font-bold">QoE</span>
            </button>
            <button onClick={downloadText} title="Download TXT" className="h-6 w-7 inline-flex items-center justify-center rounded border border-slate-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <FaDownload className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/70">
        {filteredLogs.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">No logs yet.</p>
        ) : (
          filteredLogs.map((log) => {
            const style = logStyle[log.level];
            return (
              <div key={log.id} className="border-b border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-slate-400 text-[10px] font-mono whitespace-nowrap">{log.timestamp}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${style.color} ${style.bg}`}>{style.label}</span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 whitespace-nowrap" title="Segment">
                    {log.segmentLabel}
                  </span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 whitespace-nowrap max-w-full truncate" title={log.statsSnapshot.protocolLabel}>
                    {log.statsSnapshot.protocolLabel}
                  </span>
                  {!compact && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap max-w-[9rem] truncate" title={log.streamTitle}>
                      {log.streamTitle}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-slate-700 text-[12px] leading-5 break-words whitespace-pre-wrap">
                  {log.message}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-slate-100">
        <div className="flex items-center gap-2 bg-slate-50 rounded px-2.5 py-1.5">
          <FaSearch className="text-slate-300 w-3 h-3 shrink-0" />
          <input
            value={filter} onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter logs..." className="bg-transparent text-[11px] text-slate-600 placeholder-slate-300 w-full outline-none"
          />
        </div>
      </div>
    </div>
  );
}

export const ConsoleLogsPanel = memo(ConsoleLogsPanelComponent);
ConsoleLogsPanel.displayName = "ConsoleLogsPanel";
