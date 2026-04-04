// ConsoleLogsPanel.tsx — Panel hien thi log va xuat CSV/TXT
import { useState, useMemo } from "react";
import { FaTerminal, FaDownload, FaSearch } from "react-icons/fa";
import type { LogEntry, LogLevel, StreamStats } from "../type/dashPlayer";
import type { NetworkScenario } from "../../../type/video";
import { generateCSV, generateDetailedLog } from "../utils/csvExporter";

interface ConsoleLogsPanelProps {
  logs: LogEntry[];
  stats: StreamStats;
  representations: any[];
  isAutoQuality: boolean;
  activeScenario: NetworkScenario;
}

const LOG_STYLE: Record<LogLevel, { color: string; bg: string; label: string }> = {
  INFO: { color: "text-emerald-600", bg: "bg-emerald-50", label: "INFO" },
  WARN: { color: "text-amber-600", bg: "bg-amber-50", label: "WARN" },
  ERRO: { color: "text-red-600", bg: "bg-red-50", label: "ERRO" },
  NET:  { color: "text-blue-600", bg: "bg-blue-50", label: "NET" },
  SYS:  { color: "text-slate-500", bg: "bg-slate-100", label: "SYS" },
};

// Tai file xuong
function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([type.includes("csv") ? "\uFEFF" : "", content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ConsoleLogsPanel({
  logs, stats, representations, isAutoQuality, activeScenario,
}: ConsoleLogsPanelProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return logs;
    const kw = filter.toLowerCase();
    return logs.filter(
      (l) => l.message.toLowerCase().includes(kw)
        || l.level.toLowerCase().includes(kw)
        || l.statsSnapshot.protocolLabel.toLowerCase().includes(kw),
    );
  }, [logs, filter]);

  const ts = () => new Date().toISOString().replace(/[:.]/g, "-");

  const handleCSV = () => {
    if (filtered.length === 0) return;
    downloadFile(generateCSV(filtered), `adtube-metrics-${ts()}.csv`, "text/csv;charset=utf-8");
  };

  const handleTXT = () => {
    if (filtered.length === 0) return;
    const txt = generateDetailedLog({
      stats, isAutoQuality,
      scenarioLabel: activeScenario.label,
      scenarioSpeed: activeScenario.speedLabel,
      representations, logs: filtered,
    });
    downloadFile(txt, `adtube-logs-${ts()}.txt`, "text/plain");
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 flex flex-col h-[360px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <FaTerminal className="text-slate-400 w-3 h-3" />
          <span className="text-[11px] font-bold tracking-widest text-slate-600">CONSOLE LOGS</span>
          <span className="text-[10px] text-slate-400 font-mono">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCSV} title="Download CSV" className="text-slate-300 hover:text-emerald-500 transition-colors">
            <span className="text-[9px] font-bold">CSV</span>
          </button>
          <button onClick={handleTXT} title="Download TXT" className="text-slate-300 hover:text-blue-500 transition-colors">
            <FaDownload className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Danh sach log */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-50">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">No logs yet.</p>
        ) : (
          filtered.map((log) => {
            const s = LOG_STYLE[log.level];
            return (
              <div key={log.id} className="grid grid-cols-[64px_44px_96px_minmax(0,1fr)] gap-2 px-3 py-2 hover:bg-slate-50 transition-colors items-start">
                <span className="text-slate-400 text-[10px] font-mono whitespace-nowrap pt-0.5">{log.timestamp}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 h-fit ${s.color} ${s.bg}`}>{s.label}</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 whitespace-nowrap" title="Protocol">
                  {log.statsSnapshot.protocolLabel}
                </span>
                <span className="text-slate-600 text-[11px] leading-relaxed break-words min-w-0">{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Bo loc */}
      <div className="shrink-0 px-3 py-2 border-t border-slate-100">
        <div className="flex items-center gap-2 bg-slate-50 rounded px-2.5 py-1.5">
          <FaSearch className="text-slate-300 w-3 h-3 shrink-0" />
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..." className="bg-transparent text-[11px] text-slate-600 placeholder-slate-300 w-full outline-none"
          />
        </div>
      </div>
    </div>
  );
}
