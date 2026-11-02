import { defineStore } from "pinia";
import { ref } from "vue";
import { getLeafRegions } from "../utils/layout";
import { getKioskId } from "../utils/kioskId";

const STORAGE_PREFIX = "calvin_active_region";

const storageKey = screenId => `${STORAGE_PREFIX}:${getKioskId() || "default"}:${screenId}`;

const readStored = screenId => {
  try {
    const raw = sessionStorage.getItem(storageKey(screenId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // Older / hand-written value: treat it as the region with the same
      // persisted bookmark.
      return { regionId: raw, persistedId: raw };
    }
  } catch {
    return null;
  }
};

const writeStored = (screenId, regionId, persistedId) => {
  try {
    if (!regionId) {
      sessionStorage.removeItem(storageKey(screenId));
      return;
    }
    sessionStorage.setItem(
      storageKey(screenId),
      JSON.stringify({ regionId, persistedId: persistedId ?? regionId })
    );
  } catch {
    // Storage blocked (private mode etc.): keep the in-memory value.
  }
};

/**
 * Session-scoped active region per dashboard screen.
 *
 * A tap or key-cycling a region changes what the focus light and touch
 * navigation target, not a setting: it is persisted to sessionStorage so a
 * kiosk reload restores it, but never POSTed as config. A deliberate persisted
 * change (layout editor save or the server's config poll) wins over the local
 * value.
 */
export const useActiveRegionStore = defineStore("activeRegion", () => {
  const byScreen = ref({});
  const lastPersisted = ref({});

  const leavesOf = screen => getLeafRegions(screen?.layout);

  const isLeaf = (screen, regionId) => leavesOf(screen).some(leaf => leaf.id === regionId);

  const getActiveRegionId = screen => {
    if (!screen) return null;
    const sessionId = byScreen.value[screen.id];
    if (sessionId && isLeaf(screen, sessionId)) return sessionId;
    return screen.activeRegionId;
  };

  const setActiveRegionId = (screen, regionId) => {
    if (!screen || !isLeaf(screen, regionId)) return;
    byScreen.value = { ...byScreen.value, [screen.id]: regionId };
    if (!(screen.id in lastPersisted.value)) {
      lastPersisted.value = { ...lastPersisted.value, [screen.id]: screen.activeRegionId };
    }
    writeStored(screen.id, regionId, screen.activeRegionId);
  };

  /**
   * Reconcile the session value with the persisted screen config.
   *
   * First sight of a screen restores the sessionStorage value (reload). After
   * that, only a *changed* persisted activeRegionId is authoritative — an
   * unchanged poll keeps the local tap, while an editor save or a new server
   * value replaces it.
   */
  const syncScreens = screens => {
    const list = Array.isArray(screens) ? screens : [];
    const session = { ...byScreen.value };
    const persisted = { ...lastPersisted.value };
    let sessionChanged = false;

    for (const screen of list) {
      if (!screen?.id) continue;
      const screenId = screen.id;
      const savedId = screen.activeRegionId;
      const known = Object.prototype.hasOwnProperty.call(persisted, screenId);

      if (!known) {
        persisted[screenId] = savedId;
        const stored = readStored(screenId);
        if (!stored) continue;
        if (stored.persistedId === savedId) {
          if (isLeaf(screen, stored.regionId) && session[screenId] !== stored.regionId) {
            session[screenId] = stored.regionId;
            sessionChanged = true;
          }
          continue;
        }
        // The server bookmark changed while this kiosk was away: it wins over
        // the locally stored tap.
        if (isLeaf(screen, savedId) && session[screenId] !== savedId) {
          session[screenId] = savedId;
          sessionChanged = true;
        }
        writeStored(screenId, savedId, savedId);
        continue;
      }

      if (persisted[screenId] === savedId) continue;

      // The persisted bookmark changed deliberately. Adopt it even if the
      // session value is newer; it came from the editor or another device.
      persisted[screenId] = savedId;
      if (isLeaf(screen, savedId)) {
        if (session[screenId] !== savedId) {
          session[screenId] = savedId;
          sessionChanged = true;
        }
        writeStored(screenId, savedId, savedId);
      } else if (session[screenId] !== undefined) {
        delete session[screenId];
        sessionChanged = true;
        writeStored(screenId, null);
      }
    }

    if (sessionChanged) byScreen.value = session;
    lastPersisted.value = persisted;
  };

  return { byScreen, getActiveRegionId, setActiveRegionId, syncScreens };
});
