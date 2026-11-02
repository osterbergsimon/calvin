import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

const route = vi.hoisted(() => ({ query: {}, path: "/settings" }));
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.0.2.20:8000")),
  settingsLink: (base, id) => (id ? `${base}/settings?setting=${id}` : `${base}/settings`),
}));

import Settings from "@/views/Settings.vue";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import {
  collapseSettingsSection,
  isSettingsSectionExpanded,
} from "@/utils/settingsSectionExpansion";

function signInAsAdmin() {
  useAuthStore().applyStatus({ configured: true, authenticated: true });
  api.get.mockImplementation(url =>
    url === "/auth/status"
      ? Promise.resolve({ data: { configured: true, authenticated: true } })
      : Promise.resolve({ data: {} })
  );
}

const stubs = {
  SettingsSearch: true,
  CategoryRail: true,
  DashboardSettings: true,
  ScreensSettings: true,
  MaintenanceSettings: true,
  ContentSettings: {
    template: '<div><section id="section-content-photos" class="images-section" /></div>',
  },
};

describe("Settings ?setting= deep link (F3/F4)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsAdmin();
    route.query = {};
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens the destination's category and scrolls its section into view", async () => {
    route.query = { setting: "content-photos" };
    const w = mount(Settings, { global: { stubs }, attachTo: document.body });
    await flushPromises();

    const section = document.getElementById("section-content-photos");
    expect(section).not.toBeNull();
    expect(section.scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });
});

const section = (id, title) =>
  `<section id="section-${id}"><div class="settings-section__eyebrow">${title}</div></section>`;

describe("Settings ?setting= deep links after the category reorg", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsAdmin();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const activeCategory = w => w.findComponent({ name: "CategoryRail" }).props("activeId");

  it("opens Screens and scrolls to Power for device-reboot", async () => {
    route.query = { setting: "device-reboot" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          ScreensSettings: {
            template: `<div>${section("device-power", "All screens · Power")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("screens");
    expect(document.getElementById("section-device-power").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });

  it("hands the All-screens deep link to Screens so the Default page opens", async () => {
    route.query = { setting: "device-power" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          ScreensSettings: {
            props: ["initialSection"],
            template: `<div><span data-test="screens-initial">{{ initialSection }}</span>${section(
              "device-power",
              "Power"
            )}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("screens");
    expect(w.find("[data-test='screens-initial']").text()).toBe("device-power");
    expect(document.getElementById("section-device-power").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });

  it("opens System › Versions & status for device-hardware", async () => {
    route.query = { setting: "device-hardware" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          MaintenanceSettings: {
            template: `<div>${section("device-hardware", "Versions & status")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("maintenance");
    expect(document.getElementById("section-device-hardware").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });

  it("opens Screens and scrolls to the list for kiosks-software", async () => {
    route.query = { setting: "kiosks-software" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          ScreensSettings: {
            template: `<div>${section("screens-list", "Screens")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("screens");
    expect(document.getElementById("section-screens-list").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });

  it("opens Dashboard for clock-bar-items", async () => {
    route.query = { setting: "clock-bar-items" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          DashboardSettings: {
            template: `<div>${section("clock-bar-items", "Clock bar items")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("dashboard");
    expect(document.getElementById("section-clock-bar-items").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });

  it("opens Dashboard › Focus & remote for device-notifications", async () => {
    route.query = { setting: "device-notifications" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          DashboardSettings: {
            template: `<div>${section("kiosk-touch-focus", "Focus & remote")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("dashboard");
    expect(document.getElementById("section-kiosk-touch-focus").scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });
});

describe("Settings header after a deep link", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsAdmin();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const section = (id, title) =>
    `<section id="section-${id}"><div class="settings-section__eyebrow">${title}</div></section>`;
  const contentStub = {
    template: `<div>${section("content-photos", "Photos")}${section("content-services", "Services")}</div>`,
  };

  it("names the deep-linked section, not whichever short section follows it", async () => {
    route.query = { setting: "content-photos" };
    const w = mount(Settings, {
      global: { stubs: { ...stubs, ContentSettings: contentStub } },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise(r => requestAnimationFrame(r));
    await flushPromises();

    expect(w.find(".settings-topbar__location").text()).toBe("Photos");

    // A real user scroll hands the header back to the scroll-spy.
    window.dispatchEvent(new Event("wheel"));
    document.querySelector(".settings-content").dispatchEvent(new Event("scroll"));
    await new Promise(r => requestAnimationFrame(r));
    await flushPromises();
    expect(w.find(".settings-topbar__location").text()).toBe("Photos");
    w.unmount();
  });
});

describe("Settings phone hand-off (F2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsAdmin();
    route.query = {};
  });

  it("hides the phone button on a non-touch screen", async () => {
    useConfigStore().touchControls = "off";
    const w = mount(Settings, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-action="phone"]').exists()).toBe(false);
  });

  it("on a touch screen, shows a QR dialog for the current setting's LAN URL", async () => {
    useConfigStore().touchControls = "on";
    route.query = { setting: "content-calendars" };
    const w = mount(Settings, { global: { stubs } });
    await flushPromises();

    await w.find('[data-action="phone"]').trigger("click");
    await flushPromises();

    expect(w.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/settings?setting=content-calendars"
    );
  });
});

describe("Settings › Advanced deep links (§4)", () => {
  const activeCategory = w => w.findComponent({ name: "CategoryRail" }).props("activeId");

  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsAdmin();
    Element.prototype.scrollIntoView = vi.fn();
    collapseSettingsSection("maintenance-advanced");
  });

  it("opens the closed Advanced disclosure when a search destination targets it", async () => {
    route.query = { setting: "maintenance-diagnostics" };
    const w = mount(Settings, {
      global: {
        stubs: {
          ...stubs,
          MaintenanceSettings: {
            template: `<div>${section("maintenance-advanced", "Advanced")}</div>`,
          },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(activeCategory(w)).toBe("maintenance");
    expect(isSettingsSectionExpanded("maintenance-advanced")).toBe(true);
    expect(
      document.getElementById("section-maintenance-advanced").scrollIntoView
    ).toHaveBeenCalled();
    w.unmount();
  });
});
