// One optimistic save queue per target (calvin-g25v).
//
// A target is the object a page writes as a whole: the settings form's config,
// or one kiosk's overrides. The queue keeps the last server-acknowledged
// `confirmed` object separate from the changed keys still waiting to be saved,
// so a failure can roll back only the values that actually failed and a later
// server update is still shown.
//
// There is at most one save in flight per target. Writes made while it runs are
// merged into the next save; that save carries every pending key on top of the
// confirmed object, so two controls cannot clobber each other.

import { computed, ref } from "vue";

/** Quiet period before a queued change is sent. */
export const SAVE_DEBOUNCE_MS = 300;

const clone = value => ({ ...(value || {}) });
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * @param {{
 *   initial?: object,
 *   loaded?: boolean,
 *   load?: () => Promise<object>,
 *   save: (batch: {
 *     changes: object,
 *     deleted: string[],
 *     snapshot: object,
 *     merge: boolean,
 *   }, options: { keepalive: boolean }) => Promise<any>,
 *   onError?: (err: any, batch: object) => void,
 *   delay?: number,
 * }} options
 */
export function createOptimisticQueue({
  initial = {},
  loaded = true,
  load = null,
  save,
  onError,
  delay = SAVE_DEBOUNCE_MS,
} = {}) {
  const confirmed = ref(clone(initial));
  const pending = ref({}); // changed keys: confirmed value -> optimistic value
  const deleted = ref({}); // keys removed from the target
  const saving = ref(false);

  const versions = new Map();
  // Keys whose pending value came from a partial write (`setPartial` with
  // `merge: true`). A batch made only of those can be sent as a merge instead
  // of a whole-target replace; a whole-target write or a deletion is not.
  const mergeable = new Set();
  let isLoaded = loaded;
  let timer = null;
  let running = false;
  let currentRun = null;
  let flushRequested = false;
  // True while a flush made on page close runs: the save then asks the browser
  // to finish the request even if the page is gone (fetch keepalive).
  let keepaliveFlush = false;
  let waiters = [];

  const display = computed(() => {
    const result = clone(confirmed.value);
    for (const key of Object.keys(deleted.value)) delete result[key];
    return { ...result, ...pending.value };
  });

  const pendingKeys = () => {
    const keys = new Set(Object.keys(pending.value));
    for (const key of Object.keys(deleted.value)) keys.add(key);
    return [...keys];
  };

  const hasPending = () => pendingKeys().length > 0;

  const bump = key => {
    versions.set(key, (versions.get(key) || 0) + 1);
  };

  const versionOf = key => versions.get(key) || 0;

  const settle = (batchWaiters, ok, outcome) => {
    for (const waiter of batchWaiters) {
      if (ok) waiter.resolve(outcome);
      else waiter.reject(outcome);
    }
  };

  // After a successful save, a caller whose key was tapped again while it was in
  // flight has not had its latest value saved: it keeps waiting for the save that
  // carries it instead of resolving with the earlier one (calvin-msa8).
  const settleSent = (batchWaiters, outcome, sentVersions) => {
    const superseded = [];
    const done = [];
    for (const waiter of batchWaiters) {
      const retapped = [...waiter.keys].filter(key => versionOf(key) !== sentVersions.get(key));
      if (retapped.length === 0) {
        done.push(waiter);
      } else {
        // Wait only for the re-tapped keys: the next save carries just those, and
        // a waiter naming keys it never sends would not be picked up again.
        superseded.push({ ...waiter, keys: retapped });
      }
    }
    if (superseded.length > 0) waiters = [...superseded, ...waiters];
    settle(done, true, outcome);
  };

  const performSave = async () => {
    if (running || !hasPending()) {
      if (!running && !hasPending()) saving.value = false;
      return;
    }

    running = true;
    saving.value = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    let sentKeys = pendingKeys();
    let sentPending = clone(pending.value);
    let sentDeleted = clone(deleted.value);
    let sentSnapshot = clone(display.value);
    const sentVersions = new Map(sentKeys.map(key => [key, versionOf(key)]));
    const batchWaiters = waiters.filter(waiter =>
      [...waiter.keys].every(key => sentKeys.includes(key))
    );
    waiters = waiters.filter(waiter => !batchWaiters.includes(waiter));

    try {
      if (!isLoaded && load) {
        confirmed.value = clone(await load());
        isLoaded = true;
        // The pending overlay is still the same, but the confirmed base it
        // sits on is now known.
        sentKeys = pendingKeys();
        sentPending = clone(pending.value);
        sentDeleted = clone(deleted.value);
        sentSnapshot = clone(display.value);
        for (const key of sentKeys) sentVersions.set(key, versionOf(key));
      }

      const changes = {};
      for (const key of sentKeys) {
        if (!has(sentDeleted, key)) changes[key] = sentPending[key];
      }
      const batch = {
        changes,
        deleted: Object.keys(sentDeleted),
        snapshot: sentSnapshot,
        merge:
          sentKeys.length > 0 &&
          sentKeys.every(key => mergeable.has(key)) &&
          Object.keys(sentDeleted).length === 0,
      };
      await save(batch, { keepalive: keepaliveFlush });

      // Only the sent keys become confirmed; a server change that arrived
      // while this save was in flight is kept for every other key.
      const nextConfirmed = clone(confirmed.value);
      for (const key of sentKeys) {
        if (has(sentSnapshot, key)) nextConfirmed[key] = sentSnapshot[key];
        else delete nextConfirmed[key];
      }
      confirmed.value = nextConfirmed;

      const nextPending = clone(pending.value);
      const nextDeleted = clone(deleted.value);
      for (const key of sentKeys) {
        if (versionOf(key) === sentVersions.get(key)) {
          delete nextPending[key];
          delete nextDeleted[key];
          mergeable.delete(key);
        }
      }
      pending.value = nextPending;
      deleted.value = nextDeleted;
      settleSent(batchWaiters, batch, sentVersions);
    } catch (err) {
      // Roll back to confirmed only where the user has not tapped again.
      const nextPending = clone(pending.value);
      const nextDeleted = clone(deleted.value);
      for (const key of sentKeys) {
        if (versionOf(key) === sentVersions.get(key)) {
          delete nextPending[key];
          delete nextDeleted[key];
          mergeable.delete(key);
        }
      }
      pending.value = nextPending;
      deleted.value = nextDeleted;
      onError?.(err, { changes: sentPending, deleted: Object.keys(sentDeleted) });
      // A failure is reported to its caller at once, re-tapped or not: that
      // caller's value was rolled back and its UI needs the error now.
      settle(batchWaiters, false, err);
    } finally {
      running = false;
      if (hasPending()) {
        saving.value = true;
        if (!flushRequested && timer === null) {
          timer = setTimeout(beginRun, delay);
        }
      } else {
        saving.value = false;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      }
    }
  };

  const beginRun = () => {
    if (currentRun) return currentRun;
    currentRun = performSave().finally(() => {
      currentRun = null;
    });
    return currentRun;
  };

  const schedule = keys => {
    saving.value = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void beginRun();
    }, delay);
    return new Promise((resolve, reject) => {
      waiters.push({ keys, resolve, reject });
    });
  };

  /** Apply changed keys optimistically; the save follows after the debounce. */
  const setPartial = (values, { merge = false } = {}) => {
    const keys = Object.keys(values);
    const nextPending = clone(pending.value);
    const nextDeleted = clone(deleted.value);
    for (const key of keys) {
      nextPending[key] = values[key];
      delete nextDeleted[key];
      if (merge) mergeable.add(key);
      else mergeable.delete(key);
      bump(key);
    }
    pending.value = nextPending;
    deleted.value = nextDeleted;
    if (keys.length === 0) return Promise.resolve();
    return schedule(keys);
  };

  /** Delete keys optimistically (e.g. "Reset to default"). */
  const deleteKeys = keys => {
    const nextPending = clone(pending.value);
    const nextDeleted = clone(deleted.value);
    for (const key of keys) {
      delete nextPending[key];
      nextDeleted[key] = true;
      mergeable.delete(key);
      bump(key);
    }
    pending.value = nextPending;
    deleted.value = nextDeleted;
    if (keys.length === 0) return Promise.resolve();
    return schedule(keys);
  };

  /**
   * Replace the whole target (a kiosk's overrides object). Only the keys that
   * differ from what is displayed join the pending set.
   */
  const replaceAll = values => {
    const current = display.value;
    const nextPending = clone(pending.value);
    const nextDeleted = clone(deleted.value);
    const keys = [];
    const allKeys = new Set([...Object.keys(current), ...Object.keys(values)]);

    for (const key of allKeys) {
      const inNext = has(values, key);
      const inCurrent = has(current, key);
      if (inNext && inCurrent && Object.is(current[key], values[key])) continue;
      if (inNext) {
        nextPending[key] = values[key];
        delete nextDeleted[key];
      } else {
        delete nextPending[key];
        nextDeleted[key] = true;
      }
      keys.push(key);
      mergeable.delete(key);
      bump(key);
    }

    pending.value = nextPending;
    deleted.value = nextDeleted;
    if (keys.length === 0) return Promise.resolve(current);
    return schedule(keys);
  };

  /** A server update from elsewhere: confirmed changes, pending keys stay. */
  const confirm = next => {
    confirmed.value = clone(next);
    isLoaded = true;
  };

  const confirmKey = (key, value) => {
    if (has(confirmed.value, key) && Object.is(confirmed.value[key], value)) return;
    const next = clone(confirmed.value);
    if (value === undefined) delete next[key];
    else next[key] = value;
    confirmed.value = next;
    isLoaded = true;
  };

  const ensureLoaded = async () => {
    if (isLoaded || !load) return;
    confirmed.value = clone(await load());
    isLoaded = true;
  };

  const flush = async ({ keepalive = false } = {}) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    flushRequested = true;
    if (keepalive) keepaliveFlush = true;
    try {
      while (running || hasPending()) {
        if (running) await currentRun;
        else await beginRun();
      }
    } finally {
      flushRequested = false;
      keepaliveFlush = false;
    }
  };

  const discardPending = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pending.value = {};
    deleted.value = {};
    mergeable.clear();
    saving.value = running;
    const waiting = waiters;
    waiters = [];
    settle(waiting, true, undefined);
  };

  return {
    confirmed,
    pending,
    deleted,
    display,
    saving,
    setPartial,
    deleteKeys,
    replaceAll,
    confirm,
    confirmKey,
    ensureLoaded,
    flush,
    discardPending,
    hasPending,
    hasPendingKey: key => has(pending.value, key) || has(deleted.value, key),
    hasConfirmedKey: key => has(confirmed.value, key),
    pendingValue: key => (has(pending.value, key) ? pending.value[key] : undefined),
  };
}
