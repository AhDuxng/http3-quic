import { useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement>(
  onOutsideClick: () => void,
  isEnabled = true,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isEnabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutsideClick();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isEnabled, onOutsideClick]);

  return ref;
}
