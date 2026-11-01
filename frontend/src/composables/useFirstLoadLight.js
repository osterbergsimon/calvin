import { nextTick, onBeforeUnmount, reactive, watch } from "vue";
import { FIRST_LOAD_SOURCE_ID, useProgressStore } from "../stores/progress";

/**
 * First load after a page load lights the app frame until the dashboard has
 * content (CLV-115). Runs once per page load: navigating back to the dashboard
 * later is not a first load.
 *
 * The dashboard calls `contentReady()` once its config is in. Each region with
 * something to load reports itself (`expectFirstLoadRegion`) and, once its
 * lazily loaded content component has mounted and started its fetch,
 * `firstLoadRegionMounted`. The light waits for every expected region to mount
 * (however slow its chunk is on a Pi), then ends as soon as nothing but the
 * first load itself is still working. A region that never mounts cannot hold
 * the light past `maxWaitMs`.
 */

let started = false;
let finished = false;
const expected = reactive(new Set());
const mounted = reactive(new Set());

const regionsPending = () => Array.from(expected).some(id => !mounted.has(id));

/** A region with content to load: the first load waits for it to mount. */
export function expectFirstLoadRegion(regionId) {
  if (!finished && regionId) expected.add(regionId);
}

/** That region's content component has mounted (and begun its fetch). */
export function firstLoadRegionMounted(regionId) {
  if (regionId) mounted.add(regionId);
}

/** The region went away (screen switch, unmount): stop waiting for it. */
export function forgetFirstLoadRegion(regionId) {
  expected.delete(regionId);
  mounted.delete(regionId);
}

export function useFirstLoadLight({ maxWaitMs = 10_000 } = {}) {
  const progress = useProgressStore();
  let waiting = false;
  let capTimer = null;
  let yieldTimer = null;
  let stopWaitWatch = null;
  let stopIdleWatch = null;

  const clearWaiting = () => {
    if (capTimer) clearTimeout(capTimer);
    if (yieldTimer) clearTimeout(yieldTimer);
    capTimer = null;
    yieldTimer = null;
    stopWaitWatch?.();
    stopWaitWatch = null;
  };

  const finish = () => {
    clearWaiting();
    stopIdleWatch?.();
    stopIdleWatch = null;
    if (finished) return;
    finished = true;
    progress.end(FIRST_LOAD_SOURCE_ID);
  };

  const watchIdle = () => {
    clearWaiting();
    if (finished || stopIdleWatch) return;
    stopIdleWatch = watch(
      () => progress.activeIds.every(id => id === FIRST_LOAD_SOURCE_ID),
      idle => {
        if (idle) finish();
      },
      { immediate: true }
    );
  };

  if (!started) {
    started = true;
    progress.begin(FIRST_LOAD_SOURCE_ID);
  }

  const contentReady = () => {
    if (finished || waiting) return;
    waiting = true;
    capTimer = setTimeout(watchIdle, maxWaitMs);
    // The regions render on the next flush and report themselves then.
    nextTick(() => {
      if (finished || stopIdleWatch) return;
      stopWaitWatch = watch(
        regionsPending,
        pending => {
          if (pending || yieldTimer) return;
          // One macrotask so fetches the mounted regions start asynchronously
          // (vue-query) have begun before we look for idle.
          yieldTimer = setTimeout(watchIdle, 0);
        },
        { immediate: true }
      );
    });
  };

  // Leaving the dashboard before it settled: there is no dashboard to fill.
  onBeforeUnmount(finish);

  return { contentReady };
}

export function _resetFirstLoadLightForTests() {
  started = false;
  finished = false;
  expected.clear();
  mounted.clear();
}
