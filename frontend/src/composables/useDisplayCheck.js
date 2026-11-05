import { computed, onScopeDispose, ref, unref, watch } from "vue";
import api from "@/services/api";
import { logError } from "@/utils/logger";

// Display check client (calvin-29ws, spec §10.2). One run per kiosk is stored
// by the backend; the agent reports into it and this composable polls it every
// 2 s while it is active. Every step is its own run.

export const POLL_MS = 2000;
export const WAITING_AFTER_S = 10;
export const SILENT_AFTER_S = 60;

const path = (id, tail = "") => `/kiosks/${encodeURIComponent(unref(id))}/display-check${tail}`;

export function useDisplayCheck(kioskId) {
  const run = ref(null);
  const error = ref("");
  const busy = ref(false);
  const now = ref(Date.now());
  const ownRunIds = new Set();
  let timer = null;
  let polling = false;

  const isActive = computed(() => Boolean(run.value?.active));
  const ownsRun = computed(() => Boolean(run.value && ownRunIds.has(run.value.id)));
  // A run another device started: watch it, and keep Stop (a safety action).
  const readOnly = computed(() => isActive.value && !ownsRun.value);

  const silence = computed(() => {
    if (!isActive.value) return "ok";
    const last = Date.parse(run.value.updatedAt || run.value.requestedAt || "");
    if (Number.isNaN(last)) return "ok";
    const seconds = (now.value - last) / 1000;
    if (seconds >= SILENT_AFTER_S) return "silent";
    return seconds >= WAITING_AFTER_S ? "waiting" : "ok";
  });

  async function load() {
    try {
      const response = await api.get(path(kioskId));
      run.value = response.data?.run ?? null;
    } catch (err) {
      logError("[displayCheck]", "Failed to read the display check", err);
    }
    now.value = Date.now();
  }

  async function start(step, extra = {}) {
    error.value = "";
    busy.value = true;
    try {
      const response = await api.post(path(kioskId, "/start"), { step, ...extra });
      run.value = response.data;
      ownRunIds.add(response.data.id);
      now.value = Date.now();
      return response.data;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && detail?.code === "display_check_active") {
        run.value = detail.run ?? run.value;
        now.value = Date.now();
        return null;
      }
      if (err?.response?.status !== 401) {
        error.value = "Couldn't start the check. Check the connection and try again.";
      }
      logError("[displayCheck]", "Failed to start", err);
      return null;
    } finally {
      busy.value = false;
    }
  }

  async function stop() {
    try {
      const response = await api.post(path(kioskId, "/stop"));
      run.value = response.data ?? run.value;
    } catch (err) {
      // 404: nothing is running any more, which is what Stop wanted.
      if (err?.response?.status !== 404) {
        error.value = "Couldn't stop the check. Try again.";
        logError("[displayCheck]", "Failed to stop", err);
      }
    }
  }

  async function saveLimit() {
    error.value = "";
    try {
      const response = await api.post(path(kioskId, "/save-limit"));
      return response.data;
    } catch (err) {
      error.value =
        err?.response?.status === 409
          ? "The check didn't find a limit to save."
          : "Couldn't save the limit. Try again.";
      logError("[displayCheck]", "Failed to save the limit", err);
      return null;
    }
  }

  // The owner's answer to "did it change?" is the one thing the agent cannot
  // see. An older backend without the endpoint is fine: the dialog keeps it.
  async function recordVerdict(writes) {
    error.value = "";
    try {
      await api.post(path(kioskId, "/verdict"), { writes });
      return true;
    } catch (err) {
      if ([404, 405].includes(err?.response?.status)) return true;
      error.value = "Couldn't save your answer. Try again.";
      logError("[displayCheck]", "Failed to record the verdict", err);
      return false;
    }
  }

  async function tick() {
    if (polling) return;
    polling = true;
    try {
      await load();
    } finally {
      polling = false;
    }
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(tick, POLL_MS);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // A dialog reopened while a run is still active: the watch below does not
  // fire (isActive never changed), so the caller restarts polling itself.
  function resume() {
    if (isActive.value) startTimer();
  }

  watch(isActive, active => (active ? startTimer() : stopTimer()), { immediate: true });
  onScopeDispose(stopTimer);

  return {
    run,
    error,
    busy,
    isActive,
    ownsRun,
    readOnly,
    silence,
    load,
    start,
    stop,
    saveLimit,
    recordVerdict,
    resume,
    dispose: stopTimer,
  };
}
