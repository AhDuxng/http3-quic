import type { ReactNode } from "react";

interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PanelHeader({ icon, title, meta, actions }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-[11px] font-bold tracking-widest text-slate-600 truncate">{title}</span>
        {meta}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
