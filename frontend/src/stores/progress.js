import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { logError } from "../utils/logger";

/**
 * Loading-light engine (CLV-115, docs/design/2026-11-01-loading-light.md).
 *
 * Decides *what* is loading, *where* the light shows and *when*. Indicators
 * (Comet, Pulse) only draw; every style behaves the same because the timing
 * lives here, not in callers.
 *
 * Sources are keyed by id. `begin(id, { regionId })` puts a source on that
 * region's frame; without a regionId it belongs to the app frame (the whole
 * dashboard perimeter). Two or more regions loading at once promote to one app
 * light, and any app source takes the light over from a region, so there is
 * only ever one light at a time. A light that is already showing moves to the
 * new frame at once (no second light, no dark gap); only a light that never
 * showed waits out the 400 ms delay. Handing the app light back to a region
 * waits for the change to settle, so it never moves after all work has ended.
 */

export const PROGRESS_TIMING = Object.freeze({
  // Show only when a source is still active this long after it began.
  showDelayMs: 400,
  // Once shown, keep it at least this long so it never blinks.
  minVisibleMs: 800,
  // Hide this long after the frame's last source ends; a fetch starting inside
  // the window keeps the same light going instead of strobing.
  lingerMs: 300,
  // Hard stop per source: a stuck fetch never spins forever.
  sourceCapMs: 60_000,
});

/** Screen switches light at once and may use a shorter minimum than fetches. */
export const SCREEN_SWITCH_TIMING = Object.freeze({
  // A switch is a held interaction: show long enough to read, but not the full
  // 800 ms a background fetch earns.
  minVisibleMs: 300,
});

/** Frame id of the whole-dashboard light. Region frames use the region id. */
export const APP_FRAME = "app";

/** Indicator styles a screen can pick (config key `loadingLight`). */
export const LOADING_LIGHT_STYLES = Object.freeze(["comet", "pulse", "off"]);

/** Reload UI / service-worker update: from the tap until the new page is up. */
export const RELOAD_SOURCE_ID = "app:reload";

/** First load after a page load, until the dashboard has content. */
export const FIRST_LOAD_SOURCE_ID = "app:first-load";

/** Switching dashboard screens: from the tap until the new screen has painted. */
export const SCREEN_SWITCH_SOURCE_ID = "app:screen-switch";

