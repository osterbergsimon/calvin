import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import api from "@/services/api";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useConfigStore } from "@/stores/config";

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

  it("a kiosk reads its merged config, not the Settings form's global value", () => {
    window.sessionStorage.setItem(KIOSK_KEY, "hallway");
    const config = useConfigStore();
    config.photoFrameEnabled = true; // merged config from /kiosks/hallway/config
    const setting = useScreenSetting("photoFrameEnabled", {
      serverValue: () => false, // global GET /api/config value
    });

    expect(setting.scope).toBe("kiosk");
    expect(setting.value.value).toBe(true);
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
});
