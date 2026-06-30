import { ref } from "vue";

/**
 * Viewport-aware placement for absolutely-positioned popovers/menus/listboxes.
 *
 * Caps the popover's height to the room available below its trigger (or above,
 * flipping when there's clearly more room there) so a long list scrolls inside
 * the popover instead of running off the bottom of a short screen — the wall
 * displays Calvin targets are often short.
 *
 * Usage:
 *   const { openUp, popoverStyle, place } = usePopoverPlacement();
 *   // on open, after the trigger is in the DOM:
 *   place(triggerEl);            // triggerEl: a ref or an element
 *   // bind on the popover element:
 *   :class="{ 'is-up': openUp }" :style="popoverStyle"
 * Pair with `overflow-y: auto` on the popover and an "is-up" rule that anchors
 * it above the trigger (`top: auto; bottom: calc(100% + …)`).
 */
export function usePopoverPlacement({ minHeight = 160, flipThreshold = 240, margin = 16 } = {}) {
  const openUp = ref(false);
  const popoverStyle = ref({});

  const place = trigger => {
    const el = trigger && "value" in trigger ? trigger.value : trigger;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const up = spaceBelow < flipThreshold && spaceAbove > spaceBelow;
    openUp.value = up;
    popoverStyle.value = {
      maxHeight: `${Math.max(minHeight, Math.round(up ? spaceAbove : spaceBelow))}px`,
    };
  };

  return { openUp, popoverStyle, place };
}
