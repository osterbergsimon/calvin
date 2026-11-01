import { onBeforeUnmount, watch } from "vue";
import { FIRST_LOAD_SOURCE_ID, useProgressStore } from "../stores/progress";

/**
 * First load after a page load lights the app frame until the dashboard has
 * content (CLV-115). Runs once per page load: navigating back to the dashboard
 * later is not a first load.
 *
 * The dashboard calls `contentReady()` once its config is in. The async region
 * components then get `settleMs` to mount and start their own fetches; the
 * light ends as soon as nothing but the first load itself is still working.
 */

let started = false;
let finished = false;

export function useFirstLoadLight({ settleMs = 600 } = {}) {
  const progress = useProgressStore();
  let settleTimer = null;
  let stopWatch = null;

  const finish = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
    stopWatch?.();
    stopWatch = null;
    if (finished) return;
    finished = true;
    progress.end(FIRST_LOAD_SOURCE_ID);
  };

  if (!started) {
    started = true;
    progress.begin(FIRST_LOAD_SOURCE_ID);
  }

  const contentReady = () => {
    if (finished || settleTimer || stopWatch) return;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      stopWatch = watch(
        () => progress.activeIds.every(id => id === FIRST_LOAD_SOURCE_ID),
        idle => {
          if (idle) finish();
        },
        { immediate: true }
      );
    }, settleMs);
  };

  // Leaving the dashboard before it settled: there is no dashboard to fill.
  onBeforeUnmount(finish);

  return { contentReady };
}

export function _resetFirstLoadLightForTests() {
  started = false;
  finished = false;
}
