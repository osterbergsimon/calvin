import { computed, ref } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { getKioskId } from "../utils/kioskId";

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

// localStorage keys are per setting; sharing one ref per key keeps every
// caller (Settings row, keyboard composable, ...) in sync in the same page.
const localRefs = new Map();

const readStorage = storageKey => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null || raw === "" ? null : raw;
  } catch {
    return null;
  }
};

const parseStored = (storageKey, parse) => {
  const raw = readStorage(storageKey);
  if (raw === null) return null;
  try {
    return parse(raw);
  } catch {
    return null;
  }
};

const localRef = (storageKey, parse) => {
  let stored = localRefs.get(storageKey);
  if (!stored) {
    stored = ref(parseStored(storageKey, parse));
    localRefs.set(storageKey, stored);
  }
  return stored;
};

/**
 * @param {string} key config key, e.g. "onScreenKeyboard"
 * @param {{
 *   storageKey?: string,
 *   serverValue?: () => any,
 *   serialize?: (value: any) => string,
 *   parse?: (raw: string) => any
 * }} options
 *   storageKey: localStorage key for browser scope
 *   serverValue: where the seed comes from when this screen has no choice of
 *   its own (defaults to the config store; pass the Settings form's own value
 *   when the row must reflect what Settings loaded)
 *   serialize/parse: localStorage encoding for non-string choices (booleans,
 *   lists). Defaults keep the historical plain string form.
 */
export function useScreenSetting(
  key,
  {
    storageKey = `calvin-screen-${key}`,
    serverValue: readServerValue,
    serialize = value => String(value),
    parse = raw => raw,
  } = {}
) {
  const configStore = useConfigStore();
  const kiosksStore = useKiosksStore();
  const kioskId = getKioskId();
  const scope = kioskId ? "kiosk" : "browser";

  // Re-read on creation so a fresh caller sees the current value even if a
  // previous instance left the shared ref behind (tests, remounts).
  const stored = localRef(storageKey, parse);
  if (scope === "browser") stored.value = parseStored(storageKey, parse);

  const serverValue = computed(() =>
    readServerValue ? readServerValue() : (configStore[key] ?? null)
  );

  const value = computed(() => {
    if (scope === "kiosk") return serverValue.value;
    return stored.value ?? serverValue.value;
  });

  // A browser choice of its own, as opposed to falling back to the server
  // (Default) value. Only meaningful in browser scope; a kiosk's choice is an
  // override on the server and is reported by the screens page instead.
  const overridden = computed(() => scope === "browser" && stored.value !== null);

  const set = async next => {
    if (scope === "kiosk") {
      const overrides = (await kiosksStore.fetchOverrides(kioskId)) || {};
      const merged = { ...overrides, [key]: next };
      await kiosksStore.saveOverrides(kioskId, merged);
      // The override replaces the whole object; keep this page in step without
      // waiting for the next merged-config poll.
      configStore[key] = next;
      return;
    }

    stored.value = next;
    try {
      window.localStorage.setItem(storageKey, serialize(next));
    } catch {
      // Storage blocked: the choice lasts for this page load.
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
