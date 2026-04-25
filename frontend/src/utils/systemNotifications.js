/**
 * Show a success toast when the OS reboot API call succeeded.
 * Kept in a small module so behavior is unit-testable (KeyboardHandler uses script setup).
 *
 * @param {{ value?: { show?: (...args: unknown[]) => void } | null }} notificationRef - Vue ref to NotificationSystem
 */
export function showSystemRebootScheduled(notificationRef) {
  notificationRef.value?.show?.("success", "✓", "System rebooting in a few seconds…", 3500);
}
