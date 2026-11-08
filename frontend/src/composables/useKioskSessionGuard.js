import { onScopeDispose, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getKioskId } from "@/utils/kioskId";

// calvin-q4o8. A kiosk is a screen anyone can walk up to, so its admin session
// is short. The server enforces the limit (routes/auth.py); this keeps the page
// in step with it: it signs out after 5 minutes without a touch, keeps the
// server's clock fed while someone is using the screen, and notices when the
// server ended the session (the screen went to sleep).
export const KIOSK_IDLE_MS = 5 * 60 * 1000;
export const TOUCH_EVERY_MS = 20 * 1000;
export const STATUS_EVERY_MS = 30 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"];

export function useKioskSessionGuard() {
  const auth = useAuthStore();
  let idleTimer = null;
  let statusTimer = null;
  let lastTouch = 0;
  let running = false;

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => auth.signOutIdle(), KIOSK_IDLE_MS);
  }

  async function onActivity() {
    armIdle();
    const now = Date.now();
    if (now - lastTouch < TOUCH_EVERY_MS) return;
    lastTouch = now;
    if (!(await auth.touch())) auth.noteSessionEnded();
  }

  async function checkStatus() {
    const wasSignedIn = auth.authenticated;
    const data = await auth.fetchStatus();
    if (wasSignedIn && data && !data.authenticated) auth.noteSessionEnded();
  }

  function start() {
    if (running) return;
    running = true;
    lastTouch = Date.now();
    armIdle();
    ACTIVITY_EVENTS.forEach(name =>
      window.addEventListener(name, onActivity, { passive: true, capture: true })
    );
    statusTimer = setInterval(checkStatus, STATUS_EVERY_MS);
  }

  function stop() {
    running = false;
    clearTimeout(idleTimer);
    clearInterval(statusTimer);
    ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, onActivity, true));
  }

  // Only a kiosk, and only while signed in. A phone or desktop keeps its month.
  watch(
    () => auth.authenticated,
    signedIn => {
      if (signedIn && getKioskId()) start();
      else stop();
    },
    { immediate: true }
  );
  onScopeDispose(stop);

  return { stop };
}
