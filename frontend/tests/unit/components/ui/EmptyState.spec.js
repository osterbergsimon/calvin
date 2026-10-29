import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.168.1.20:8000")),
  settingsLink: (base, id) => `${base}/settings?setting=${id}`,
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
      help: "Add one in Settings › Content Sources › Calendars.",
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
    expect(wrapper.text()).toContain("Settings › Content Sources › Calendars");
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
      "http://192.168.1.20:8000/settings?setting=content-calendars"
    );
  });
});
