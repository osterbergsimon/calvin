import { onMounted, onUnmounted } from "vue";
import { pointInHotCorner, HOT_CORNER_DEFAULTS } from "../utils/hotCorner";

// Detects a press-and-hold inside the reveal hot corner and shows the UI
// temporarily. Lives at the window level (not on the corner element) so the
// corner visual can be pointer-events:none — short taps fall straight through
// to the calendar/photo content underneath, only a deliberate hold reveals.
//
// Returns { onPointerDown, onContextMenu } so the handlers can be unit-tested by
// calling them directly; onMounted/onUnmounted wire them to the window.
const MOVE_CANCEL_PX = 12; // finger drift beyond this aborts the hold (it's a swipe, not a press)
const CLICK_SUPPRESS_MS = 700; // window to swallow the trailing content click after a reveal

export function useHotCornerReveal(configStore, options = {}) {
  const getViewport =
    options.getViewport || (() => ({ w: window.innerWidth, h: window.innerHeight }));

  let holdTimer = null;
  let startX = 0;
  let startY = 0;
  // True while a primary press that began inside the corner is still down. Used
  // to swallow the browser's touch long-press context menu (which targets the
  // content under the pointer-events:none corner, not the corner itself).
  let pressInCorner = false;

  const isInCorner = (x, y) => {
    const { w, h } = getViewport();
    return pointInHotCorner({
      x,
      y,
      position: configStore.hotCornerPosition,
      size: configStore.hotCornerSize ?? HOT_CORNER_DEFAULTS.size,
      viewportWidth: w,
      viewportHeight: h,
    });
  };

  const cancelHold = () => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    pressInCorner = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", cancelHold);
    window.removeEventListener("pointercancel", cancelHold);
  };

  const onPointerMove = event => {
    if (
      Math.abs(event.clientX - startX) > MOVE_CANCEL_PX ||
      Math.abs(event.clientY - startY) > MOVE_CANCEL_PX
    ) {
      cancelHold();
    }
  };

  // After a hold fires, the pointerup still produces a click on whatever content
  // sits under the finger (e.g. a calendar event). Swallow that one click.
  const suppressNextClick = () => {
    const suppressor = event => {
      event.stopPropagation();
      event.preventDefault();
      window.removeEventListener("click", suppressor, true);
    };
    window.addEventListener("click", suppressor, true);
    setTimeout(() => window.removeEventListener("click", suppressor, true), CLICK_SUPPRESS_MS);
  };

  const onPointerDown = event => {
    // Only arm while the UI is hidden and this is a primary (non-mouse-right) press.
    if (configStore.shouldShowUI) return;
    if (event.button != null && event.button !== 0) return;
    if (!isInCorner(event.clientX, event.clientY)) return;

    startX = event.clientX;
    startY = event.clientY;
    pressInCorner = true;
    const holdMs = Number(configStore.hotCornerLongPressMs);
    const duration =
      Number.isFinite(holdMs) && holdMs > 0 ? holdMs : HOT_CORNER_DEFAULTS.longPressMs;

    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (typeof configStore.showUITemporarily === "function") {
        configStore.showUITemporarily(60);
      }
      suppressNextClick();
      // Keep pressInCorner set until the finger lifts (cancelHold on pointerup)
      // so a context menu firing after the reveal is still swallowed.
    }, duration);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", cancelHold, { once: true });
    window.addEventListener("pointercancel", cancelHold, { once: true });
  };

  // Touch long-press raises contextmenu on the content beneath the corner; a
  // desktop right-click in the corner does too. Suppress it over the corner so
  // the reveal gesture never pops the browser menu.
  const onContextMenu = event => {
    if (pressInCorner || (!configStore.shouldShowUI && isInCorner(event.clientX, event.clientY))) {
      event.preventDefault();
    }
  };

  onMounted(() => {
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("contextmenu", onContextMenu);
  });
  onUnmounted(() => {
    cancelHold();
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("contextmenu", onContextMenu);
  });

  return { onPointerDown, onContextMenu };
}
