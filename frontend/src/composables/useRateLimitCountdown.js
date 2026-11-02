import { computed, onScopeDispose, ref } from "vue";

const format = seconds => {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

/**
 * A 429 countdown shared by the lock screen, the sign-in dialog and the
 * Security tab (CLV-9 §5).
 *
 * Ticks against an absolute deadline so a background tab that stops firing
 * timers doesn't drift: the next tick reads the real clock. Call `start()` with
 * the seconds from Retry-After when a request answers 429.
 */
export function useRateLimitCountdown() {
  const remainingSeconds = ref(0);
  const locked = computed(() => remainingSeconds.value > 0);
  const remaining = computed(() => format(remainingSeconds.value));

  let deadline = 0;
  let timer = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    remainingSeconds.value = left;
    if (left <= 0) clearTimer();
  };

  const start = seconds => {
    clearTimer();
    const wait = Number(seconds);
    const safe = Number.isFinite(wait) && wait > 0 ? wait : 0;
    deadline = Date.now() + safe * 1000;
    tick();
    if (remainingSeconds.value > 0) timer = setInterval(tick, 1000);
  };

  const reset = () => {
    clearTimer();
    deadline = 0;
    remainingSeconds.value = 0;
  };

  onScopeDispose(reset);

  return { locked, remaining, remainingSeconds, start, reset };
}
