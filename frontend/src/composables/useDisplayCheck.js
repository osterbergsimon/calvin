import { computed, onScopeDispose, ref, unref, watch } from "vue";
import api from "@/services/api";
import { logError } from "@/utils/logger";

// Display check client (calvin-29ws, spec §10.2). One run per kiosk is stored
// by the backend; the agent reports into it and this composable polls it every
// 2 s while it is active. Every step is its own run.

export const POLL_MS = 2000;
export const WAITING_AFTER_S = 10;
export const SILENT_AFTER_S = 60;

// The run ids this browser started survive a reload, so the dialog still knows
// its own run and does not treat it as another device's. Storage can be
// blocked or empty: every access is guarded.
const OWN_RUNS_KEY = "calvin_display_check_own_runs";
function readOwnRuns() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(OWN_RUNS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === "string") : [];
  } catch {
    return [];
  }
}
function writeOwnRuns(ids) {
  try {
    window.sessionStorage.setItem(OWN_RUNS_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // Storage is blocked: the run is simply not remembered after a reload.
  }
}

const path = (id, tail = "") => `/kiosks/${encodeURIComponent(unref(id))}/display-check${tail}`;

export function useDisplayCheck(kioskId) {
  const run = ref(null);
  const error = ref("");
  const busy = ref(false);
  const now = ref(Date.now());
  // When this browser last asked the agent for something. A step is the agent's
  // turn to answer, and a long wait between steps is the owner's, not silence.
  const askedAt = ref(0);
  const ownRunIds = ref(readOwnRuns());
  let timer = null;
  let polling = false;

  const isActive = computed(() => Boolean(run.value?.active));
  const ownsRun = computed(() => Boolean(run.value && ownRunIds.value.includes(run.value.id)));
  // A run another device started: watch it, and keep Stop (a safety action).
  const readOnly = computed(() => isActive.value && !ownsRun.value);

  const silence = computed(() => {
    if (!isActive.value) return "ok";
    const reported = Date.parse(run.value.updatedAt || run.value.requestedAt || "");
    const last = Math.max(Number.isNaN(reported) ? 0 : reported, askedAt.value);
    if (!last) return "ok";
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

  const capMessage = max =>
    `That's above this screen's safe limit. The most Calvin can set is ${max}.`;
  // The run's own ceiling (calvin-c805): a fault or the start level caps a check.
  const ceilingMessage = max =>
    `That's above what's safe for this check. The most Calvin can set is ${max}.`;
  // Both 422s mean "too high"; the ceiling is the run's, the limit is the screen's.
  function aboveCap(detail) {
    if (detail?.code === "value_above_ceiling") return ceilingMessage(detail.max);
    if (detail?.code === "value_above_limit") return capMessage(detail.max);
    return "";
  }

  async function start(step, extra = {}) {
    error.value = "";
    busy.value = true;
    try {
      const response = await api.post(path(kioskId, "/start"), { step, ...extra });
      run.value = response.data;
      if (!ownRunIds.value.includes(response.data.id)) {
        ownRunIds.value = [...ownRunIds.value, response.data.id];
        writeOwnRuns(ownRunIds.value);
      }
      now.value = Date.now();
      askedAt.value = now.value;
      return response.data;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && detail?.code === "display_check_active") {
        run.value = detail.run ?? run.value;
        now.value = Date.now();
        return null;
      }
      if (err?.response?.status === 422 && aboveCap(detail)) {
        error.value = aboveCap(detail);
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

  // Moves the running session to another step (and value). The result says what
  // happened: ok, gone (no active run any more), stopping, or capped by the limit.
  async function changeStep(step, value) {
    error.value = "";
    const body = value === undefined || value === null ? { step } : { step, value };
    try {
      const response = await api.post(path(kioskId, "/step"), body);
      run.value = response.data ?? run.value;
      now.value = Date.now();
      askedAt.value = now.value;
      return { ok: true, run: response.data ?? null };
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 404) return { gone: true };
      if (status === 409 && detail?.code === "display_check_stopping") {
        error.value = "The check is already stopping. Start a new one when it has ended.";
        return { stopping: true };
      }
      if (status === 422 && aboveCap(detail)) {
        error.value = aboveCap(detail);
        return { capped: true, max: detail.max };
      }
      if (status !== 401)
        error.value = "Couldn't change the step. Check the connection and try again.";
      logError("[displayCheck]", "Failed to change the step", err);
      return { failed: true };
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

  // What the screen's own menu showed before Calvin changed anything (unknown
  // start). The run keeps it; it can only raise the check's base level.
  async function recordMenuAtStart(menu) {
    error.value = "";
    try {
      const response = await api.post(path(kioskId, "/menu-at-start"), { menu });
      run.value = response.data ?? run.value;
      return true;
    } catch (err) {
      // 404: the run ended meanwhile; nothing more to record.
      if (err?.response?.status === 404) return true;
      error.value = "Couldn't save that value. Try again.";
      logError("[displayCheck]", "Failed to record the menu at start", err);
      return false;
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
    changeStep,
    stop,
    saveLimit,
    recordVerdict,
    recordMenuAtStart,
    resume,
    dispose: stopTimer,
  };
}
