import { describe, it, expect, beforeEach, vi } from "vitest";
import { reactive } from "vue";

let config;

vi.mock("@/stores/config", () => ({ useConfigStore: () => config }));

import { useTypeTheme } from "@/composables/useTypeTheme";

const flush = async () => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
};

const fontDisplay = () => document.documentElement.style.getPropertyValue("--font-display");

describe("useTypeTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    localStorage.clear();
    config = reactive({
      typeTheme: null,
      hydrated: true,
      stale: false,
      updateConfig: vi.fn(async payload => {
        if ("typeTheme" in payload) config.typeTheme = payload.typeTheme;
      }),
    });
  });

  it("applies the requested theme's font roles to :root and saves it to the household config", async () => {
    const { applyTypeTheme, current } = useTypeTheme();
    await applyTypeTheme("marquee");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-display")).toContain("Space Grotesk");
    expect(root.style.getPropertyValue("--font-ui")).toContain("Inter");
    expect(root.style.getPropertyValue("--font-data")).toContain("JetBrains Mono");
    expect(current.value).toBe("marquee");
    expect(localStorage.getItem("calvin-type-theme")).toBe("marquee");
    expect(config.updateConfig).toHaveBeenCalledWith({ typeTheme: "marquee" });
  });

  it("falls back to instrument for an unknown id", async () => {
    const { applyTypeTheme, current } = useTypeTheme();
    await applyTypeTheme("nonsense");
    expect(current.value).toBe("instrument");
    expect(document.documentElement.style.getPropertyValue("--font-display")).toContain(
      "Plex Sans Condensed"
    );
  });

  it("loadTypeTheme restores the first-paint cache", () => {
    localStorage.setItem("calvin-type-theme", "station");
    const { loadTypeTheme, current } = useTypeTheme();
    loadTypeTheme();
    expect(current.value).toBe("station");
    // The boot cache is not a user change: nothing is written to the config.
    expect(config.updateConfig).not.toHaveBeenCalled();
  });

  it("does not cache a first-paint default as a browser choice", () => {
    const { loadTypeTheme, current } = useTypeTheme();
    loadTypeTheme();
    expect(current.value).toBe("instrument");
    expect(localStorage.getItem("calvin-type-theme")).toBeNull();
  });

  it("syncWithConfig applies the household font and ignores the stale browser value", async () => {
    localStorage.setItem("calvin-type-theme", "marquee");
    config.typeTheme = "station";

    const { syncWithConfig, current } = useTypeTheme();
    syncWithConfig();
    await flush();

    expect(current.value).toBe("station");
    expect(fontDisplay()).toContain("Schibsted Grotesk");
    expect(localStorage.getItem("calvin-type-theme")).toBe("station");
    expect(config.updateConfig).not.toHaveBeenCalled();
  });

  it("migrates the browser value once when the household has none", async () => {
    localStorage.setItem("calvin-type-theme", "marquee");
    config.typeTheme = null;

    const { syncWithConfig, current } = useTypeTheme();
    syncWithConfig();
    await flush();

    expect(current.value).toBe("marquee");
    expect(config.updateConfig).toHaveBeenCalledTimes(1);
    expect(config.updateConfig).toHaveBeenCalledWith({ typeTheme: "marquee" });
  });

  it("waits for the config to load before migrating", async () => {
    localStorage.setItem("calvin-type-theme", "station");
    config.typeTheme = null;
    config.hydrated = false;

    const { syncWithConfig } = useTypeTheme();
    syncWithConfig();
    await flush();

    expect(config.updateConfig).not.toHaveBeenCalled();

    config.hydrated = true;
    await flush();

    expect(config.updateConfig).toHaveBeenCalledWith({ typeTheme: "station" });
  });

  it("does not migrate from a stale offline config", async () => {
    localStorage.setItem("calvin-type-theme", "station");
    config.typeTheme = null;
    config.stale = true;

    const { syncWithConfig } = useTypeTheme();
    syncWithConfig();
    await flush();

    expect(config.updateConfig).not.toHaveBeenCalled();
  });

  it("applies a household font change from the config poll", async () => {
    config.typeTheme = "instrument";
    const { syncWithConfig, current } = useTypeTheme();
    syncWithConfig();
    await flush();

    config.typeTheme = "marquee";
    await flush();

    expect(current.value).toBe("marquee");
    expect(config.updateConfig).not.toHaveBeenCalled();
  });
});
