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
  ThemeSelector: {
    name: "ThemeSelector",
    props: ["themes", "selectedThemeId", "loading"],
    emits: ["select"],
    template: '<div class="theme-selector-stub" @click="$emit(\'select\', themes[0]?.id)" />',
  },
};

describe("ThemePicker", () => {
  it("opens the popover and emits select", async () => {
    const w = mount(ThemePicker, {
      props: { selectedThemeId: null },
      global: { stubs },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.find(".theme-picker__popover").exists()).toBe(false);
    await w.get(".theme-picker__trigger").trigger("click");
    expect(w.find(".theme-picker__popover").exists()).toBe(true);
    await w.get(".theme-selector-stub").trigger("click");
    expect(w.emitted("select")[0]).toEqual(["midnight"]);
    expect(w.find(".theme-picker__popover").exists()).toBe(false); // closes after select
    w.unmount();
  });
});
