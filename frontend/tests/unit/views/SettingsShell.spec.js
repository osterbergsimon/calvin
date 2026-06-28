import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const push = vi.fn();
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, path: "/settings" }),
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/composables/useConfigForm", () => ({
  useConfigForm: () => ({
    localConfig: { value: { orientation: "landscape" } },
    loadConfig: vi.fn().mockResolvedValue(),
    updateConfig: vi.fn().mockResolvedValue(),
    error: { value: "" },
    saveStatus: { value: { state: "idle", message: "" } },
  }),
}));

import Settings from "@/views/Settings.vue";

const stubs = {
  SettingsTopBar: { template: '<div class="topbar-stub" />' },
  SettingsSearch: { template: '<div class="search-stub" />' },
  CategoryRail: {
    props: ["categories", "activeId"],
    emits: ["select"],
    template: '<div class="rail-stub" @click="$emit(\'select\', \'clock-bar\')" />',
  },
  DisplaySettings: { template: '<div class="display-stub" />' },
  ClockBarCategory: { template: '<div class="clockbar-stub" />' },
  ContentSourcesCategory: true,
  PluginsCategory: true,
  DeviceCategory: true,
  MaintenanceCategory: true,
};

describe("Settings shell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    push.mockClear();
  });

  it("renders DisplaySettings for the default (dashboard) category", () => {
    const w = mount(Settings, { global: { stubs } });
    expect(w.find(".display-stub").exists()).toBe(true);
  });

  it("switches to an existing category component on rail select", async () => {
    const w = mount(Settings, { global: { stubs } });
    await w.find(".rail-stub").trigger("click");
    await flushPromises();
    expect(w.find(".clockbar-stub").exists()).toBe(true);
    expect(w.find(".display-stub").exists()).toBe(false);
  });
});
