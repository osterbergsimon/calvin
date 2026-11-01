// Shared storage for a per-screen setting (calvin-tnkg, calvin-hi6w).
//
// `useScreenSetting` is the usual way to read and write one. The config store
// also reads the same per-key ref for the settings whose value drives the live
// dashboard (controls hidden, clock bar while hidden, tap-to-reveal), so a
// browser choice made in Settings takes effect without a reload and a choice
// made from the dashboard ⋯ menu shows up in Settings.

import { ref } from "vue";

const localRefs = new Map();

export const screenStorageKey = key => `calvin-screen-${key}`;

export function readScreenStorage(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null || raw === "" ? null : raw;
  } catch {
    return null;
  }
}

// One ref per storage key keeps every caller in the same page in step.
export function screenSettingRef(storageKey) {
  let stored = localRefs.get(storageKey);
  if (!stored) {
    stored = ref(readScreenStorage(storageKey));
    localRefs.set(storageKey, stored);
  }
  return stored;
}

export function encodeScreenValue(value) {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

// Decode a stored string using the server/default value's type. A string
// setting keeps the raw text; a boolean never comes back as the truthy string
// "false". null means "no choice of this screen's own".
export function decodeScreenValue(raw, reference) {
  if (raw === null) return null;
  if (typeof reference === "boolean") return raw === "true";
  if (typeof reference === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}