export const useProgressStore = defineStore("progress", () => {
  // id → { value: null | 0..1, regionId: string | null }. Vue 3 reactive
  // collections track set/delete, so the getters below re-run on change.
  const sources = ref(new Map());
  // id → cap timer. Not reactive: only the engine reads it.
  const capTimers = new Map();
  // Frames whose light is currently showing (APP_FRAME or a region id).
  const visible = ref(new Set());
  // frame → timing state (see timersFor). Not reactive.
  const frameTimers = new Map();
  let trackSeq = 0;

  const clearCap = id => {
    const timer = capTimers.get(id);
    if (timer) clearTimeout(timer);
    capTimers.delete(id);
  };

  const end = id => {
    clearCap(id);
    sources.value.delete(id);
  };

  const begin = (
    id,
    { determinate = false, regionId = null, immediate = false, minVisibleMs = null } = {}
  ) => {
    clearCap(id);
    sources.value.set(id, {
      value: determinate ? 0 : null,
      regionId: regionId || null,
      immediate,
      minVisibleMs,
    });
    capTimers.set(
      id,
      setTimeout(() => {
        logError(
          "[Progress]",
          `Source "${id}" still loading after ${PROGRESS_TIMING.sourceCapMs / 1000} s; ending its light`,
          { regionId: regionId || null }
        );
        end(id);
      }, PROGRESS_TIMING.sourceCapMs)
    );
    // A frame that is already wanted does not re-fire the scope watcher, so an
    // immediate source lights it here. Ordinary sources keep waiting out the
    // watch's show delay.
    if (immediate) {
      const frame = wantedFrame.value;
      if (frame) want(frame, { dueAt: Date.now(), minVisibleMs });
    }
  };

  const setProgress = (id, value) => {
    const entry = sources.value.get(id);
    if (!entry) return;
    sources.value.set(id, { ...entry, value: Math.max(0, Math.min(1, value)) });
  };

  /**
   * Hold the light while `work` runs; ends the source however it settles (a
   * failing source must end, and its own error UI speaks instead). Each call
   * gets its own slot, so overlapping calls under one id don't cut each other
   * short.
   */
  const track = async (id, work, options = {}) => {
    trackSeq += 1;
    const slot = `${id}#${trackSeq}`;
    begin(slot, options);
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      end(slot);
    }
  };

  // True while any source is doing work.
  const active = computed(() => sources.value.size > 0);
  const activeIds = computed(() => Array.from(sources.value.keys()));
  const isActive = id => sources.value.has(id);

  // ── Scope: which frame wants the light right now ─────────────────────────
  const wantedFrame = computed(() => {
    if (!sources.value.size) return null;
    const regions = new Set();
    for (const { regionId } of sources.value.values()) {
      if (!regionId) return APP_FRAME;
      regions.add(regionId);
    }
    return regions.size === 1 ? regions.values().next().value : APP_FRAME;
  });

  // ── Timing: a small state machine per frame ──────────────────────────────
  // frame → { showTimer, showDueAt, hideTimer, shownAt }
  const timersFor = frame => {
    let timers = frameTimers.get(frame);
    if (!timers) {
      timers = { showTimer: null, showDueAt: 0, hideTimer: null, shownAt: 0 };
      frameTimers.set(frame, timers);
    }
    return timers;
  };

  const clearFrame = frame => {
    const timers = frameTimers.get(frame);
    if (!timers) return;
    if (timers.showTimer) clearTimeout(timers.showTimer);
    if (timers.hideTimer) clearTimeout(timers.hideTimer);
    frameTimers.delete(frame);
  };

  const show = frame => {
    const timers = timersFor(frame);
    timers.showTimer = null;
    timers.shownAt = Date.now();
    visible.value.add(frame);
  };

  const hide = frame => {
    clearFrame(frame);
    visible.value.delete(frame);
  };

  /**
   * Move a light that is already showing to another frame in one step: the new
   * frame lights now, keeps the original `shownAt` (so the 800 ms minimum
   * counts from when the light first appeared) and the old frame goes dark in
   * the same mutation. No second light, no dark gap, no fresh 400 ms delay.
   */
  const moveLight = (from, to, minVisibleMs = null) => {
    const { shownAt } = timersFor(from);
    clearFrame(from);
    clearFrame(to);
    const timers = timersFor(to);
    timers.shownAt = shownAt;
    if (minVisibleMs != null) timers.minVisibleMs = minVisibleMs;
    const next = new Set(visible.value);
    next.delete(from);
    next.add(to);
    visible.value = next;
  };

  // `dueAt`: when the show delay that began with the work runs out. A frame
  // taking over from one that never showed inherits that deadline, so the
  // 400 ms counts from the first begin, not from the promotion. An immediate
  // source has already run out its delay: it shows now, even if an ordinary
  // source's timer was already waiting.
  const want = (frame, { dueAt, minVisibleMs = null } = {}) => {
    const timers = timersFor(frame);
    if (minVisibleMs != null) timers.minVisibleMs = minVisibleMs;
    if (timers.hideTimer) {
      // Back-to-back work inside the linger window: keep the same light.
      clearTimeout(timers.hideTimer);
      timers.hideTimer = null;
    }
    if (visible.value.has(frame)) return;
    const deadline = dueAt ?? Date.now() + PROGRESS_TIMING.showDelayMs;
    if (deadline <= Date.now()) {
      if (timers.showTimer) {
        clearTimeout(timers.showTimer);
        timers.showTimer = null;
      }
      show(frame);
      return;
    }
    if (timers.showTimer) return;
    timers.showDueAt = deadline;
    timers.showTimer = setTimeout(() => show(frame), Math.max(0, deadline - Date.now()));
  };

  // Timing asked for by the sources currently loading on `frame` (a region
  // source counts on the app frame once two regions promote the light there).
  const sourceTiming = frame => {
    let immediate = false;
    let minVisibleMs = null;
    for (const entry of sources.value.values()) {
      if (frame !== APP_FRAME && entry.regionId !== frame) continue;
      if (entry.immediate) immediate = true;
      if (entry.minVisibleMs != null) {
        minVisibleMs =
          minVisibleMs == null ? entry.minVisibleMs : Math.min(minVisibleMs, entry.minVisibleMs);
      }
    }
    return { immediate, minVisibleMs };
  };

  const release = frame => {
    const timers = frameTimers.get(frame);
    if (!timers) return;
    if (timers.showTimer) {
      // Finished before the delay: never shown.
      clearTimeout(timers.showTimer);
      timers.showTimer = null;
    }
    if (!visible.value.has(frame)) {
      frameTimers.delete(frame);
      return;
    }
    if (timers.hideTimer) return;
    const minVisibleMs = timers.minVisibleMs ?? PROGRESS_TIMING.minVisibleMs;
    const untilMinimum = timers.shownAt + minVisibleMs - Date.now();
    const delay = Math.max(PROGRESS_TIMING.lingerMs, untilMinimum);
    timers.hideTimer = setTimeout(() => hide(frame), delay);
  };

  // App → region handback waits for the change to settle (one macrotask):
  // when sources end one after another in the same tick, the scope passes
  // through a lone region on its way to "nothing loading", and moving the
  // light there would make it jump from the perimeter to a region after all
  // work has finished. Until then the app light simply stays where it is.
  let handbackTimer = null;
  const cancelHandback = () => {
    if (handbackTimer) clearTimeout(handbackTimer);
    handbackTimer = null;
  };
  const settleHandback = () => {
    handbackTimer = null;
    const target = wantedFrame.value;
    if (!target || target === APP_FRAME || visible.value.has(target)) return;
    if (visible.value.has(APP_FRAME)) {
      moveLight(APP_FRAME, target);
    } else {
      // The app light's hide timer ran before this settled: the light is
      // already dark, so the region waits out a fresh show delay instead of
      // running with no light at all.
      want(target);
    }
  };

  // Sync flush: the delay starts at the exact moment the work begins.
  watch(
    wantedFrame,
    frame => {
      cancelHandback();
      const others = Array.from(frameTimers.keys()).filter(known => known !== frame);
      if (
        frame &&
        frame !== APP_FRAME &&
        !visible.value.has(frame) &&
        visible.value.has(APP_FRAME)
      ) {
        handbackTimer = setTimeout(settleHandback, 0);
        for (const known of others) if (known !== APP_FRAME) release(known);
        return;
      }
      if (frame && !visible.value.has(frame)) {
        const timing = sourceTiming(frame);
        const lit = others.find(known => visible.value.has(known));
        if (lit) {
          moveLight(lit, frame, timing.minVisibleMs);
        } else {
          const pending = others
            .map(known => frameTimers.get(known))
            .filter(timers => timers.showTimer)
            .map(timers => timers.showDueAt);
          want(frame, {
            dueAt: timing.immediate
              ? Date.now()
              : pending.length
                ? Math.min(...pending)
                : undefined,
            minVisibleMs: timing.minVisibleMs,
          });
        }
      } else if (frame) {
        want(frame, { minVisibleMs: sourceTiming(frame).minVisibleMs });
      }
      for (const known of others) release(known);
    },
    { flush: "sync", immediate: true }
  );

  const isFrameVisible = frame => visible.value.has(frame);
  const appVisible = computed(() => visible.value.has(APP_FRAME));
  const visibleFrames = computed(() => Array.from(visible.value));

  // Overall progress only when *every* active source reports a number; a single
  // indeterminate source makes the whole thing indeterminate. Reserved for a
  // determinate mode — the indicators ignore it today.
  const progress = computed(() => {
    const values = Array.from(sources.value.values(), entry => entry.value);
    if (!values.length || values.some(v => v == null)) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  });

  // ── Playful (opt-in, stubbed) ─────────────────────────────────────────────
  // One-shot celebratory laps (day rollover, photo change) will push a
  // transient token here so the comet does a single flourish. Inert for now.
  const pulse = (_kind = "lap") => {
    /* playful-ready: intentionally a no-op until the flourish is wired */
  };

  return {
    begin,
    end,
    track,
    setProgress,
    pulse,
    active,
    activeIds,
    isActive,
    progress,
    isFrameVisible,
    appVisible,
    visibleFrames,
  };
});
