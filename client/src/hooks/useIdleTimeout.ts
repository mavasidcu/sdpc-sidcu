import { useEffect, useRef, useCallback } from "react";

const IDLE_MS = 15 * 60 * 1000;   // 15 min → logout
const WARN_MS = 14 * 60 * 1000;   // 14 min → aviso

const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export function useIdleTimeout(onIdle: () => void, onWarn: () => void, onActivity: () => void) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    onActivity();

    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);

    warnTimer.current = setTimeout(onWarn, WARN_MS);
    idleTimer.current = setTimeout(onIdle, IDLE_MS);
  }, [onIdle, onWarn, onActivity]);

  useEffect(() => {
    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [reset]);
}
