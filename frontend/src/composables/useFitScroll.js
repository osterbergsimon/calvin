import { computed, nextTick, watch } from "vue";
import { useFitClamp } from "./useFitClamp.js";
import { useTouchCapability } from "./useTouchCapability";

// Presentation layer over the pure useFitClamp: decides scroll-vs-clamp from
// hasPointer (mouse OR touch → scroll+snap+fade; keyboard-only → clamp to the
// last whole track), and emits ready-to-bind style + class. Axis-agnostic:
// "block" clamps height (Y), "inline" clamps width (X).
export function useFitScroll(containerRef, { axis, itemSelector, data, viewport = "parent" }) {
  const inline = axis === "inline";
  const { hasPointer } = useTouchCapability();
  const { fits, hasOverflow, recompute } = useFitClamp(containerRef, {
    axis,
    itemSelector,
    viewport,
  });

  // The container's border-box is pinned by its layout, so ResizeObserver won't
  // fire when data loads/changes late — recompute the clamp when it does.
  if (data) {
    watch(data, () => nextTick(recompute), { deep: true });
  }

  const clampStyle = computed(() => {
    if (hasPointer.value) {
      return inline
        ? { overflowX: "auto", scrollSnapType: "x proximity" }
        : { overflowY: "auto", scrollSnapType: "y proximity" };
    }
    const size = fits.value ? `${fits.value}px` : null;
    return inline
      ? { maxInlineSize: size, overflowX: "hidden" }
      : { maxBlockSize: size, overflowY: "hidden" };
  });

  const showShade = computed(() => hasPointer.value && hasOverflow.value);
  const shadeClass = computed(() => [
    "calvin-plugin-scroll-shade",
    { [`calvin-plugin-scroll-shade--${inline ? "inline" : "block"}`]: showShade.value },
  ]);

  return { clampStyle, shadeClass, showShade, recompute };
}
