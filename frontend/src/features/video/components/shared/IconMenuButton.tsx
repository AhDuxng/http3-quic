import type { ReactNode } from "react";

interface IconMenuButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export function IconMenuButton({ icon, label, onClick }: IconMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
      aria-label={label}
    >
      {icon}
    </button>
  );
}
