import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Status-notification store — the "annunciator rail".
 *
 * Holds system-event notifications (reboot, update, restart, errors) as a
 * stack rather than the old single-slot toast. Ephemeral input-echo feedback
 * (keypress / mode HUD) does NOT live here — see NotificationSystem.vue.
 *
 * The store is intentionally timer-free: StatusRail.vue owns auto-dismiss
 * timers so the depleting "timer readout" stays a pure view concern and the
 * store stays trivially testable.
 */

export const SEVERITIES = ["info", "success", "warning", "error"];

// Severities that stick until the user acknowledges them, by default.
const STICKY_BY_DEFAULT = new Set(["warning", "error"]);

// Auto-dismiss windows for the transient severities (ms).
const DEFAULT_DURATION = { info: 5000, success: 4000, warning: 8000, error: 8000 };

// Fallback eyebrow label when a caller doesn't supply one.
const DEFAULT_EYEBROW = {
  info: "System",
  success: "Done",
  warning: "Warning",
  error: "Error",
};

let seq = 0;

export const useNotificationsStore = defineStore("notifications", () => {
  /** @type {import('vue').Ref<Array<object>>} */
  const items = ref([]);

  /**
   * Push a status notification onto the rail.
   *
   * @param {object} opts
   * @param {"info"|"success"|"warning"|"error"} [opts.severity="info"]
   * @param {string} [opts.eyebrow]   Tracked-uppercase category label (e.g. "System").
   * @param {string} [opts.message]   Human-readable body copy.
   * @param {number|null} [opts.duration]   Auto-dismiss ms; null uses the severity default.
   * @param {boolean|null} [opts.persistent]   Force sticky/transient; null uses the severity default.
   * @returns {number} the notification id (pass to dismiss()).
   */
  function notify({
    severity = "info",
    eyebrow = "",
    message = "",
    duration = null,
    persistent = null,
  } = {}) {
    const sev = SEVERITIES.includes(severity) ? severity : "info";
    const id = ++seq;

    items.value = [
      ...items.value,
      {
        id,
        severity: sev,
        eyebrow: eyebrow || DEFAULT_EYEBROW[sev],
        message,
        duration: duration ?? DEFAULT_DURATION[sev],
        persistent: persistent ?? STICKY_BY_DEFAULT.has(sev),
      },
    ];

    return id;
  }

  function dismiss(id) {
    items.value = items.value.filter(n => n.id !== id);
  }

  function clear() {
    items.value = [];
  }

  return { items, notify, dismiss, clear };
});
