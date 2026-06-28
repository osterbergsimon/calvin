import { ref, readonly, onScopeDispose } from "vue";

/**
 * Reactive touch-capability detection.
 * `isTouch` is true on coarse-pointer devices (the 15" wall touchscreen)
 * and false on the 24" keyboard-driven unit. Single source of truth for
 * whether to render touch chrome.
 */
export function useTouchCapability() {
  const isTouch = ref(false);

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(pointer: coarse)");
    isTouch.value = mql.matches;
    const update = event => {
      isTouch.value = event.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      onScopeDispose(() => mql.removeEventListener("change", update));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(update); // older Safari
      onScopeDispose(() => mql.removeListener(update));
    }
  }

  return { isTouch: readonly(isTouch) };
}
