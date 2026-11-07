// The Brightness group and display check inside Screens (calvin-29ws).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";
import DisplayCheckDialog from "@/components/settings/shared/DisplayCheckDialog.vue";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: { run: null } })),
    post: vi.fn(async () => ({ data: {} })),
  },
}));

const config = {
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  displayScheduleEnabled: false,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  touchControls: "auto",
  onScreenKeyboard: "auto",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, direction: "row", regions: [] } }],
  },
};

const FINDINGS = { ddc: true, writes: true, checkedAt: "2026-11-04T10:00:00Z" };

function mountScreens({ overrides = {}, displayCheck = FINDINGS, kioskId = null } = {}) {
  setActivePinia(createPinia());
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (kioskId) window.sessionStorage.setItem("calvin_kiosk_id", kioskId);
  const store = useKiosksStore();
  const row = {
    id: "kitchen",
    hostname: "kitchen-pi",
    lastSeen: new Date().toISOString(),
    agentVersion: null,
    agentUpdateStatus: "ok",
    agentUpdateRequested: false,
    overrides,
    displayStack: "cog",
    displayCheck,
  };
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = [row];
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(item => item.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  return { wrapper: mount(ScreensSettings, { props: { config } }), store };
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  await flushPromises();
};
async function open(wrapper) {
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flush();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("Screens › {screen} › Power › Brightness", () => {
  it("shows the Brightness group in the Power section of a screen", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await open(wrapper);
    const power = wrapper.find("#section-screen-power");
    expect(power.find("[data-test='brightness-group']").exists()).toBe(true);
  });

  it("saves the ramp toggle as a typed per-screen override", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    await open(wrapper);
    wrapper.findComponent(BrightnessGroup).vm.$emit("patch", {
      brightnessRampEnabled: true,
      brightness: 20,
    });
    await flush();
    expect(store.saveOverrides.mock.calls.at(-1)[0]).toBe("kitchen");
    expect(store.saveOverrides.mock.calls.at(-1)[1]).toMatchObject({
      brightnessRampEnabled: true,
      brightness: 20,
    });
  });

  it("lists a changed brightness setting in Changed here", async () => {
    const { wrapper } = mountScreens({ overrides: { brightnessRampEnabled: true } });
    await flushPromises();
    await open(wrapper);
    expect(wrapper.text()).toContain("Ramp brightness at sleep and wake");
    expect(wrapper.find("[data-test='changed-here-line']").exists()).toBe(true);
  });

  it("opens the display check when the group asks for it", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await open(wrapper);
    expect(wrapper.findComponent(DisplayCheckDialog).props("modelValue")).toBe(false);
    wrapper.findComponent(BrightnessGroup).vm.$emit("open-check", { step: "detect" });
    await flushPromises();
    const dialog = wrapper.findComponent(DisplayCheckDialog);
    expect(dialog.props("modelValue")).toBe(true);
    expect(dialog.props("kioskId")).toBe("kitchen");
  });

  it("starts the ramp once the first check passes the writes step", async () => {
    const { wrapper, store } = mountScreens({ displayCheck: null });
    await flushPromises();
    await open(wrapper);
    wrapper.findComponent(BrightnessGroup).vm.$emit("open-check", {
      step: "detect",
      enableAfter: true,
    });
    await flushPromises();
    wrapper.findComponent(DisplayCheckDialog).vm.$emit("writes-ok");
    await flush();
    expect(store.saveOverrides.mock.calls.at(-1)[1]).toMatchObject({
      brightnessRampEnabled: true,
    });
  });

  it("tells the dialog when this browser is the screen being checked", async () => {
    const { wrapper } = mountScreens({ kioskId: "kitchen" });
    await flushPromises();
    await open(wrapper);
    expect(wrapper.findComponent(DisplayCheckDialog).props("onPanel")).toBe(true);
  });

  it("says Dimming… then off under Screen now while the ramp is on", async () => {
    const { wrapper } = mountScreens({
      overrides: {
        brightnessRampEnabled: true,
        brightness: 19,
        screenNow: { power: "off", setAt: new Date().toISOString() },
      },
    });
    await flushPromises();
    await open(wrapper);
    expect(wrapper.find("[data-test='screen-now-dimming']").text()).toBe(
      "Dimming… then off · about 15 s"
    );
  });

  it("does not say Dimming… when the ramp is off", async () => {
    const { wrapper } = mountScreens({
      overrides: { screenNow: { power: "off", setAt: new Date().toISOString() } },
    });
    await flushPromises();
    await open(wrapper);
    expect(wrapper.find("[data-test='screen-now-dimming']").exists()).toBe(false);
  });
});

describe("Screens › Power › Brightness limit safety", () => {
  it("a calibration saved by the check caps the slider at once and keeps brightness under the limit", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { brightnessRampEnabled: true, brightness: 25 },
    });
    await flushPromises();
    await open(wrapper);
    wrapper.findComponent(DisplayCheckDialog).vm.$emit("patch", {
      brightnessConversion: [
        { ddc: 2, menu: 10 },
        { ddc: 26, menu: 60 },
      ],
      brightnessLimit: 26,
      brightness: 26,
      brightnessFloor: 2,
    });
    await flush();
    expect(wrapper.findComponent(BrightnessGroup).props("overrides").brightnessLimit).toBe(26);
    expect(store.saveOverrides.mock.calls.at(-1)[1]).toMatchObject({
      brightness: 22,
      brightnessLimit: 26,
      brightnessFloor: 2,
    });
    expect(wrapper.find("[data-test='brightness-slider']").attributes("max")).toBe("52"); // 22 on Calvin's scale is 52 on the panel's menu
  });

  it("tells the dialog whether the calibration save landed", async () => {
    const { wrapper, store } = mountScreens({ overrides: { brightnessRampEnabled: true } });
    await flushPromises();
    await open(wrapper);
    const save = wrapper.findComponent(DisplayCheckDialog).props("savePatch");
    const ok = save({ brightnessLimit: 26, brightnessFloor: 2 });
    await flush();
    expect(await ok).toBe(true);
    store.saveOverrides.mockRejectedValueOnce(new Error("offline"));
    const failed = save({ brightnessLimit: 24 });
    await flush();
    expect(await failed).toBe(false);
  });

  it("clamps a stored brightness when a patch changes the step", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { brightnessRampEnabled: true, brightness: 22, brightnessLimit: 26 },
    });
    await flushPromises();
    await open(wrapper);
    wrapper.findComponent(BrightnessGroup).vm.$emit("patch", { brightnessStep: 3 });
    await flush();
    expect(store.saveOverrides.mock.calls.at(-1)[1]).toMatchObject({
      brightnessStep: 3,
      brightness: 20,
    });
  });

  it("turns the screen on from the check's asleep state with the normal Turn on now", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { screenNow: { power: "off", setAt: new Date().toISOString() } },
    });
    await flushPromises();
    await open(wrapper);
    wrapper.findComponent(DisplayCheckDialog).vm.$emit("turn-on");
    await flush();
    expect(store.saveOverrides.mock.calls.at(-1)[1].screenNow.power).toBe("on");
  });
});

describe("Screens › Default", () => {
  it("has no Brightness rows, only a line saying where to set it", () => {
    setActivePinia(createPinia());
    const wrapper = mount(DefaultScreenSettings, {
      props: { config },
      global: { stubs: { RebootCombo: true } },
    });
    expect(wrapper.find("[data-test='brightness-group']").exists()).toBe(false);
    expect(wrapper.find("[data-test='default-brightness-note']").text()).toBe(
      "Brightness is set on each screen."
    );
  });
});
