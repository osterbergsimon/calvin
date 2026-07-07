import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { useConfigStore } from "@/stores/config";

function mockPointer({ coarse = false, fine = false } = {}) {
  let coarseHandler = null;
  window.matchMedia = vi.fn().mockImplementation(query => {
    const isCoarse = query.includes("coarse");
    const isFine = query.includes("fine");
    return {
      matches: isCoarse ? coarse : isFine ? fine : false,
      media: query,
      addEventListener: (_e, cb) => {
        if (isCoarse) coarseHandler = cb;
      },
      removeEventListener: vi.fn(),
    };
  });
  return () => coarseHandler && coarseHandler({ matches: !coarse });
}

function setMaxTouchPoints(n) {
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: n });
}

describe("useTouchCapability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMaxTouchPoints(0); // deterministic baseline; individual tests raise it
    setActivePinia(createPinia());
  });

  // --- auto mode (default): follows (any-pointer: coarse) ---

  it("is true when a coarse pointer is present (auto)", () => {
    mockPointer({ coarse: true });
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("is false when no coarse pointer is present (auto)", () => {
    mockPointer({ coarse: false });
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("updates when the media query changes (auto)", () => {
    const fire = mockPointer({ coarse: true });
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
    fire(); // dispatch matches:false
    expect(isTouch.value).toBe(false);
  });

  // --- maxTouchPoints fallback: touchscreens that don't match (any-pointer: coarse) ---

  it("is true when maxTouchPoints > 0 even without a coarse pointer (auto)", () => {
    mockPointer({ coarse: false });
    setMaxTouchPoints(5);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("'off' still overrides a device that reports touch points", () => {
    mockPointer({ coarse: false });
    setMaxTouchPoints(5);
    useConfigStore().touchControls = "off";
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  // --- manual override ---

  it("'on' forces true even when no coarse pointer is present", () => {
    mockPointer({ coarse: false });
    useConfigStore().touchControls = "on";
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("'off' forces false even when a coarse pointer is present", () => {
    mockPointer({ coarse: true });
    useConfigStore().touchControls = "off";
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("reacts to the override changing at runtime", () => {
    mockPointer({ coarse: false });
    const store = useConfigStore();
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
    store.touchControls = "on";
    expect(isTouch.value).toBe(true);
  });
});

describe("useTouchCapability hasPointer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMaxTouchPoints(0);
    setActivePinia(createPinia());
  });

  it("is true when a fine (mouse) pointer is present, even without touch", () => {
    mockPointer({ fine: true, coarse: false });
    const { hasPointer, isTouch } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
    expect(isTouch.value).toBe(false); // mouse is not touch
  });

  it("is true when a coarse (touch) pointer is present", () => {
    mockPointer({ coarse: true });
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
  });

  it("is false when neither fine nor coarse pointer is present (keyboard-only)", () => {
    mockPointer({ fine: false, coarse: false });
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(false);
  });

  it("'off' forces false even with a fine pointer", () => {
    mockPointer({ fine: true });
    useConfigStore().touchControls = "off";
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(false);
  });

  it("'on' forces true with no pointer at all", () => {
    mockPointer({ fine: false, coarse: false });
    useConfigStore().touchControls = "on";
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
  });
});
