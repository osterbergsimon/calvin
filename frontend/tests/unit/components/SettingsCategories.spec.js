import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardCategory from "@/components/settings/categories/DashboardCategory.vue";
import ContentSourcesCategory from "@/components/settings/categories/ContentSourcesCategory.vue";
import DeviceCategory from "@/components/settings/categories/DeviceCategory.vue";
import MaintenanceCategory from "@/components/settings/categories/MaintenanceCategory.vue";
import TabNavigation from "@/components/settings/shared/TabNavigation.vue";

const config = {
  orientation: "landscape",
  gitRepoUrl: "https://github.com/example/calvin.git",
  gitBranch: "main",
};

const childStubs = {
  SettingsTab: { template: "<div><slot /></div>" },
  DashboardLayoutTab: true,
  CalendarDisplayTab: true,
  PluginDisplayTab: true,
  UITab: true,
  PhotosTab: true,
  ImagesTab: true,
  ServicesTab: true,
  CalendarSourcesTab: true,
  PowerTab: true,
  KeyboardTab: true,
  RebootComboTab: true,
  HardwareTab: true,
  UpdatesTab: true,
  DebugTab: true,
};

describe("settings category IA", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it("groups dashboard settings around layout and UI", () => {
    const wrapper = mount(DashboardCategory, {
      props: { config },
      global: { stubs: childStubs },
    });

    const tabs = wrapper.findComponent(TabNavigation).props("tabs");

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Layout",
      "Calendar Display",
      "Plugin Display",
      "UI, Theme & Clock",
    ]);
  });

  it("groups content source settings around calendars, photos, images, and services", () => {
    const wrapper = mount(ContentSourcesCategory, {
      props: { config },
      global: { stubs: childStubs },
    });

    const tabs = wrapper.findComponent(TabNavigation).props("tabs");

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Calendars",
      "Photos",
      "Image Sources",
      "Services",
    ]);
  });

  it("groups device settings around power, keyboard, and hardware", () => {
    const wrapper = mount(DeviceCategory, {
      props: {
        config,
        version: "backend-version",
        frontendVersion: "frontend-version",
      },
      global: { stubs: childStubs },
    });

    const tabs = wrapper.findComponent(TabNavigation).props("tabs");

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Power & Display",
      "Keyboard",
      "Reboot Combo",
      "Hardware",
    ]);
  });

  it("groups maintenance settings around updates and diagnostics", () => {
    const wrapper = mount(MaintenanceCategory, {
      props: {
        config,
        gitRepoUrl: config.gitRepoUrl,
        gitBranch: config.gitBranch,
      },
      global: { stubs: childStubs },
    });

    const tabs = wrapper.findComponent(TabNavigation).props("tabs");

    expect(tabs.map((tab) => tab.label)).toEqual(["Updates", "Diagnostics"]);
  });
});
