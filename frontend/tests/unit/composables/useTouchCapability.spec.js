import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTouchCapability } from "@/composables/useTouchCapability";

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
  });

  it("is true when pointer is coarse", () => {
    mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("is false when pointer is fine", () => {
    mockPointer(false);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("updates when the media query changes", () => {
    const fire = mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
    fire(); // dispatch matches:false
    expect(isTouch.value).toBe(false);
  });
});
