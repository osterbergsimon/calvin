/**
 * useTheme: D1 config migration, theme_api 2 allowlist enforcement and the
 * load-time fallback when the backend marks the selected theme unselectable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reactive, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

let config;
let themes;
const { setPartial } = vi.hoisted(() => ({ setPartial: vi.fn() }));

vi.mock("@/stores/config", () => ({ useConfigStore: () => config }));
vi.mock("@/stores/themes", () => ({ useThemesStore: () => themes }));
vi.mock("@/utils/kioskOverridesQueue", () => ({
  kioskOverridesQueue: () => ({ setPartial }),
}));

import { useTheme } from "@/composables/useTheme";

const flush = async () => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
};

const mountTheme = async () => {
  let theme;
  const Harness = defineComponent({
    setup() {
      theme = useTheme();
      return () => h("div");
    },
  });
  const wrapper = mount(Harness);
  await flush();
  return { theme, wrapper };
};

const lastSave = () => config.updateConfig.mock.calls.at(-1)?.[0] ?? {};

beforeEach(() => {
  // A Pinia store unwraps its refs, so the mock is a reactive plain object.
  config = reactive({
    themeMode: "auto",
    selectedTheme: null,
    darkModeStart: 18,
    darkModeEnd: 6,
    fetchConfig: vi.fn().mockResolvedValue(),
    updateConfig: vi.fn(async payload => {
      if ("themeMode" in payload) config.themeMode = payload.themeMode;
      if ("selectedTheme" in payload) config.selectedTheme = payload.selectedTheme;
    }),
  });
  themes = {
    getTheme: vi.fn(),
    setSelectedTheme: vi.fn(),
  };
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("D1: legacy Light/Dark theme migration", () => {
  it("maps Light to Calvin with the mode unchanged", async () => {
    config.selectedTheme = "light";
    config.themeMode = "auto";
    const { wrapper } = await mountTheme();

    expect(lastSave().selectedTheme).toBeNull();
    expect(lastSave().themeMode).toBe("auto");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    wrapper.unmount();
  });

  it("maps Dark to Calvin and sets the mode to dark", async () => {
    config.selectedTheme = "dark";
    config.themeMode = "auto";
    const { theme, wrapper } = await mountTheme();

    expect(lastSave().selectedTheme).toBeNull();
    expect(lastSave().themeMode).toBe("dark");
    expect(theme.themeMode.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    wrapper.unmount();
  });

  it("runs once: a second load does not save the migration again", async () => {
    config.selectedTheme = "light";
    const { theme, wrapper } = await mountTheme();
    const savesAfterMount = config.updateConfig.mock.calls.length;

    await theme.loadTheme();
    await flush();

    expect(config.updateConfig.mock.calls.length).toBe(savesAfterMount);
    wrapper.unmount();
  });

  it("leaves a normal theme selection alone", async () => {
    config.selectedTheme = "ocean";
    themes.getTheme.mockResolvedValue({ id: "ocean", variables: { "bg-0": "#d9ecf3" } });
    const { wrapper } = await mountTheme();

    // Loading a selection is not a change: nothing is written back.
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("H2: loading never writes the household config", () => {
  it("does not POST a kiosk's dark merged config on load", async () => {
    config.themeMode = "dark";
    config.selectedTheme = null;
    config.darkModeStart = 18;
    config.darkModeEnd = 6;

    const { wrapper } = await mountTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps an explicit mode change as the only save", async () => {
    const { theme, wrapper } = await mountTheme();
    config.updateConfig.mockClear();

    await theme.setThemeMode("dark");

    expect(config.updateConfig).toHaveBeenCalledTimes(1);
    expect(lastSave()).toMatchObject({ themeMode: "dark" });
    wrapper.unmount();
  });

  it("writes a target screen's overrides instead of the household config", async () => {
    const { theme, wrapper } = await mountTheme();

    await theme.saveTheme({ themeMode: "dark" }, { kioskId: "hallway" });

    expect(setPartial).toHaveBeenCalledWith(expect.objectContaining({ themeMode: "dark" }));
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("H3: a config change applies without a reload", () => {
  it("re-applies the mode when the config poll changes it", async () => {
    const { wrapper } = await mountTheme();
    expect(document.documentElement.classList.contains("light")).toBe(true);

    config.themeMode = "dark";
    await flush();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("re-applies a theme selected remotely", async () => {
    themes.getTheme.mockResolvedValue({
      id: "ocean",
      selectable: true,
      variables: { "bg-0": "#d9ecf3" },
      dark_mode: {},
    });
    const { wrapper } = await mountTheme();

    config.selectedTheme = "ocean";
    await flush();

    expect(document.documentElement.style.getPropertyValue("--bg-0")).toBe("#d9ecf3");
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("takes new dark hours from the config poll", async () => {
    const { theme, wrapper } = await mountTheme();

    config.darkModeStart = 21;
    config.darkModeEnd = 7;
    await flush();

    expect(theme.darkModeStart.value).toBe(21);
    expect(theme.darkModeEnd.value).toBe(7);
    expect(config.updateConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("saves an explicit dark-hours change", async () => {
    const { theme, wrapper } = await mountTheme();
    config.updateConfig.mockClear();

    await theme.setDarkModeTime(20, 8);

    expect(config.updateConfig).toHaveBeenCalledTimes(1);
    expect(lastSave()).toMatchObject({ darkModeStart: 20, darkModeEnd: 8 });
    wrapper.unmount();
  });
});

describe("theme_api 2 apply contract", () => {
  it("never writes a non-allowlisted key or an unsafe value", async () => {
    themes.getTheme.mockResolvedValue({
      id: "midnight",
      selectable: true,
      variables: {
        "bg-0": "#101020",
        "event-1": "#863427",
        "gap-4": "9rem",
        focus: "url(https://evil.example/x)",
        "bg-primary": "#ff0000",
      },
      dark_mode: {},
    });
    const { theme, wrapper } = await mountTheme();

    await theme.setSelectedTheme("midnight");
    await flush();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-0")).toBe("#101020");
    expect(root.style.getPropertyValue("--event-1")).toBe("#863427");
    expect(root.style.getPropertyValue("--gap-4")).toBe("");
    expect(root.style.getPropertyValue("--focus")).toBe("");
    expect(root.style.getPropertyValue("--bg-primary")).toBe("");
    wrapper.unmount();
  });

  it("falls back to Calvin when the selected theme is unselectable", async () => {
    themes.getTheme.mockResolvedValue({
      id: "broken",
      selectable: false,
      validation_errors: ["focus in light mode is not a valid colour"],
      variables: { "bg-0": "#ff00ff" },
      dark_mode: {},
    });
    const { theme, wrapper } = await mountTheme();

    await theme.setSelectedTheme("broken");
    await flush();

    expect(document.documentElement.style.getPropertyValue("--bg-0")).toBe("");
    expect(theme.selectedThemeId.value).toBe("broken");
    wrapper.unmount();
  });

  it("clears a previous theme's variables when switching back to Calvin", async () => {
    themes.getTheme.mockResolvedValue({
      id: "ocean",
      selectable: true,
      variables: { "bg-0": "#d9ecf3", "event-1": "#26844e" },
      dark_mode: {},
    });
    const { theme, wrapper } = await mountTheme();

    await theme.setSelectedTheme("ocean");
    await flush();
    expect(document.documentElement.style.getPropertyValue("--bg-0")).toBe("#d9ecf3");

    await theme.setSelectedTheme(null);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--bg-0")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--event-1")).toBe("");
    wrapper.unmount();
  });
});
