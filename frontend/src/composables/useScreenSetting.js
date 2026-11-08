import { computed, getCurrentInstance, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { useNotificationsStore } from "../stores/notifications";
import { getKioskId } from "../utils/kioskId";
import { logError } from "../utils/logger";
import { kioskOverridesQueue } from "../utils/kioskOverridesQueue";
import { descriptorFor } from "../utils/screenOverrides";
import {
  decodeScreenValue,
  readScreenStorage,
  screenSettingRef,
  screenStorageKey,
  writeScreenSetting,
} from "../utils/screenSetting";

/**
 * One setting, scoped to the screen you are changing it on.
 *
 * On a kiosk the value lives in that kiosk's overrides: the kiosk already gets
 * merged config, so `value` reads the same config store as everywhere else.
 * On any other browser it is a local preference in `localStorage` only when the
 * setting's descriptor says it has a browser layer; without one it follows the
 * household value like a kiosk without an override does (settings-scope §4).
 *
 * Returns { value, set, scope } for the settings audit's "This screen" rows.
 */

/**
 * @param {string} key config key, e.g. "onScreenKeyboard"
 * @param {{ storageKey?: string, serverValue?: () => any, browserLayer?: boolean }} options
 *   storageKey: localStorage key for browser scope
 *   serverValue: where the seed comes from when this screen has no choice of
 *   its own (defaults to the config store; pass the Settings form's own value
 *   when the row must reflect what Settings loaded)
 *   browserLayer: overrides the descriptor's flag; most callers should leave it
 *   alone so the descriptor stays the one source of truth
 */
export function useScreenSetting(
  key,
  { storageKey = screenStorageKey(key), serverValue: readServerValue, browserLayer } = {}
) {
  const configStore = useConfigStore();
  const kiosksStore = useKiosksStore();
  const notifications = useNotificationsStore();
  const kioskId = getKioskId();
  const scope = kioskId ? "kiosk" : "browser";
  const hasBrowserLayer = browserLayer ?? descriptorFor(key)?.browserLayer ?? true;

  // Re-read on creation so a fresh caller sees the current value even if a
  // previous instance left the shared ref behind (tests, remounts). A setting
  // without a browser layer never touches localStorage at all: a value left by
  // an older version must not beat the household value.
  const stored = hasBrowserLayer ? screenSettingRef(storageKey) : null;
  if (scope === "browser" && stored) stored.value = readScreenStorage(storageKey);

  const serverValue = computed(() =>
    readServerValue ? readServerValue() : (configStore[key] ?? null)
  );

  // Kiosk writes go through the one queue for that kiosk's overrides object.
  // The pending value is shown here while it waits, so another row's save can
  // never overwrite it and a failure falls back to the server value.
  const kioskQueue = scope === "kiosk" ? kioskOverridesQueue(kioskId) : null;

  const value = computed(() => {
    if (scope === "kiosk") {
      if (kioskQueue.hasPendingKey(key)) return kioskQueue.display.value[key];
      return serverValue.value;
    }
    if (!hasBrowserLayer) return serverValue.value;
    return decodeScreenValue(stored.value, serverValue.value) ?? serverValue.value;
  });

  // A browser choice of its own, as opposed to falling back to the server
  // (Default) value. Only meaningful in browser scope; a kiosk's choice is an
  // override on the server and is reported by the screens page instead.
  const overridden = computed(
    () => scope === "browser" && hasBrowserLayer && stored.value !== null
  );

  const notifyFailure = err => {
    logError("[useScreenSetting]", `Failed to save ${key}:`, err);
    notifications.notify({
      severity: "error",
      message: "Couldn't save this screen's setting. The stored value is unchanged.",
    });
  };

  const set = async next => {
    if (scope !== "kiosk") {
      if (!hasBrowserLayer) return;
      try {
        await writeScreenSetting({
          kioskId,
          key,
          storageKey,
          next,
          raw: stored,
          kiosksStore,
        });
      } catch (err) {
        notifyFailure(err);
      }
      return;
    }

    try {
      // One key is one merge: a kiosk without admin may save the allowlisted
      // keys it changes without replacing the whole layer (F2).
      await kioskQueue.setPartial({ [key]: next }, { merge: true });
      // Keep this page in step without waiting for the next merged-config
      // poll, unless a newer tap for the same row is still pending.
      if (!kioskQueue.hasPendingKey(key)) configStore[key] = next;
    } catch (err) {
      // The queue has already reverted this key to its confirmed value.
      notifyFailure(err);
    }
  };

  // "Reset to default": drop this browser's own choice (or this kiosk's
  // override) so the Default value applies again.
  const reset = async () => {
    if (scope === "kiosk") {
      try {
        await kioskQueue.ensureLoaded();
        if (!kioskQueue.hasConfirmedKey(key) && !kioskQueue.hasPendingKey(key)) return;
        await kioskQueue.deleteKeys([key]);
      } catch (err) {
        notifyFailure(err);
      }
      return;
    }

    if (!hasBrowserLayer) return;
    stored.value = null;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage blocked: the fallback only lasted for this page load anyway.
    }
  };

  // Never lose a queued kiosk value on navigation or a page close.
  if (scope === "kiosk" && typeof window !== "undefined" && getCurrentInstance()) {
    const flush = () => {
      void kioskQueue.flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    onUnmounted(() => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    });
  }

  return { value, set, reset, overridden, scope };
}
