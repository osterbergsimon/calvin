import { computed, ref } from "vue";
import { defineStore } from "pinia";
import api from "../services/api";
import { getKioskId, isTopLevelPage } from "@/utils/kioskId";

// The pairing strip's poll (design §4): the browser reads its own state from
// GET .../pair every 10 seconds while a code is pending. That is the only
// timer: a paired, absent or failed answer stops it.
const POLL_MS = 10 * 1000;
// A browser-only screen starts pairing itself only after three config answers
// in a row, at least 3 minutes apart in total, all saying no agent has ever
// polled (design §14). That leaves a newly updated agent time to start first.
const BROWSER_ANSWERS = 3;
const BROWSER_SPAN_MS = 3 * 60 * 1000;

const pairPath = id => `/kiosks/${encodeURIComponent(id)}/pair`;
const sessionPath = id => `/kiosks/${encodeURIComponent(id)}/browser-session`;

/**
 * The kiosk's own pairing state (Task 13, calvin-0xns).
 *
 * The secret is never part of this store: `start(secret)` hands it to the
 * server once and the server answers with the HttpOnly cookie. From then on
 * the browser proves itself with the cookie, and the code this store exposes
 * is the one the server chose for that pending secret.
 */
export const usePairingStore = defineStore("kioskPairing", () => {
  // "none" | "pending" | "paired": the screen's own answer, never a guess.
  const state = ref("none");
  const code = ref(null);
  const expiresAt = ref(null);

  let started = false;
  let pollTimer = null;
  // Consecutive config answers with no agent; reset by any other answer.
  let streak = { count: 0, firstAt: 0 };

  const active = () => Boolean(getKioskId()) && isTopLevelPage();

  // The strip shows only for the top-level page of a kiosk with a pending code
  // (design spec §2.1). Every other case renders nothing and reserves nothing.
  const showStrip = computed(() => active() && state.value === "pending" && Boolean(code.value));

  const stopPolling = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const clear = () => {
    state.value = "none";
    code.value = null;
    expiresAt.value = null;
    stopPolling();
  };

  const resetStreak = () => {
    streak = { count: 0, firstAt: 0 };
  };

  const schedulePoll = () => {
    stopPolling();
    pollTimer = setTimeout(() => {
      poll();
    }, POLL_MS);
  };

  const apply = answer => {
    if (answer?.state === "pending" && typeof answer.code === "string" && answer.code) {
      state.value = "pending";
      code.value = answer.code;
      expiresAt.value = answer.expiresAt ?? null;
      schedulePoll();
      return;
    }
    if (answer?.state === "paired") {
      state.value = "paired";
      code.value = null;
      expiresAt.value = null;
      stopPolling();
      return;
    }
    clear();
  };

  /** Ask the server for this caller's own pairing state; quiet on failure. */
  const poll = async () => {
    const id = getKioskId();
    if (!id || !isTopLevelPage()) return null;
    try {
      const { data } = await api.get(pairPath(id));
      apply(data);
      return data;
    } catch {
      // An old server (404), a reset cookie (401) or a dropped network: the
      // strip stays away. There is no error state on the wall, and nothing is
      // logged (a pairing code or secret must never reach a log line).
      clear();
      return null;
    }
  };

  /** Post the fragment secret once, as a bearer, so the server sets the cookie. */
  const handOff = async secret => {
    const id = getKioskId();
    if (!secret || !id || !isTopLevelPage()) return;
    try {
      await api.post(sessionPath(id), null, {
        headers: { Authorization: `Bearer ${secret}` },
      });
    } catch {
      // Old server, setup not finished or a revoked secret: boot continues.
    }
  };

  const startBrowserOnly = async () => {
    const id = getKioskId();
    if (!id || !isTopLevelPage()) return;
    try {
      await api.post(pairPath(id), { browser: true });
      await poll();
    } catch {
      // setup_required, screen_has_agent or an old server: stay quiet.
    }
  };

  const noteBrowserOnly = async auth => {
    if (state.value === "pending") {
      resetStreak();
      return;
    }
    if (auth.state !== "unpaired" || auth.hasAgent !== false) {
      resetStreak();
      return;
    }
    if (streak.count === 0) streak.firstAt = Date.now();
    streak.count += 1;
    if (streak.count < BROWSER_ANSWERS) return;
    if (Date.now() - streak.firstAt < BROWSER_SPAN_MS) return;
    resetStreak();
    await startBrowserOnly();
  };

  /**
   * A config answer arrived (Task 5's `kioskAuth`). Absent means an old server:
   * nothing happens. Otherwise refresh the state on each answer, except while
   * the 10-second poll already owns it, and consider browser-only pairing.
   */
  const observeConfig = async auth => {
    if (!active() || !auth || typeof auth !== "object") return;
    if (state.value !== "pending") await poll();
    await noteBrowserOnly(auth);
  };

  /** Boot: hand off the fragment secret (if any), then read that state once. */
  const start = async (secret = null) => {
    if (started) return;
    started = true;
    if (!active()) return;
    if (!secret) return;
    await handOff(secret);
    await poll();
  };

  return { state, code, expiresAt, showStrip, start, poll, observeConfig };
});
