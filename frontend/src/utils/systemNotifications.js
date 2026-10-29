/**
 * System-event notifications for the app shell.
 * Kept in a small module so behavior is unit-testable (KeyboardHandler uses script setup).
 */

/**
 * Push a success notification when the OS reboot API call succeeded.
 *
 * @param {{ notify: (opts: object) => number }} notificationsStore - the notifications Pinia store
 */
export function showSystemRebootScheduled(notificationsStore) {
  notificationsStore?.notify?.({
    severity: "success",
    eyebrow: "Reboot",
    message: "System rebooting in a few seconds…",
    duration: 3500,
  });
}

/**
 * Show the server's reason when the reboot was refused (e.g. the backend does
 * not own this machine) instead of failing silently.
 *
 * @param {{ notify: (opts: object) => number }} notificationsStore - the notifications Pinia store
 * @param {string} message - server message, shown verbatim when present
 */
export function showSystemRebootFailed(notificationsStore, message) {
  notificationsStore?.notify?.({
    severity: "error",
    eyebrow: "Reboot",
    message: message || "Failed to reboot this device.",
  });
}
