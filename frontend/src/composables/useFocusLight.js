import { computed, onMounted, onUnmounted, ref } from "vue";
import { useConfigStore } from "../stores/config";

/**
 * The dashboard's focus light (calvin-3xz9).
 *
 * "Interaction" means the light follows input: it shows on a touch, a key or a
 * remote button and fades after a short idle. It is deliberately independent of
 * "hide controls": a wall panel with the chrome hidden still shows where the
 * remote will act. The idle wait reuses the existing input-feedback token
 * (`modeIndicatorTimeout`, the "Hide label after" value; 0 keeps it up).
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"];
const DEFAULT_IDLE_SECONDS = 5;

export function useFocusLight(configStore = useConfigStore()) {
  const active = ref(false);
  let idleTimer = null;

  const idleSeconds = () => {
    const value = Number(configStore.modeIndicatorTimeout);
    return Number.isFinite(value) ? value : DEFAULT_IDLE_SECONDS;
  };

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const armIdleTimer = () => {
    clearIdleTimer();
    const seconds = idleSeconds();
    if (seconds <= 0) return; // 0 = never hide, like the input feedback label
    idleTimer = setTimeout(() => {
      active.value = false;
      idleTimer = null;
    }, seconds * 1000);
  };

  const onActivity = () => {
    active.value = true;
    armIdleTimer();
  };

  const lightActive = computed(() => {
    // While arranging the layout (unlocked), drop the focus spotlight: its
    // large blur glow + raised z-index repaint on every resize frame.
    if (!configStore.regionsLocked) return false;
    if (configStore.focusLightMode === "off") return false;
    if (configStore.focusLightMode === "always") return true;
    return active.value; // 'interaction'
  });

  onMounted(() => {
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, onActivity, { passive: true }));
  });

  onUnmounted(() => {
    clearIdleTimer();
    ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, onActivity));
  });

  return { lightActive, active, onActivity };
}
