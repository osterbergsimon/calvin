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
  ClockBarSettings: { template: '<div class="clockbar-settings-stub" />' },
  DeviceSettings: { template: '<div class="device-settings-stub" />' },
  MaintenanceSettings: { template: '<div class="maintenance-settings-stub" />' },
  ContentSourcesCategory: true,
  PluginsCategory: true,
};

describe("Settings shell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    push.mockClear();
    sessionStorage.clear();
  });

  it("renders DisplaySettings for the default (dashboard) category", () => {
    const w = mount(Settings, { global: { stubs } });
    expect(w.find(".display-stub").exists()).toBe(true);
  });

  it("renders ClockBarSettings for the clock-bar category", async () => {
    const w = mount(Settings, { global: { stubs } });
    await w.find(".rail-stub").trigger("click");
    await flushPromises();
    expect(w.find(".clockbar-settings-stub").exists()).toBe(true);
    expect(w.find(".display-stub").exists()).toBe(false);
  });

  it("renders DeviceSettings for the device category", () => {
    sessionStorage.setItem("settings_active_category", "device");
    const w = mount(Settings, { global: { stubs } });
    expect(w.find(".device-settings-stub").exists()).toBe(true);
    expect(w.find(".display-stub").exists()).toBe(false);
  });

  it("renders MaintenanceSettings for the maintenance category", () => {
    sessionStorage.setItem("settings_active_category", "maintenance");
    const w = mount(Settings, { global: { stubs } });
    expect(w.find(".maintenance-settings-stub").exists()).toBe(true);
    expect(w.find(".display-stub").exists()).toBe(false);
  });
});
