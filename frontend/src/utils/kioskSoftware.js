/**
 * Kiosk software (agent bundle) helpers shared by the Kiosks summary row and
 * the System › Updates pointer (CLV-19).
 */

/** The agent's last update failed (the updater's status starts with "error"). */
export function hasUpdateError(kiosk) {
  return (
    typeof kiosk?.agentUpdateStatus === "string" && kiosk.agentUpdateStatus.startsWith("error")
  );
}

/**
 * The failure was the kiosk's OS/Python being too old, so retrying cannot
 * succeed. Rollbacks and other errors are not blocked — they can be retried.
 */
export function isUpdateBlocked(kiosk) {
  return (
    hasUpdateError(kiosk) &&
    typeof kiosk?.agentUpdateMessage === "string" &&
    kiosk.agentUpdateMessage.toLowerCase().includes("python")
  );
}

/** The kiosk runs an agent version different from the available bundle. */
export function isVersionBehind(kiosk, availableVersion) {
  return (
    availableVersion != null &&
    kiosk?.agentVersion != null &&
    kiosk.agentVersion !== availableVersion
  );
}

/** Kiosks that can actually be updated to `availableVersion` right now. */
export function kiosksBehind(kiosks, availableVersion) {
  return kiosks.filter(k => isVersionBehind(k, availableVersion) && !isUpdateBlocked(k));
}

/** Kiosks whose old OS blocks the available bundle. */
export function kiosksBlocked(kiosks, availableVersion) {
  return kiosks.filter(k => isVersionBehind(k, availableVersion) && isUpdateBlocked(k));
}

/** Versions are commit hashes; show the first seven characters. */
export function shortVersion(version) {
  return version == null ? "" : String(version).slice(0, 7);
}
