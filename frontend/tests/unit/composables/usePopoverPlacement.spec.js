import { describe, it, expect, afterEach } from "vitest";
import { usePopoverPlacement } from "@/composables/usePopoverPlacement";

// A fake trigger positioned in the viewport. getBoundingClientRect drives placement.
function trigger({ top, bottom, left = 100, right = 220 }) {
  return { getBoundingClientRect: () => ({ top, bottom, left, right, width: right - left }) };
}

const origW = window.innerWidth;
const origH = window.innerHeight;
function setViewport(w, h) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
}
afterEach(() => setViewport(origW, origH));

describe("usePopoverPlacement", () => {
  it("emits fixed-viewport coords so the popover can escape ancestor clipping", () => {
    setViewport(1000, 800);
    const { popoverStyle, openUp, place } = usePopoverPlacement();
    // trigger with lots of room below
    place(trigger({ top: 100, bottom: 130 }));
    expect(openUp.value).toBe(false);
    const s = popoverStyle.value;
    expect(s.position).toBe("fixed");
    expect(s.top).toBe("136px"); // bottom(130) + gap(6)
    expect(s.right).toBe("780px"); // innerWidth(1000) - right(220)
    expect("bottom" in s).toBe(false);
    expect(s.maxHeight).toBeTruthy();
  });

  it("flips upward (anchors via bottom) when there's little room below", () => {
    setViewport(1000, 800);
    const { popoverStyle, openUp, place } = usePopoverPlacement();
    // trigger near the bottom: little room below, lots above
    place(trigger({ top: 700, bottom: 730 }));
    expect(openUp.value).toBe(true);
    const s = popoverStyle.value;
    expect(s.position).toBe("fixed");
    expect(s.bottom).toBe("106px"); // innerHeight(800) - top(700) + gap(6)
    expect("top" in s).toBe(false);
  });

  it("matchTriggerWidth pins the popover to the trigger width", () => {
    setViewport(1000, 800);
    const { popoverStyle, place } = usePopoverPlacement({ matchTriggerWidth: true });
    place(trigger({ top: 100, bottom: 130, left: 100, right: 220 }));
    expect(popoverStyle.value.minWidth).toBe("120px");
  });

  it("reposition() re-runs placement against the last trigger", () => {
    setViewport(1000, 800);
    const { popoverStyle, place, reposition } = usePopoverPlacement();
    place(trigger({ top: 100, bottom: 130 }));
    expect(popoverStyle.value.top).toBe("136px");
    setViewport(1000, 800);
    reposition();
    expect(popoverStyle.value.top).toBe("136px");
  });
});
