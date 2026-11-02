import { onMounted, onUnmounted } from "vue";

/**
 * Run a callback on an interval while the document is visible. Returning to a
 * visible tab runs it immediately, then restarts the interval.
 */
export function useIntervalWhenVisible(callback, intervalMs) {
  let timer = null;

  function stop() {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (document.visibilityState === "visible") {
      timer = window.setInterval(callback, intervalMs);
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      callback();
      start();
    } else {
      stop();
    }
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();
  });

  onUnmounted(() => {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}
