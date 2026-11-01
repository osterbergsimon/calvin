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
 * only ever one light at a time.
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

/** Frame id of the whole-dashboard light. Region frames use the region id. */
export const APP_FRAME = "app";

/** Reload UI / service-worker update: from the tap until the new page is up. */
export const RELOAD_SOURCE_ID = "app:reload";

/** First load after a page load, until the dashboard has content. */
export const FIRST_LOAD_SOURCE_ID = "app:first-load";

export const useProgressStore = defineStore("progress", () => {
  // id → { value: null | 0..1, regionId: string | null }. Vue 3 reactive
  // collections track set/delete, so the getters below re-run on change.
  const sources = ref(new Map());
  // id → cap timer. Not reactive: only the engine reads it.
  const capTimers = new Map();
  // Frames whose light is currently showing (APP_FRAME or a region id).
  const visible = ref(new Set());
  // frame → { showTimer, hideTimer, shownAt }. Not reactive.
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

  const begin = (id, { determinate = false, regionId = null } = {}) => {
    clearCap(id);
    sources.value.set(id, { value: determinate ? 0 : null, regionId: regionId || null });
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
  const timersFor = frame => {
    let timers = frameTimers.get(frame);
    if (!timers) {
      timers = { showTimer: null, hideTimer: null, shownAt: 0 };
      frameTimers.set(frame, timers);
    }
    return timers;
  };

  const show = frame => {
    const timers = timersFor(frame);
    timers.showTimer = null;
    timers.shownAt = Date.now();
    visible.value.add(frame);
  };

  const hide = frame => {
    const timers = timersFor(frame);
    timers.hideTimer = null;
    visible.value.delete(frame);
    frameTimers.delete(frame);
  };

  const want = frame => {
    const timers = timersFor(frame);
    if (timers.hideTimer) {
      // Back-to-back work inside the linger window: keep the same light.
      clearTimeout(timers.hideTimer);
      timers.hideTimer = null;
    }
    if (visible.value.has(frame) || timers.showTimer) return;
    timers.showTimer = setTimeout(() => show(frame), PROGRESS_TIMING.showDelayMs);
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
    const untilMinimum = timers.shownAt + PROGRESS_TIMING.minVisibleMs - Date.now();
    const delay = Math.max(PROGRESS_TIMING.lingerMs, untilMinimum);
    timers.hideTimer = setTimeout(() => hide(frame), delay);
  };

  // Sync flush: the delay starts at the exact moment the work begins.
  watch(
    wantedFrame,
    frame => {
      for (const known of Array.from(frameTimers.keys())) {
        if (known !== frame) release(known);
      }
      if (frame) want(frame);
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
