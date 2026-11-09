import { onScopeDispose, watch } from "vue";
import { useAuthStore, idleLabel } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";

// calvin-q4o8. A kiosk is a screen anyone can walk up to, so its admin session is
// short. The server enforces the limit (routes/auth.py); this keeps the page in
// step with it. It follows the session's kind from the server, not a ?kiosk= id,
// because an all-in-one kiosk and a kiosk behind a proxy have none. It signs out
// when the idle limit is up (the server allows a little longer, so this happens
// first and its message is true), feeds the server's clock while someone touches
// the screen or a display check this page started is running, and notices when
// the server ended the session.
export const KIOSK_IDLE_MS = 5 * 60 * 1000;
export const TOUCH_EVERY_MS = 20 * 1000;
export const STATUS_EVERY_MS = 30 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"];

// Long jobs that need the session without anyone touching the screen (a display
// check, where the owner works the panel's own buttons) hold it. One module-wide
// count, so any number of holders and the guard stay independent.
let holds = 0;
const holdListeners = new Set();

export function holdKioskSession() {
  holds += 1;
  holdListeners.forEach(fn => fn());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    holdListeners.forEach(fn => fn());
  };
}

export function useKioskSessionGuard({ router = null } = {}) {
  const auth = useAuthStore();
  let idleTimer = null;
  let statusTimer = null;
  let keepAliveTimer = null;
  let lastTouch = 0;
  let running = false;
  let ending = false;

  const idleMs = () => (auth.idleSeconds ? auth.idleSeconds * 1000 : KIOSK_IDLE_MS);

  function armIdle() {
    clearTimeout(idleTimer);
    if (holds > 0 || ending) return;
    idleTimer = setTimeout(endIdle, idleMs());
  }

  // Nothing should be left on the wall that asks for a password: back to the dashboard.
  function goHome() {
    if (router && router.currentRoute?.value?.path !== "/") router.push("/");
  }

  async function endIdle() {
    ending = true;
    const label = idleLabel(auth.idleSeconds);
    await auth.signOutIdle();
    stop();
    goHome();
    useNotificationsStore().notify({
      severity: "info",
      eyebrow: "Settings",
      message: `Signed out after ${label} without touch.`,
    });
  }

  async function sendTouch() {
    lastTouch = Date.now();
    if (!(await auth.touch())) endedByServer();
  }

  function endedByServer() {
    auth.noteSessionEnded();
    goHome();
  }

  function onActivity() {
    if (ending) return;
    armIdle();
    if (Date.now() - lastTouch >= TOUCH_EVERY_MS) sendTouch();
  }

  async function checkStatus() {
    const wasSignedIn = auth.authenticated;
    const data = await auth.fetchStatus();
    if (wasSignedIn && data && !data.authenticated) endedByServer();
  }

  // A hold starting or ending changes who owns the clock.
  function onHoldChange() {
    if (!running) return;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    if (holds > 0) {
      sendTouch();
      keepAliveTimer = setInterval(sendTouch, TOUCH_EVERY_MS);
    }
    armIdle();
  }

  function start() {
    if (running) return;
    running = true;
    ending = false;
    lastTouch = Date.now();
    ACTIVITY_EVENTS.forEach(name =>
      window.addEventListener(name, onActivity, { passive: true, capture: true })
    );
    statusTimer = setInterval(checkStatus, STATUS_EVERY_MS);
    holdListeners.add(onHoldChange);
    onHoldChange();
  }

  function stop() {
    running = false;
    clearTimeout(idleTimer);
    clearInterval(statusTimer);
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    holdListeners.delete(onHoldChange);
    ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, onActivity, true));
  }

  // Only a kiosk session, and only while signed in. A phone or desktop keeps its month.
  watch(
    () => [auth.authenticated, auth.sessionKind],
    ([signedIn, kind]) => {
      if (signedIn && kind === "kiosk") start();
      else stop();
    },
    { immediate: true }
  );
  onScopeDispose(stop);

  return { stop };
}
