import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
import { useUiScale } from "@/composables/useUiScale";
import { useConfigStore } from "@/stores/config";
import { useScreenSetting } from "@/composables/useScreenSetting";

describe("useUiScale", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it("applies the preset's scale factor to --ui-scale on :root", () => {
    const { applyUiScale, current } = useUiScale();
    applyUiScale("large");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.15");
    expect(current.value).toBe("large");
  });

  it("falls back to default (scale 1) for an unknown preset", () => {
    const { applyUiScale, current } = useUiScale();
    applyUiScale("gigantic");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1");
    expect(current.value).toBe("default");
  });

  it("applies the smallest extra-compact preset", () => {
    const { applyUiScale, current } = useUiScale();
    applyUiScale("extra-compact");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("0.7");
    expect(current.value).toBe("extra-compact");
  });

  it("loadUiScale restores the persisted preset before mount", () => {
    localStorage.setItem("calvin-ui-size", "compact");
    const { loadUiScale, current } = useUiScale();
    loadUiScale();
    expect(current.value).toBe("compact");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("0.85");
  });

  it("loadUiScale defaults to scale 1 when nothing is cached", () => {
    const { loadUiScale, current } = useUiScale();
    loadUiScale();
    expect(current.value).toBe("default");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1");
  });

  it("seeds from the server value for a screen that has never picked one (§2)", async () => {
    const config = useConfigStore();
    config.uiSize = "large";
    const { syncWithConfig, current } = useUiScale();
    syncWithConfig();
    await nextTick();
    expect(current.value).toBe("large");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.15");
    // The seed is a fallback, never a silent copy: the server key stays the
    // value for the next screen that opens Settings.
    expect(localStorage.getItem("calvin-ui-size")).toBeNull();
  });

  it("keeps this browser's own choice even when the server says otherwise", async () => {
    localStorage.setItem("calvin-ui-size", "compact");
    const config = useConfigStore();
    config.uiSize = "large";
    const { syncWithConfig, current } = useUiScale();
    syncWithConfig();
    await nextTick();
    expect(current.value).toBe("compact");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("0.85");
  });

  it("a choice made in this browser wins at once and survives a reload", async () => {
    const config = useConfigStore();
    config.uiSize = "default";
    const { syncWithConfig, current } = useUiScale();
    syncWithConfig();
    await nextTick();

    // What the Settings row does: store it for this screen, then repaint.
    const { set } = useScreenSetting("uiSize", { storageKey: "calvin-ui-size" });
    await set("extra-large");
    await nextTick();
    expect(current.value).toBe("extra-large");
    expect(localStorage.getItem("calvin-ui-size")).toBe("extra-large");
  });
});
