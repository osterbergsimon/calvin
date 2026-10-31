import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("@/services/pluginsApi", () => ({
  getPlugins: vi
    .fn()
    .mockResolvedValue({ plugins: [{ id: "midnight", name: "Midnight", type: "theme" }] }),
  getPlugin: vi.fn().mockResolvedValue({}),
}));
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
const stubs = {
  // The popover teleports to <body>; stub Teleport so it renders in-place and
  // stays findable within the wrapper for these assertions.
  teleport: true,
  ThemeSelector: {
    name: "ThemeSelector",
    props: ["themes", "selectedThemeId", "loading", "dark"],
    emits: ["select"],
    template: '<div class="theme-selector-stub" @click="$emit(\'select\', themes[1]?.id)" />',
  },
};

describe("ThemePicker", () => {
  it("lists Calvin first, then installed themes", async () => {
    const w = mount(ThemePicker, { props: { selectedThemeId: null }, global: { stubs } });
    await flushPromises();
    await w.get(".theme-picker__trigger").trigger("click");
    const selector = w.findComponent({ name: "ThemeSelector" });
    expect(selector.props("themes").map(theme => theme.name)).toEqual(["Calvin", "Midnight"]);
    expect(selector.props("selectedThemeId")).toBe("calvin");
    w.unmount();
  });

  it("emits null when Calvin is chosen", async () => {
    const w = mount(ThemePicker, {
      props: { selectedThemeId: "midnight" },
      global: {
        stubs: {
          ...stubs,
          ThemeSelector: {
            name: "ThemeSelector",
            props: ["themes", "selectedThemeId", "loading", "dark"],
            emits: ["select"],
            template: "<div class=\"calvin-stub\" @click=\"$emit('select', 'calvin')\" />",
          },
        },
      },
    });
    await flushPromises();
    await w.get(".theme-picker__trigger").trigger("click");
    await w.get(".calvin-stub").trigger("click");
    expect(w.emitted("select")[0]).toEqual([null]);
    w.unmount();
  });

  it("opens the popover and emits select", async () => {
    const w = mount(ThemePicker, {
      props: { selectedThemeId: null },
      global: { stubs },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.find(".theme-picker__panel").exists()).toBe(false);
    await w.get(".theme-picker__trigger").trigger("click");
    expect(w.find(".theme-picker__panel").exists()).toBe(true);
    await w.get(".theme-selector-stub").trigger("click");
    expect(w.emitted("select")[0]).toEqual(["midnight"]);
    expect(w.find(".theme-picker__panel").exists()).toBe(false); // closes after select
    w.unmount();
  });

  it("names the built-in palette when no theme is selected (F8)", async () => {
    const w = mount(ThemePicker, { props: { selectedThemeId: null }, global: { stubs } });
    await flushPromises();
    expect(w.get(".theme-picker__label").text()).toBe("Calvin");
  });

  it("shows the selected theme's name", async () => {
    const w = mount(ThemePicker, { props: { selectedThemeId: "midnight" }, global: { stubs } });
    await flushPromises();
    expect(w.get(".theme-picker__label").text()).toBe("Midnight");
  });
});
