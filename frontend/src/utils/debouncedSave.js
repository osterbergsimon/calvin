// One settings control's writes, coalesced into a single save (calvin-g25v).
//
// Settings controls apply their new value locally before they save, so the UI
// must never wait for the round-trip. Rapid taps on the same control (or two
// edits close together) are common on a slow kiosk; this keeps the save count
// at one and sends the value the user finally chose.

/** Quiet period before a queued value is sent. */
export const SAVE_DEBOUNCE_MS = 300;

/**
 * @param {{ save: (payload: any) => Promise<any>, delay?: number }} options
 *   save: the network write for one payload. It is called at most once per
 *   quiet period, and never concurrently.
 * @returns {{
 *   schedule: (payload: any) => Promise<any>,
 *   flush: () => Promise<void>,
 *   cancel: () => void,
 *   pending: boolean,
 * }}
 *   schedule replaces any not-yet-sent payload and resolves (or rejects) when
 *   the save that includes it settles. flush sends a queued payload now.
 */
export function createDebouncedSave({ save, delay = SAVE_DEBOUNCE_MS } = {}) {
  let timer = null;
  let payload;
  let hasPayload = false;
  let running = false;
  let waiters = [];

  const settle = (waiting, ok, outcome) => {
    for (const waiter of waiting) {
      if (ok) waiter.resolve(outcome);
      else waiter.reject(outcome);
    }
  };

  const run = async () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // A save already in flight will pick up the newer payload when it finishes.
    if (running || !hasPayload) return;

    const current = payload;
    payload = undefined;
    hasPayload = false;
    // Only callers whose write is part of this save settle with it; a write
    // made while it is in flight waits for the follow-up save.
    const waiting = waiters;
    waiters = [];
    running = true;
    try {
      const result = await save(current);
      settle(waiting, true, result);
    } catch (err) {
      settle(waiting, false, err);
    } finally {
      running = false;
      if (hasPayload && timer === null) {
        timer = setTimeout(run, delay);
      }
    }
  };

  const schedule = next => {
    payload = next;
    hasPayload = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, delay);
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  };

  const flush = async () => {
    await run();
  };

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    payload = undefined;
    hasPayload = false;
    const waiting = waiters;
    waiters = [];
    settle(waiting, true, undefined);
  };

  return {
    schedule,
    flush,
    cancel,
    get pending() {
      return running || hasPayload;
    },
  };
}
