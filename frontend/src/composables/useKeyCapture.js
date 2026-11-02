import { computed, onBeforeUnmount } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";

/**
 * Thin wrapper over the keyboard store's capture primitives.
 * KeyboardHandler is the actual key listener; it routes the next keydown to
 * store.handleCaptureKey while capture is active. This composable just exposes
 * an awaitable capture() and guarantees cleanup on unmount.
 */
export function useKeyCapture() {
  const store = useKeyboardStore();
  const capturing = computed(() => store.captureActive);

  const capture = () => store.beginCapture();
  const cancel = () => store.cancelCapture();

  onBeforeUnmount(() => {
    if (store.captureActive) store.cancelCapture();
  });

  return { capturing, capture, cancel };
}
