import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { _resetSetupPromptForTests, useSetupPrompt } from "@/composables/useSetupPrompt";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.0.2.20:8000")),
  settingsLink: (base, id) => `${base}/settings${id ? `?setting=${id}` : ""}`,
}));

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/settings", component: { template: "<div/>" } },
    ],
  });

const mountEmpty = async (props = {}) => {
  const router = makeRouter();
  router.push("/");
  await router.isReady();
  const wrapper = mount(EmptyState, {
    props: {
      message: "No calendars yet",
      help: "Add one in Settings › Content › Calendars.",
      actionLabel: "Add a calendar",
      settingId: "content-calendars",
      ...props,
    },
    global: { plugins: [router] },
  });
  await flushPromises();
  return { wrapper, router };
};

describe("EmptyState (F3/F4)", () => {
  beforeEach(() => {
    useConfigStore().touchControls = "off";
  });

  it("renders the message, the path and the action", async () => {
    const { wrapper } = await mountEmpty();
    expect(wrapper.text()).toContain("No calendars yet");
    expect(wrapper.text()).toContain("Settings › Content › Calendars");
    expect(wrapper.find('[data-test="empty-state-action"]').text()).toBe("Add a calendar");
  });

  it("the button deep-links to /settings?setting=<id> and enters settings mode", async () => {
    const { wrapper, router } = await mountEmpty();
    await wrapper.find('[data-test="empty-state-action"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
    expect(router.currentRoute.value.query.setting).toBe("content-calendars");
    expect(useModeStore().currentMode).toBe(useModeStore().MODES.SETTINGS);
  });

  it("hides the phone hand-off on a non-touch screen", async () => {
    const { wrapper } = await mountEmpty();
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(false);
  });

  it("offers the phone hand-off with the LAN deep link on a touch screen (F2)", async () => {
    useConfigStore().touchControls = "on";
    const { wrapper } = await mountEmpty();
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/settings?setting=content-calendars"
    );
  });
});

describe("EmptyState setup prompt (CLV-20)", () => {
  const prompt = useSetupPrompt();
  const REGIONS = [
    { key: "r-cal", kind: "calendar" },
    { key: "r-photos", kind: "photos" },
    { key: "r-pages", kind: "service" },
  ];
  const MOUNTS = [
    { key: "r-cal", message: "No calendars yet", settingId: "content-calendars" },
    { key: "r-photos", message: "No photos yet", settingId: "content-images" },
    { key: "r-pages", message: "No web pages yet", settingId: "content-services" },
  ];

  const mountRegion = async region => {
    const router = makeRouter();
    router.push("/");
    await router.isReady();
    const wrapper = mount(EmptyState, {
      props: {
        message: region.message,
        help: "Fix it in Settings.",
        actionLabel: "Add",
        settingId: region.settingId,
        setup: true,
        regionKey: region.key,
      },
      global: { plugins: [router] },
    });
    await flushPromises();
    return wrapper;
  };

  beforeEach(() => {
    localStorage.clear();
    _resetSetupPromptForTests();
    useConfigStore().touchControls = "on";
    window.innerWidth = 1280;
    prompt.setContentRegions(REGIONS);
  });

  it("goes quiet behind the welcome card", async () => {
    prompt.setContentRegions(REGIONS.slice(0, 2));
    const wrappers = await Promise.all([mountRegion(MOUNTS[0]), mountRegion(MOUNTS[1])]);
    prompt.report("r-cal", { area: 400, height: 500 });
    prompt.report("r-photos", { area: 300, height: 500 });
    await nextTick();

    for (const wrapper of wrappers) {
      expect(wrapper.find(".empty-state--quiet").exists()).toBe(true);
      expect(wrapper.text()).not.toContain("Fix it in Settings.");
      expect(wrapper.find('[data-test="empty-state-action"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(false);
    }
  });

  it("shows exactly one QR across empty regions, in the largest area", async () => {
    const [cal, photos] = await Promise.all([mountRegion(MOUNTS[0]), mountRegion(MOUNTS[1])]);
    prompt.report("r-cal", { area: 200, height: 500 });
    prompt.report("r-photos", { area: 600, height: 500 });
    await flushPromises();

    expect(cal.find('[data-test="phone-setup"]').exists()).toBe(false);
    expect(photos.find('[data-test="phone-setup"]').exists()).toBe(true);
    // Spec §4.2: the gaps-mode hand-off uses the shortened hint.
    expect(photos.find('[data-test="phone-setup"]').text()).toContain("Typing is easier there.");
    // Two gaps: the phone opens Settings' landing page, not one guess.
    expect(photos.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/settings"
    );
    // The normal empty state (message, help, button) stays in gaps mode.
    expect(cal.find('[data-test="empty-state-action"]').exists()).toBe(true);
  });

  it("deep-links to the only missing setting", async () => {
    // The calendar region has content and never reports; photos is the one gap.
    prompt.setContentRegions([REGIONS[0], REGIONS[1]]);
    const photos = await mountRegion(MOUNTS[1]);
    prompt.report("r-photos", { area: 200, height: 500 });
    await flushPromises();

    expect(photos.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/settings?setting=content-images"
    );
  });

  it("hides the QR on a non-touch screen or at phone width", async () => {
    const cal = await mountRegion(MOUNTS[0]);
    prompt.report("r-cal", { area: 600, height: 500 });
    await nextTick();
    expect(cal.find('[data-test="phone-setup"]').exists()).toBe(true);

    useConfigStore().touchControls = "off";
    await nextTick();
    expect(cal.find('[data-test="phone-setup"]').exists()).toBe(false);

    useConfigStore().touchControls = "on";
    window.innerWidth = 600;
    window.dispatchEvent(new Event("resize"));
    await nextTick();
    expect(cal.find('[data-test="phone-setup"]').exists()).toBe(false);
  });

  it("moves the QR when the owner is too short for it", async () => {
    const [cal, photos] = await Promise.all([mountRegion(MOUNTS[0]), mountRegion(MOUNTS[1])]);
    prompt.report("r-cal", { area: 900, height: 300 }); // largest, but no room
    prompt.report("r-photos", { area: 200, height: 500 });
    await nextTick();

    expect(cal.find('[data-test="phone-setup"]').exists()).toBe(false);
    expect(photos.find('[data-test="phone-setup"]').exists()).toBe(true);
  });
});
