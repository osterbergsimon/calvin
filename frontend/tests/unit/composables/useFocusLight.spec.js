import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useFocusLight } from "@/composables/useFocusLight";

// calvin-3xz9: "interaction" follows touch/key/remote input, independent of
// whether the controls are hidden.
const mountFocusLight = config => {
  let light;
  const wrapper = mount(
    defineComponent({
      setup() {
        light = useFocusLight(config);
        return () => null;
      },
    })
  );
  return { wrapper, light };
};

const baseConfig = (overrides = {}) => ({
  regionsLocked: true,
  focusLightMode: "interaction",
  modeIndicatorTimeout: 5,
  showUI: false,
  shouldShowUI: false,
  ...overrides,
});

describe("useFocusLight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts off in interaction mode with the controls hidden", () => {
    const { light } = mountFocusLight(baseConfig());
    expect(light.lightActive.value).toBe(false);
  });

  it("shows on a touch even when the controls are hidden", () => {
    const { light } = mountFocusLight(baseConfig());
    window.dispatchEvent(new Event("pointerdown"));
    expect(light.lightActive.value).toBe(true);
  });

  it("shows on a key or remote press even when the controls are hidden", () => {
    const { light } = mountFocusLight(baseConfig());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(light.lightActive.value).toBe(true);
  });

  it("fades after a short idle using the existing input-feedback token", () => {
    const { light } = mountFocusLight(baseConfig({ modeIndicatorTimeout: 5 }));
    window.dispatchEvent(new Event("touchstart"));
    expect(light.lightActive.value).toBe(true);

    vi.advanceTimersByTime(4999);
    expect(light.lightActive.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(light.lightActive.value).toBe(false);
  });

  it("re-arms the idle wait on every input", () => {
    const { light } = mountFocusLight(baseConfig({ modeIndicatorTimeout: 5 }));
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(4000);
    window.dispatchEvent(new Event("keydown"));

    vi.advanceTimersByTime(4999);
    expect(light.lightActive.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(light.lightActive.value).toBe(false);
  });

  it("keeps the light up when the feedback timeout is 0 (never hide)", () => {
    const { light } = mountFocusLight(baseConfig({ modeIndicatorTimeout: 0 }));
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(60_000);
    expect(light.lightActive.value).toBe(true);
  });

  it("still honours always and off", () => {
    const always = mountFocusLight(baseConfig({ focusLightMode: "always" }));
    expect(always.light.lightActive.value).toBe(true);

    const off = mountFocusLight(baseConfig({ focusLightMode: "off" }));
    window.dispatchEvent(new Event("pointerdown"));
    expect(off.light.lightActive.value).toBe(false);
  });

  it("drops the light while the layout is unlocked", () => {
    const { light } = mountFocusLight(baseConfig({ regionsLocked: false }));
    window.dispatchEvent(new Event("pointerdown"));
    expect(light.lightActive.value).toBe(false);
  });
});
