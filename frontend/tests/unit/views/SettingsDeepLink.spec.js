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
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.168.1.20:8000")),
  settingsLink: (base, id) => (id ? `${base}/settings?setting=${id}` : `${base}/settings`),
}));

import Settings from "@/views/Settings.vue";

const stubs = {
  SettingsSearch: true,
  CategoryRail: true,
  DisplaySettings: true,
  ContentSettings: {
    template: '<div><section id="section-content-images" class="images-section" /></div>',
  },
};

describe("Settings ?setting= deep link (F3/F4)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    route.query = {};
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens the destination's category and scrolls its section into view", async () => {
    route.query = { setting: "content-images" };
    const w = mount(Settings, { global: { stubs }, attachTo: document.body });
    await flushPromises();

    const section = document.getElementById("section-content-images");
    expect(section).not.toBeNull();
    expect(section.scrollIntoView).toHaveBeenCalled();
    w.unmount();
  });
});

describe("Settings phone hand-off (F2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
      "http://192.168.1.20:8000/settings?setting=content-calendars"
    );
  });
});
