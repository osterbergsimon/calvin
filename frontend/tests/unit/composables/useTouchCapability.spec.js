import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { useConfigStore } from "@/stores/config";

function mockPointer(coarse) {
  let handler = null;
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: query.includes("coarse") ? coarse : false,
    media: query,
    addEventListener: (_e, cb) => {
      handler = cb;
    },
    removeEventListener: vi.fn(),
  }));
  return () => handler && handler({ matches: !coarse });
}

describe("useTouchCapability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  // --- auto mode (default): follows (any-pointer: coarse) ---

  it("is true when a coarse pointer is present (auto)", () => {
    mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("is false when no coarse pointer is present (auto)", () => {
    mockPointer(false);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("updates when the media query changes (auto)", () => {
    const fire = mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
    fire(); // dispatch matches:false
    expect(isTouch.value).toBe(false);
  });

  // --- manual override ---

  it("'on' forces true even when no coarse pointer is present", () => {
    mockPointer(false);
    useConfigStore().touchControls = "on";
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("'off' forces false even when a coarse pointer is present", () => {
    mockPointer(true);
    useConfigStore().touchControls = "off";
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("reacts to the override changing at runtime", () => {
    mockPointer(false);
    const store = useConfigStore();
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
    store.touchControls = "on";
    expect(isTouch.value).toBe(true);
  });
});
