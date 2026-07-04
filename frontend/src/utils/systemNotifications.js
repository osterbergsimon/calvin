/**
 * Push a success notification when the OS reboot API call succeeded.
 * Kept in a small module so behavior is unit-testable (KeyboardHandler uses script setup).
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
