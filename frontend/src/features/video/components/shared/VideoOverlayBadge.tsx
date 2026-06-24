import type { ReactNode } from "react";

interface VideoOverlayBadgeProps {
  children: ReactNode;
  className?: string;
}

export function VideoOverlayBadge({ children, className = "" }: VideoOverlayBadgeProps) {
  return (
    <div className={`flex items-center gap-1.5 bg-black/70 rounded px-2.5 py-1 ${className}`}>
      {children}
    </div>
  );
}
