// settings-scope §7 item 7 — the Screens with their own settings line and the
// section index on the Default page.
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";

const stubs = { DisplayScheduleGrid: true, RebootCombo: true };
const baseConfig = {
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  showUI: false,
  displayScheduleEnabled: false,
  displaySchedule: [],
  timezone: null,
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  availableScreens: null,
  defaultScreenId: null,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      { id: "home", name: "Home", layout: { version: 1, direction: "row", regions: [] } },
      { id: "photos", name: "Photos", layout: { version: 1, direction: "row", regions: [] } },
    ],
  },
};

const kiosk = (over = {}) => ({ id: "hall", hostname: "hall-pi", overrides: {}, ...over });

const mountDefault = (overrides = {}) =>
  mount(DefaultScreenSettings, {
    props: { config: { ...baseConfig, ...overrides } },
    global: { stubs },
  });

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
});

describe("DefaultScreenSettings — Screens with their own settings", () => {
  it("names each screen with the same count the Changed here line uses", () => {
    useKiosksStore().kiosks = [
      kiosk({
        id: "kitchen",
        overrides: {
          displayName: "Kitchen",
          selectedTheme: "ocean",
          focusLightMode: "always",
          hotCornerSize: 80,
          _deviceFingerprint: "abc",
          screenNow: { power: "off", setAt: "2026-11-03T10:00:00.000Z" },
        },
      }),
      kiosk({ id: "hall", overrides: { displayName: "Hallway", orientation: "portrait" } }),
      kiosk({ id: "office", overrides: { displayName: "Office" } }),
    ];
    const wrapper = mountDefault();

    const line = wrapper.find("[data-test='screens-with-own-settings']");
    expect(line.exists()).toBe(true);
    expect(line.text().replace(/\s+/g, " ").trim()).toBe(
      "Screens with their own settings: Kitchen (3), Hallway (1)"
    );
    expect(line.find("[data-test='own-screen-office']").exists()).toBe(false);
  });

  it("opens a screen when its name is clicked", async () => {
    useKiosksStore().kiosks = [
      kiosk({ id: "kitchen", overrides: { displayName: "Kitchen", orientation: "portrait" } }),
    ];
    const wrapper = mountDefault();

    await wrapper.find("[data-test='own-screen-kitchen']").trigger("click");
    expect(wrapper.emitted("open-screen")).toEqual([["kitchen"]]);
  });

  it("stays hidden when no screen has settings of its own", () => {
    useKiosksStore().kiosks = [
      kiosk({ id: "hall", overrides: { displayName: "Hallway" } }),
      kiosk({ id: "office", overrides: {} }),
    ];
    expect(mountDefault().find("[data-test='screens-with-own-settings']").exists()).toBe(false);
  });
});

describe("DefaultScreenSettings — section index", () => {
  it("links to the same section ids the deep links use", () => {
    const wrapper = mountDefault();
    const index = wrapper.find("[data-test='section-index']");
    expect(index.exists()).toBe(true);
    for (const id of [
      "default-pages",
      "screen-look",
      "layout",
      "screen-effects",
      "screen-controls",
      "device-power",
      "device-keyboard",
      "device-behaviour",
    ]) {
      const link = index.find(`[data-test='section-index-${id}']`);
      expect(link.exists(), id).toBe(true);
      expect(link.attributes("href")).toBe(`#section-${id}`);
      expect(wrapper.find(`#section-${id}`).exists(), id).toBe(true);
    }
  });

  it("renders a select on a phone", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    window.innerWidth = 390;
    window.innerHeight = 844;
    try {
      const wrapper = mountDefault();
      expect(wrapper.find("[data-test='section-index-select']").exists()).toBe(true);
      expect(wrapper.find("[data-test='section-index-screen-look']").exists()).toBe(false);
    } finally {
      window.innerWidth = originalWidth;
      window.innerHeight = originalHeight;
    }
  });
});
