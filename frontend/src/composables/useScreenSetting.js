import { computed } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { useNotificationsStore } from "../stores/notifications";
import { getKioskId } from "../utils/kioskId";
import { logError } from "../utils/logger";
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
 * On any other browser it is a local preference in `localStorage`, falling
 * back to the server value while unset or unreadable.
 *
 * Returns { value, set, scope } for the settings audit's "This screen" rows.
 */

/**
 * @param {string} key config key, e.g. "onScreenKeyboard"
 * @param {{ storageKey?: string, serverValue?: () => any }} options
 *   storageKey: localStorage key for browser scope
 *   serverValue: where the seed comes from when this screen has no choice of
 *   its own (defaults to the config store; pass the Settings form's own value
 *   when the row must reflect what Settings loaded)
 */
export function useScreenSetting(
  key,
  { storageKey = screenStorageKey(key), serverValue: readServerValue } = {}
) {
  const configStore = useConfigStore();
  const kiosksStore = useKiosksStore();
  const notifications = useNotificationsStore();
  const kioskId = getKioskId();
  const scope = kioskId ? "kiosk" : "browser";

  // Re-read on creation so a fresh caller sees the current value even if a
  // previous instance left the shared ref behind (tests, remounts).
  const stored = screenSettingRef(storageKey);
  if (scope === "browser") stored.value = readScreenStorage(storageKey);

  const serverValue = computed(() =>
    readServerValue ? readServerValue() : (configStore[key] ?? null)
  );

  const value = computed(() => {
    if (scope === "kiosk") return serverValue.value;
    return decodeScreenValue(stored.value, serverValue.value) ?? serverValue.value;
  });

  // A browser choice of its own, as opposed to falling back to the server
  // (Default) value. Only meaningful in browser scope; a kiosk's choice is an
  // override on the server and is reported by the screens page instead.
  const overridden = computed(() => scope === "browser" && stored.value !== null);

  const set = async next => {
    try {
      await writeScreenSetting({
        kioskId,
        key,
        storageKey,
        next,
        raw: stored,
        kiosksStore,
        // The override replaces the whole object; keep this page in step
        // without waiting for the next merged-config poll.
        applyServerValue: value => {
          configStore[key] = value;
        },
      });
    } catch (err) {
      logError("[useScreenSetting]", `Failed to save ${key}:`, err);
      notifications.notify({
        severity: "error",
        message: "Couldn't save this screen's setting. The stored value is unchanged.",
      });
    }
  };

  // "Reset to default": drop this browser's own choice (or this kiosk's
  // override) so the Default value applies again.
  const reset = async () => {
    if (scope === "kiosk") {
      const overrides = (await kiosksStore.fetchOverrides(kioskId)) || {};
      if (!(key in overrides)) return;
      const merged = { ...overrides };
      delete merged[key];
      await kiosksStore.saveOverrides(kioskId, merged);
      return;
    }

    stored.value = null;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage blocked: the fallback only lasted for this page load anyway.
    }
  };

  return { value, set, reset, overridden, scope };
}
