// One optimistic queue per kiosk's overrides object (calvin-g25v).
//
// Screens settings and every per-screen row target the same object. Sharing
// the queue keeps a save of one key from clobbering another key that is still
// pending, and keeps the queue tied to the owning Pinia store (so a new store
// in a test starts clean).

import { watch } from "vue";
import { useKiosksStore } from "../stores/kiosks";
import { createOptimisticQueue } from "./optimisticQueue";

const registries = new WeakMap();

function registryFor(store) {
  let queues = registries.get(store);
  if (!queues) {
    queues = new Map();
    registries.set(store, queues);
  }
  return queues;
}

/** The shared overrides queue for one kiosk. */
export function kioskOverridesQueue(kioskId) {
  const store = useKiosksStore();
  const queues = registryFor(store);
  let queue = queues.get(kioskId);
  if (queue) return queue;

  const kiosk = store.kiosks.find(item => item.id === kioskId);
  queue = createOptimisticQueue({
    initial: kiosk?.overrides ?? {},
    loaded: Boolean(kiosk),
    load: async () => (await store.fetchOverrides(kioskId)) || {},
    save: async ({ changes, merge, snapshot }) => {
      if (merge) {
        // A per-screen row changed one key: merge it, so a screen without an
        // admin session can save the keys it is allowed to change (F2). The
        // whole-layer write below still needs admin.
        const merged = await store.mergeOverrides(kioskId, changes);
        if (merged) store.setKioskOverrides(kioskId, merged);
        return;
      }
      await store.saveOverrides(kioskId, snapshot);
      store.setKioskOverrides(kioskId, snapshot);
    },
  });

  // A background refresh or another editor updates the server copy; that
  // becomes confirmed but leaves this queue's pending values alone.
  watch(
    () => store.kiosks.find(item => item.id === kioskId)?.overrides,
    next => {
      if (next && typeof next === "object") queue.confirm(next);
    },
    { deep: true }
  );

  queues.set(kioskId, queue);
  return queue;
}

/** Fire every queued override save (unmount, pagehide, beforeunload). */
export async function flushKioskOverridesQueues() {
  const queues = registryFor(useKiosksStore());
  await Promise.all([...queues.values()].map(queue => queue.flush()));
}
