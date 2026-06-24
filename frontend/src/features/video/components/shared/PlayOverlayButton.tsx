import type { ReactNode } from "react";

interface PlayOverlayButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export function PlayOverlayButton({ icon, label, onClick }: PlayOverlayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute inset-0 flex items-center justify-center bg-black/20"
    >
      <span className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
        {icon}
      </span>
    </button>
  );
}
