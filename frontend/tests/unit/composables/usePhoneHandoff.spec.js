/**
 * usePhoneHandoff: a touch screen that is not a phone gets the phone QR.
 * A landscape phone (667x375, 640x360) is a phone; the 800x480 kiosk is not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { usePhoneHandoff } from "@/composables/usePhoneHandoff";
import { KIOSK_ROOT_CLASS } from "@/styles/breakpoints.js";

vi.mock("@/composables/useTouchCapability", async () => {
  const { ref } = await import("vue");
  return { useTouchCapability: () => ({ isTouch: ref(true) }) };
});

const setViewport = (width, height) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};

const handoffAt = (width, height) => {
  setViewport(width, height);
  const scope = effectScope();
  const result = scope.run(() => usePhoneHandoff());
  const values = { handoff: result.isPhoneHandoff.value, phone: result.isPhone.value };
  scope.stop();
  return values;
};

describe("usePhoneHandoff", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    document.documentElement.classList.remove(KIOSK_ROOT_CLASS);
    setViewport(1024, 768);
  });

  it("offers the hand-off on a touch screen wider than a phone", () => {
    expect(handoffAt(1280, 800)).toEqual({ handoff: true, phone: false });
  });

  it("is a phone, with no hand-off, at phone width", () => {
    expect(handoffAt(390, 844)).toEqual({ handoff: false, phone: true });
  });

  it("keeps a landscape phone a phone (667x375 and 640x360)", () => {
    expect(handoffAt(667, 375)).toEqual({ handoff: false, phone: true });
    expect(handoffAt(640, 360)).toEqual({ handoff: false, phone: true });
  });

  it("still offers the hand-off on the 800x480 kiosk", () => {
    document.documentElement.classList.add(KIOSK_ROOT_CLASS);
    expect(handoffAt(800, 480)).toEqual({ handoff: true, phone: false });
  });

  it("follows a resize", () => {
    setViewport(1280, 800);
    const scope = effectScope();
    const { isPhoneHandoff } = scope.run(() => usePhoneHandoff());
    expect(isPhoneHandoff.value).toBe(true);
    setViewport(667, 375);
    window.dispatchEvent(new Event("resize"));
    expect(isPhoneHandoff.value).toBe(false);
    scope.stop();
  });
});
