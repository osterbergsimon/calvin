import { ref } from "vue";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Real refs so useFitScroll's computeds track them (plain {value} won't react).
const caps = { hasPointer: ref(true) };
const clamp = { fits: ref(0), hasOverflow: ref(false), recompute: vi.fn() };

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => caps,
}));
vi.mock("@/composables/useFitClamp", () => ({
  useFitClamp: () => clamp,
}));

import { useFitScroll } from "@/composables/useFitScroll";

describe("useFitScroll", () => {
  beforeEach(() => {
    caps.hasPointer.value = true;
    clamp.fits.value = 0;
    clamp.hasOverflow.value = false;
  });

  it("pointer present → scroll+snap style on the block axis", () => {
    const { clampStyle } = useFitScroll(ref(null), { axis: "block", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ overflowY: "auto", scrollSnapType: "y proximity" });
  });

  it("keyboard-only → clamp to fits on the block axis", () => {
    caps.hasPointer.value = false;
    clamp.fits.value = 120;
    const { clampStyle } = useFitScroll(ref(null), { axis: "block", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ maxBlockSize: "120px", overflowY: "hidden" });
  });

  it("inline axis maps to the X properties", () => {
    const { clampStyle } = useFitScroll(ref(null), { axis: "inline", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ overflowX: "auto", scrollSnapType: "x proximity" });
    caps.hasPointer.value = false;
    clamp.fits.value = 90;
    expect(clampStyle.value).toEqual({ maxInlineSize: "90px", overflowX: "hidden" });
  });

  it("shadeClass adds the directional modifier only when pointer AND overflow", () => {
    const { shadeClass, showShade } = useFitScroll(ref(null), { axis: "inline", itemSelector: ".x" });
    expect(showShade.value).toBe(false); // no overflow yet
    clamp.hasOverflow.value = true;
    expect(showShade.value).toBe(true);
    expect(shadeClass.value).toEqual([
      "calvin-plugin-scroll-shade",
      { "calvin-plugin-scroll-shade--inline": true },
    ]);
    caps.hasPointer.value = false; // keyboard-only: no shade even with overflow
    expect(showShade.value).toBe(false);
    expect(shadeClass.value).toEqual([
      "calvin-plugin-scroll-shade",
      { "calvin-plugin-scroll-shade--inline": false },
    ]);
  });
});
