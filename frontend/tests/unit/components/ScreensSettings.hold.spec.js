// A screen switched by home automation (calvin-2ifv, calvin-25g9): the power
// row says who set it and when, "Back to schedule" ends a Schedule command with
// one call, and a person's press is one call too (no hold followed by a save).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises as flushPromisesNow } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";

async function flushPromises() {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  await flushPromisesNow();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const week = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  day,
  enabled: true,
  onTime: "06:30",
  offTime: "22:00",
}));

const config = (over = {}) => ({
  orientation: "landscape",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, regions: [] } }],
  },
  timeFormat: "24h",
  timezone: "UTC",
  screenPower: "schedule",
  displayScheduleEnabled: true,
  displaySchedule: week,
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  ...over,
});

const COMMAND = {
  power: "off",
  setAt: "2026-11-21T21:04:00Z",
  by: "automation",
  keyName: "Homey",
  until: "2026-11-21T22:00:00Z",
};

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  agentUpdateStatus: "ok",
  agentUpdateRequested: false,
  paired: true,
  overrides: {},
  ...over,
});

function mountScreens({ kiosks = [kiosk()], overrides = {}, cfg = config(), view = null } = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn();
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  store.fetchScreenPower = vi.fn(async id => {
    const target = store.kiosks.find(k => k.id === id);
    const answer = view ? { id, mode: cfg.screenPower, held: true, ...view } : null;
    if (target && answer) target.screenPowerView = answer;
    return answer;
  });
  store.setScreenPower = vi.fn(async (id, power) => {
    const target = store.kiosks.find(k => k.id === id);
    const answer = {
      id,
      mode: cfg.screenPower,
      power,
      held: power !== "schedule",
      setAt: power === "schedule" ? null : new Date().toISOString(),
      by: power === "schedule" ? null : "settings",
      until: null,
      keyName: null,
      desiredOn: power !== "off",
      online: true,
      agentHolds: true,
      paired: true,
    };
    if (target) target.screenPowerView = answer;
    return answer;
  });
  const wrapper = mount(ScreensSettings, { props: { config: cfg } });
  return { wrapper, store };
}

async function open(wrapper) {
  await flushPromises();
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushPromises();
}

const text = (wrapper, test) => wrapper.find(`[data-test='${test}']`).text();

describe("ScreensSettings — a command from home automation", () => {
  it("says who set it, when, and when a Schedule command ends", async () => {
    const { wrapper } = mountScreens({ view: COMMAND });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set by Homey at 21:04");
    expect(text(wrapper, "screen-now-until")).toBe("Until the next scheduled change at 22:00");
    expect(text(wrapper, "screen-now-follow")).toBe("Back to schedule");
    expect(wrapper.find("[data-test='screen-now-off']").attributes("aria-disabled")).toBe("true");
    expect(wrapper.find("[data-test='screen-now-on']").attributes("aria-disabled")).toBeUndefined();
    expect(wrapper.find("[data-test='screen-now-old-agent']").exists()).toBe(false);
  });

  it("says set by home automation when the server sends no key name", async () => {
    const { wrapper } = mountScreens({ view: { ...COMMAND, keyName: null } });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set by home automation at 21:04");
  });

  it("Back to schedule ends the command with one call and keeps the layer", async () => {
    const { wrapper, store } = mountScreens({ view: COMMAND });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-follow']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(store.setScreenPower).toHaveBeenCalledTimes(1);
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
  });

  it("a failed Back to schedule says so and keeps the command", async () => {
    const { wrapper, store } = mountScreens({ view: COMMAND });
    store.setScreenPower = vi.fn(async () => {
      throw new Error("offline");
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-follow']").trigger("click");
    await flushPromises();
    expect(text(wrapper, "screen-now-message")).toBe(
      "Couldn't reach Calvin. Check that it's running and on the same network."
    );
    expect(wrapper.find("[data-test='screen-now-message']").classes()).toContain(
      "inline-note--err"
    );
    expect(text(wrapper, "screen-now-state")).toBe("Off · set by Homey at 21:04");
  });

  it("Turn on now is one call, not a hold to end and a choice to save", async () => {
    const { wrapper, store } = mountScreens({ view: COMMAND });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-on']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledTimes(1);
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "on");
    expect(store.saveOverrides).not.toHaveBeenCalled();
  });
});
