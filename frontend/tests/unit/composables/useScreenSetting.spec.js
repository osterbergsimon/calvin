import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import api from "@/services/api";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useConfigStore } from "@/stores/config";
import { useNotificationsStore } from "@/stores/notifications";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

const KIOSK_KEY = "calvin_kiosk_id";

const mountBrowser = (defaultValue = "auto") => {
  const config = useConfigStore();
  config.onScreenKeyboard = defaultValue;
  return useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });
};

describe("useScreenSetting", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("uses the server value while this browser has no choice of its own", () => {
    const setting = mountBrowser("on");

    expect(setting.scope).toBe("browser");
    expect(setting.value.value).toBe("on");
  });

  it("writes this browser's choice to localStorage and uses it at once", async () => {
    const setting = mountBrowser("auto");

    await setting.set("off");

    expect(window.localStorage.getItem("calvin-osk-mode")).toBe("off");
    expect(setting.value.value).toBe("off");
  });

  it("reads a stored choice after a reload", () => {
    window.localStorage.setItem("calvin-osk-mode", "off");
    const setting = mountBrowser("auto");

    expect(setting.value.value).toBe("off");
  });

  it("ignores and never writes localStorage when the key has no browser layer", async () => {
    window.localStorage.setItem("calvin-screen-loadingLight", "pulse");
    const config = useConfigStore();
    config.loadingLight = "comet";
    const setting = useScreenSetting("loadingLight");

    expect(setting.value.value).toBe("comet");
    expect(setting.overridden.value).toBe(false);

    await setting.set("off");
    expect(window.localStorage.getItem("calvin-screen-loadingLight")).toBe("pulse");
    expect(setting.value.value).toBe("comet");
  });

  it("falls back to the server value when storage throws", () => {
    const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setting = mountBrowser("on");

    expect(setting.value.value).toBe("on");
    getItem.mockRestore();
  });

  it("keeps a browser choice for the page when writing storage throws", async () => {
    const setting = mountBrowser("auto");
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    await setting.set("on");

    expect(setting.value.value).toBe("on");
    setItem.mockRestore();
  });

  it("a kiosk row still follows the serverValue option it was given", () => {
    window.sessionStorage.setItem(KIOSK_KEY, "hallway");
    const config = useConfigStore();
    // The merged config has the override, but an existing #256 row reads the
    // Settings form value it passed in (its historical behaviour).
    config.onScreenKeyboard = "on";
    const setting = useScreenSetting("onScreenKeyboard", {
      serverValue: () => "off",
    });

    expect(setting.scope).toBe("kiosk");
    expect(setting.value.value).toBe("off");
  });

  it("round-trips a boolean choice without reading 'false' as true", async () => {
    const config = useConfigStore();
    config.showUI = true;
    // The composable still supports a browser layer for callers that declare
    // one; the showUI settings row no longer does.
    const setting = useScreenSetting("showUI", { browserLayer: true });

    expect(setting.value.value).toBe(true);
    await setting.set(false);

    expect(window.localStorage.getItem("calvin-screen-showUI")).toBe("false");
    expect(setting.value.value).toBe(false);
  });

  it("reads a stored boolean false after a reload", () => {
    window.localStorage.setItem("calvin-screen-showUI", "false");
    const config = useConfigStore();
    config.showUI = true;

    const setting = useScreenSetting("showUI", { browserLayer: true });

    expect(setting.value.value).toBe(false);
  });

  it("follows the household value for a setting without a browser layer", async () => {
    window.localStorage.setItem("calvin-screen-showUI", "false");
    const config = useConfigStore();
    config.showUI = true;

    const setting = useScreenSetting("showUI");

    expect(setting.value.value).toBe(true);
    await setting.set(false);
    // The write is a no-op; the Settings rows now write the household config or
    // the screen's overrides instead.
    expect(window.localStorage.getItem("calvin-screen-showUI")).toBe("false");
  });

  it("round-trips an array choice for a key that keeps a browser layer", async () => {
    const setting = useScreenSetting("demoSourceIds", { serverValue: () => [] });

    await setting.set(["src-a", "src-b"]);

    expect(window.localStorage.getItem("calvin-screen-demoSourceIds")).toBe('["src-a","src-b"]');
    expect(setting.value.value).toEqual(["src-a", "src-b"]);
  });

  it("merges a kiosk choice into that kiosk's whole overrides object", async () => {
    window.sessionStorage.setItem(KIOSK_KEY, "hallway");
    api.get.mockResolvedValue({ data: { overrides: { orientation: "portrait" } } });
    api.put.mockResolvedValue({ data: {} });
    const config = useConfigStore();
    config.onScreenKeyboard = "auto";
    const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

    expect(setting.scope).toBe("kiosk");
    await setting.set("on");

    expect(api.get).toHaveBeenCalledWith("/kiosks/hallway/overrides");
    expect(api.put).toHaveBeenCalledWith("/kiosks/hallway/overrides", {
      overrides: { orientation: "portrait", onScreenKeyboard: "on" },
    });
    expect(setting.value.value).toBe("on");
    expect(window.localStorage.getItem("calvin-osk-mode")).toBeNull();
  });

  it("keeps the kiosk's stored value and warns when the save fails", async () => {
    window.sessionStorage.setItem(KIOSK_KEY, "hallway");
    api.get.mockResolvedValue({ data: { overrides: { orientation: "portrait" } } });
    api.put.mockRejectedValue(new Error("offline"));
    const config = useConfigStore();
    config.onScreenKeyboard = "auto";
    const notifications = useNotificationsStore();
    const notify = vi.spyOn(notifications, "notify");
    const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

    await setting.set("on");

    expect(setting.value.value).toBe("auto");
    expect(config.onScreenKeyboard).toBe("auto");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: expect.stringContaining("unchanged") })
    );
  });

  describe("optimistic kiosk writes (calvin-g25v)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      window.sessionStorage.setItem(KIOSK_KEY, "hallway");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the chosen value while the save is still pending", async () => {
      api.get.mockResolvedValue({ data: { overrides: { orientation: "portrait" } } });
      api.put.mockImplementation(() => new Promise(() => {}));
      const config = useConfigStore();
      config.onScreenKeyboard = "auto";
      const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

      setting.set("on");

      expect(setting.value.value).toBe("on");
      expect(api.put).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(setting.value.value).toBe("on");
    });

    it("sends one kiosk save with the final value for two quick taps", async () => {
      api.get.mockResolvedValue({ data: { overrides: { orientation: "portrait" } } });
      api.put.mockResolvedValue({ data: {} });
      const config = useConfigStore();
      config.onScreenKeyboard = "auto";
      const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

      const first = setting.set("on");
      const second = setting.set("off");
      expect(setting.value.value).toBe("off");

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledWith("/kiosks/hallway/overrides", {
        overrides: { orientation: "portrait", onScreenKeyboard: "off" },
      });

      await Promise.all([first, second]);
    });

    it("restores the previous value before reporting a failed save", async () => {
      api.get.mockResolvedValue({ data: { overrides: { orientation: "portrait" } } });
      api.put.mockRejectedValue(new Error("offline"));
      const config = useConfigStore();
      config.onScreenKeyboard = "auto";
      const notifications = useNotificationsStore();
      const notify = vi.spyOn(notifications, "notify");
      const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

      const pending = setting.set("on");
      expect(setting.value.value).toBe("on");

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      await pending;

      expect(setting.value.value).toBe("auto");
      expect(config.onScreenKeyboard).toBe("auto");
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("unchanged"),
        })
      );
    });

    it("shows a later server change after a failed save", async () => {
      api.get.mockResolvedValue({ data: { overrides: { onScreenKeyboard: "auto" } } });
      api.put.mockRejectedValue(new Error("offline"));
      const config = useConfigStore();
      config.onScreenKeyboard = "auto";
      const setting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });

      const pending = setting.set("on");
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      await pending;
      expect(setting.value.value).toBe("auto");

      config.onScreenKeyboard = "off";
      await nextTick();
      expect(setting.value.value).toBe("off");
    });

    it("keeps another row's pending value when one row's save fails", async () => {
      api.get.mockResolvedValue({ data: { overrides: {} } });
      let rejectFirst;
      api.put
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirst = reject;
            })
        )
        .mockResolvedValueOnce({ data: {} });
      const config = useConfigStore();
      config.onScreenKeyboard = "auto";
      config.touchControls = "auto";
      const osk = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });
      const touch = useScreenSetting("touchControls", { storageKey: "calvin-touch-controls" });

      const first = osk.set("on");
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      const second = touch.set("off");
      expect(touch.value.value).toBe("off");

      rejectFirst(new Error("offline"));
      await first;
      expect(osk.value.value).toBe("auto");
      expect(touch.value.value).toBe("off");

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      await second;
      expect(api.put).toHaveBeenLastCalledWith("/kiosks/hallway/overrides", {
        overrides: { touchControls: "off" },
      });
    });
  });
});
