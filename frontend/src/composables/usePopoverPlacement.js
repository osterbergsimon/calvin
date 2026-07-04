import { ref } from "vue";

/**
 * Viewport-aware placement for popovers/menus/listboxes that must escape ancestor
 * clipping (e.g. the rounded settings panel's `overflow: hidden`).
 *
 * Emits **fixed-viewport coordinates** derived from the trigger's bounding rect, so
 * the popover can be `<Teleport>`ed to `<body>` and rendered with `position: fixed`
 * — free of every ancestor `overflow`/stacking context. It also caps the popover's
 * height to the room available below the trigger (or above, flipping when there's
 * clearly more room there) so a long list scrolls inside the popover instead of
 * running off the bottom of a short screen — the wall displays Calvin targets are
 * often short.
 *
 * Usage:
 *   const { openUp, popoverStyle, place, reposition } = usePopoverPlacement();
 *   // on open, after the trigger is in the DOM:
 *   place(triggerEl);            // triggerEl: a ref or an element
 *   // template:
 *   <Teleport to="body">
 *     <ul v-if="open" :style="popoverStyle"> … </ul>
 *   </Teleport>
 * Pair with `overflow-y: auto` on the popover. Re-run `reposition()` on scroll/resize
 * while open so the popover tracks its trigger. `matchTriggerWidth` pins the popover's
 * min-width to the trigger (for menus that should be at least as wide as their pill).
 */
export function usePopoverPlacement({
  minHeight = 160,
  flipThreshold = 240,
  margin = 16,
  gap = 6,
  matchTriggerWidth = false,
} = {}) {
  const openUp = ref(false);
  const popoverStyle = ref({});
  let lastTrigger = null;

  const place = trigger => {
    if (trigger !== undefined) lastTrigger = trigger;
    const t = lastTrigger;
    const el = t && "value" in t ? t.value : t;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const up = spaceBelow < flipThreshold && spaceAbove > spaceBelow;
    openUp.value = up;
    const style = {
      position: "fixed",
      // Right-aligned to the trigger, matching the original in-flow `right: 0` anchor.
      right: `${Math.round(window.innerWidth - r.right)}px`,
      maxHeight: `${Math.max(minHeight, Math.round(up ? spaceAbove : spaceBelow))}px`,
    };
    if (up) {
      style.bottom = `${Math.round(window.innerHeight - r.top + gap)}px`;
    } else {
      style.top = `${Math.round(r.bottom + gap)}px`;
    }
    if (matchTriggerWidth) style.minWidth = `${Math.round(r.width)}px`;
    popoverStyle.value = style;
  };

  // Re-place against the trigger captured by the last place() call — bind to
  // scroll/resize while open so a fixed popover tracks its trigger.
  const reposition = () => place();

  return { openUp, popoverStyle, place, reposition };
}
