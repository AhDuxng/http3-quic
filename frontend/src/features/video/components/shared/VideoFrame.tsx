import type { ReactNode } from "react";

interface VideoFrameProps {
  children: ReactNode;
}

export function VideoFrame({ children }: VideoFrameProps) {
  return (
    <div className="relative bg-black rounded-lg overflow-hidden w-full group">
      {children}
    </div>
  );
}
