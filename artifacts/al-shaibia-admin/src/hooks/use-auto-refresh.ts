import { useEffect, useRef } from "react";

export function useAutoRefresh(fn: () => Promise<void>, intervalMs = 3000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    function tick() {
      fnRef.current().catch(() => {});
    }

    function startInterval() {
      timerId = setInterval(tick, intervalMs);
    }

    function stopInterval() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopInterval();
      } else {
        if (timerId === null) startInterval();
      }
    }

    if (!document.hidden) startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}
