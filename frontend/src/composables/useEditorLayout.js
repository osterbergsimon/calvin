import { computed, onUnmounted, ref } from "vue";
import { WIDE_MIN_WIDTH, isPhoneWidth } from "@/styles/breakpoints.js";

// The full-size editor's layout follows the SPACE IT IS GIVEN, not its own box
// (docs/design/2026-11-04-clock-bar-editor.md reuses Pages & regions). The
// dialog's fixed overlay is the available space; a deadband keeps a boundary
// from flipping the layout twice on device-pixel rounding.
const WIDE_MIN_HEIGHT = 640;
const WIDE_HYSTERESIS = 24;

const resolveSizeClass = ({ width, height }, current) => {
  // Unmeasured (first paint, or a test host without ResizeObserver): keep the
  // wide layout until the observer reports.
  if (!width || !height) return "wide";
  const wide =
    current === "wide"
      ? width >= WIDE_MIN_WIDTH - WIDE_HYSTERESIS && height >= WIDE_MIN_HEIGHT - WIDE_HYSTERESIS
      : width >= WIDE_MIN_WIDTH + WIDE_HYSTERESIS && height >= WIDE_MIN_HEIGHT + WIDE_HYSTERESIS;
  if (wide) return "wide";
  return isPhoneWidth(width) ? "phone" : "compact";
};

/**
 * Shared wide / compact / phone layout for the full-size settings editors.
 * The component binds `modalEl` to the editor root and `stageEl` to its stage.
 */
export function useEditorLayout() {
  const modalEl = ref(null);
  const stageEl = ref(null);
  const stageSize = ref({ width: 0, height: 0 });
  const sizeClass = ref("wide");
  const coarsePointer = ref(false);
  const reduceMotion = ref(false);
  const mediaCleanups = [];

  const watchMedia = (query, target) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    target.value = Boolean(mql.matches);
    const handler = event => {
      target.value = Boolean(event.matches);
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      mediaCleanups.push(() => mql.removeEventListener("change", handler));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(handler);
      mediaCleanups.push(() => mql.removeListener(handler));
    }
  };
  watchMedia("(any-pointer: coarse)", coarsePointer);
  watchMedia("(prefers-reduced-motion: reduce)", reduceMotion);

  const isPhone = computed(() => sizeClass.value === "phone");

  // The overlay is the editor's available space; <html> is the fallback for a
  // host that renders the editor without the Dialog shell.
  const spaceElement = () =>
    modalEl.value?.closest?.(".dialog-overlay") ||
    (typeof document !== "undefined" ? document.documentElement : null);

  // Read the border box: contentRect would subtract the overlay's gutter, which
  // the bleed layout removes, so it would depend on the class again.
  const borderBoxOf = entry => {
    const border = entry?.borderBoxSize;
    const size = Array.isArray(border) ? border[0] : border;
    if (size && (size.inlineSize || size.blockSize)) {
      return { width: size.inlineSize, height: size.blockSize };
    }
    const rect = entry?.target?.getBoundingClientRect?.();
    if (rect) return { width: rect.width, height: rect.height };
    const content = entry?.contentRect;
    return { width: content?.width ?? 0, height: content?.height ?? 0 };
  };

  let spaceObserver = null;
  let stageObserver = null;
  const stopObserving = () => {
    spaceObserver?.disconnect();
    stageObserver?.disconnect();
    spaceObserver = null;
    stageObserver = null;
  };
  const startObserving = () => {
    if (typeof ResizeObserver === "undefined") return;
    stopObserving();
    spaceObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) sizeClass.value = resolveSizeClass(borderBoxOf(entry), sizeClass.value);
    });
    stageObserver = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) stageSize.value = { width: box.width, height: box.height };
    });
    const space = spaceElement();
    if (space) spaceObserver.observe(space);
    if (stageEl.value) stageObserver.observe(stageEl.value);
  };

  const resetLayout = () => {
    sizeClass.value = "wide";
    stageSize.value = { width: 0, height: 0 };
  };

  onUnmounted(() => {
    stopObserving();
    mediaCleanups.forEach(cleanup => cleanup());
  });

  return {
    modalEl,
    stageEl,
    stageSize,
    sizeClass,
    isPhone,
    coarsePointer,
    reduceMotion,
    startObserving,
    stopObserving,
    resetLayout,
  };
}
