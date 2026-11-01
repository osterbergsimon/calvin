/**
 * calvin-tnkg — the effective layout choice, applied to <html>.
 *
 * A kiosk's screen setting wins there; any other browser uses its own stored
 * choice; Auto leaves the class off so the viewport decides (today's rule).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useLayoutOverride } from "@/composables/useLayoutOverride";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useConfigStore } from "@/stores/config";
import { LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS } from "@/styles/breakpoints.js";

const classes = () => document.documentElement.classList;

describe("useLayoutOverride", () => {
  beforeEach(() => {
    classes().remove(LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS);
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it("applies a mode as the html class and falls back to Auto for a bad value", () => {
    const { applyLayoutMode, current } = useLayoutOverride();

    applyLayoutMode("desktop");
    expect(classes().contains(LAYOUT_DESKTOP_CLASS)).toBe(true);
    expect(current.value).toBe("desktop");

    expect(applyLayoutMode("sideways")).toBe("auto");
    expect(classes().contains(LAYOUT_DESKTOP_CLASS)).toBe(false);
    expect(current.value).toBe("auto");
  });

  it("boots from this browser's stored choice", async () => {
    localStorage.setItem("calvin-layout-mode", "phone");
    const { syncWithConfig, current } = useLayoutOverride();

    syncWithConfig();
    await nextTick();

    expect(current.value).toBe("phone");
    expect(classes().contains(LAYOUT_PHONE_CLASS)).toBe(true);
  });

  it("leaves both classes off for Auto", async () => {
    const { syncWithConfig, current } = useLayoutOverride();

    syncWithConfig();
    await nextTick();

    expect(current.value).toBe("auto");
    expect(classes().contains(LAYOUT_DESKTOP_CLASS)).toBe(false);
    expect(classes().contains(LAYOUT_PHONE_CLASS)).toBe(false);
  });

  it("follows a choice made in Settings at once", async () => {
    const { syncWithConfig, current } = useLayoutOverride();
    syncWithConfig();
    await nextTick();

    // What the Settings row does.
    const { set } = useScreenSetting("layoutMode", { storageKey: "calvin-layout-mode" });
    await set("desktop");
    await nextTick();

    expect(current.value).toBe("desktop");
    expect(classes().contains(LAYOUT_DESKTOP_CLASS)).toBe(true);
    expect(localStorage.getItem("calvin-layout-mode")).toBe("desktop");
  });

  it("prefers the kiosk's screen setting over a browser choice left behind", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "hallway");
    localStorage.setItem("calvin-layout-mode", "phone");
    const config = useConfigStore();
    config.layoutMode = "desktop";

    const { syncWithConfig, current } = useLayoutOverride();
    syncWithConfig();
    await nextTick();

    expect(current.value).toBe("desktop");
    expect(classes().contains(LAYOUT_DESKTOP_CLASS)).toBe(true);
    expect(classes().contains(LAYOUT_PHONE_CLASS)).toBe(false);
  });
});
