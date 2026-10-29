import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import SetupWelcomeCard from "@/components/dashboard/SetupWelcomeCard.vue";
import { useConfigStore } from "@/stores/config";
import { useAuthStore } from "@/stores/auth";
import { useModeStore } from "@/stores/mode";
import {
  _resetSetupPromptForTests,
  SETUP_WELCOME_DISMISSED_KEY,
  useSetupPrompt,
} from "@/composables/useSetupPrompt";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.168.1.20:8000")),
  settingsLink: (base, id) => `${base}/settings${id ? `?setting=${id}` : ""}`,
}));

const REGIONS = [
  { key: "cal", kind: "calendar" },
  { key: "photos", kind: "photos" },
  { key: "pages", kind: "service" },
];

const prompt = useSetupPrompt();

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/settings", component: { template: "<div/>" } },
    ],
  });

const openWelcome = (regions = REGIONS) => {
  prompt.setContentRegions(regions);
  for (const region of regions) {
    prompt.report(region.key, { area: 400, height: 500 });
  }
};

const mountCard = async () => {
  const router = makeRouter();
  router.push("/");
  await router.isReady();
  const wrapper = mount(SetupWelcomeCard, { global: { plugins: [router] } });
  await flushPromises();
  await nextTick();
  return { wrapper, router };
};

describe("SetupWelcomeCard (CLV-20)", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetSetupPromptForTests();
    window.innerWidth = 1280;
    window.innerHeight = 800;
    useConfigStore().touchControls = "on";
    // Known auth state: configured but locked, so no admin-password line and
    // no status request on mount.
    useAuthStore().applyStatus({ configured: true, authenticated: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the screen's kinds in layout order", async () => {
    openWelcome();
    const { wrapper } = await mountCard();
    const rows = wrapper.findAll('[data-test="setup-welcome-row"]');
    expect(rows.map(row => row.text())).toEqual([
      expect.stringContaining("Calendars"),
      expect.stringContaining("Photos"),
      expect.stringContaining("Web pages"),
    ]);
  });

  it("says 'Add here' on a touch kiosk and 'Add' elsewhere", async () => {
    openWelcome();
    let { wrapper } = await mountCard();
    expect(wrapper.find('[data-test="setup-welcome-add"]').text()).toBe("Add here");

    useConfigStore().touchControls = "off";
    await nextTick();
    expect(wrapper.find('[data-test="setup-welcome-add"]').text()).toBe("Add");
    wrapper.unmount();
  });

  it("routes each row to its own settings destination and enters settings", async () => {
    openWelcome();
    const { wrapper, router } = await mountCard();
    const buttons = wrapper.findAll('[data-test="setup-welcome-add"]');

    expect(buttons.map(button => button.attributes("data-setting"))).toEqual([
      "content-calendars",
      "content-images",
      "content-services",
    ]);

    await buttons[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
    expect(router.currentRoute.value.query.setting).toBe("content-images");
    expect(useModeStore().currentMode).toBe(useModeStore().MODES.SETTINGS);
  });

  it("shows ✓ Added for a kind configured while the card is open", async () => {
    openWelcome();
    const { wrapper } = await mountCard();
    expect(wrapper.text()).not.toContain("✓ Added");

    prompt.clear("cal");
    await flushPromises();

    expect(wrapper.findAll('[data-test="setup-welcome-done"]')[0].text()).toContain("✓ Added");
    expect(wrapper.find('[data-test="setup-welcome-announce"]').text()).toBe("Calendars added.");
    // The other gaps keep the card open.
    expect(wrapper.find('[data-test="setup-welcome"]').exists()).toBe(true);
  });

  it("shows the admin-password line only while auth is setup", async () => {
    useAuthStore().applyStatus({ configured: false, authenticated: false });
    openWelcome();
    let { wrapper } = await mountCard();
    expect(wrapper.find('[data-test="setup-welcome-auth"]').exists()).toBe(true);
    wrapper.unmount();

    useAuthStore().applyStatus({ configured: true, authenticated: false });
    openWelcome();
    ({ wrapper } = await mountCard());
    expect(wrapper.find('[data-test="setup-welcome-auth"]').exists()).toBe(false);
  });

  it("drops the lead, sub-lines and QR hint under 520px", async () => {
    window.innerHeight = 480;
    openWelcome();
    const { wrapper } = await mountCard();

    expect(wrapper.find(".setup-welcome--compact").exists()).toBe(true);
    expect(wrapper.find('[data-test="setup-welcome-lead"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Not added yet");
  });

  it("docks at the bottom without a QR on phone width", async () => {
    window.innerWidth = 390;
    openWelcome();
    const { wrapper } = await mountCard();

    expect(wrapper.find(".setup-welcome--phone").exists()).toBe(true);
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="setup-welcome-add"]').text()).toBe("Add");
    expect(wrapper.findAll('[data-test="setup-welcome-add"]')[0].classes()).toContain(
      "setup-welcome__btn--primary"
    );
  });

  it("'Not now' hides the card, persists, and falls back to gaps", async () => {
    openWelcome();
    const { wrapper } = await mountCard();

    await wrapper.find('[data-test="setup-welcome-dismiss"]').trigger("click");
    await flushPromises();

    expect(prompt.mode.value).toBe("gaps");
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe("1");
    expect(wrapper.find('[data-test="setup-welcome"]').exists()).toBe(false);
  });

  it("clears the flag once everything is configured", async () => {
    openWelcome();
    const { wrapper } = await mountCard();
    await wrapper.find('[data-test="setup-welcome-dismiss"]').trigger("click");
    await flushPromises();

    prompt.markSettled();
    for (const region of REGIONS) prompt.clear(region.key);
    await flushPromises();

    expect(prompt.mode.value).toBe("none");
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe(null);
  });

  it("still hides when storage throws", async () => {
    openWelcome();
    const { wrapper } = await mountCard();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    await wrapper.find('[data-test="setup-welcome-dismiss"]').trigger("click");
    await flushPromises();

    expect(prompt.mode.value).toBe("gaps");
  });
});
