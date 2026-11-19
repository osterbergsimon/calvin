// A screen held on or off by home automation (calvin-2ifv): the power row says
// so, "Back to schedule" ends the hold, and a person's own choice replaces it.
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const config = () => ({
  orientation: "landscape",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, regions: [] } }],
  },
  displayScheduleEnabled: false,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
});

const HOLD = { power: "off", setAt: "2026-11-18T12:00:00Z", by: "automation" };

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  agentUpdateStatus: "ok",
  agentUpdateRequested: false,
  overrides: {},
  powerHold: null,
  agentHolds: true,
  ...over,
});

function mountScreens({ kiosks = [kiosk()], overrides = {} } = {}) {
  setActivePinia(createPinia());
  delete window.matchMedia;
  const store = useKiosksStore();
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
    const hold = target?.powerHold ?? null;
    return { id, held: Boolean(hold), ...(hold ?? { power: "schedule" }) };
  });
  store.setScreenPower = vi.fn(async (id, power) => {
    const target = store.kiosks.find(k => k.id === id);
    if (target) target.powerHold = null;
    return { id, power, held: false, setAt: null, by: null, desiredOn: true };
  });
  const wrapper = mount(ScreensSettings, { props: { config: config() } });
  return { wrapper, store };
}

async function open(wrapper) {
  await flushPromises();
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushPromises();
}

const text = (wrapper, test) => wrapper.find(`[data-test='${test}']`).text();

describe("ScreensSettings — a held screen", () => {
  it("says the screen is held by home automation", async () => {
    const { wrapper } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe(
      "Off, set by home automation. The schedule is paused."
    );
    expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
    expect(text(wrapper, "screen-now-follow")).toBe("Back to schedule");
    expect(wrapper.find("[data-test='screen-now-off']").attributes("disabled")).toBeDefined();
    expect(wrapper.find("[data-test='screen-now-on']").attributes("disabled")).toBeUndefined();
    expect(wrapper.find("[data-test='screen-now-old-agent']").exists()).toBe(false);
  });

  it("says who else can hold it", async () => {
    const on = mountScreens({
      kiosks: [kiosk({ powerHold: { ...HOLD, power: "on", by: "settings" } })],
    });
    await open(on.wrapper);
    expect(text(on.wrapper, "screen-now-state")).toBe(
      "On until someone changes it. The schedule is paused."
    );

    const off = mountScreens({
      kiosks: [kiosk({ powerHold: { ...HOLD, power: "off", by: "settings" } })],
    });
    await open(off.wrapper);
    expect(text(off.wrapper, "screen-now-state")).toBe(
      "Off until someone changes it. The schedule is paused."
    );
  });

  it("ignores a stale manual choice while held", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ powerHold: { ...HOLD, power: "on" } })],
      overrides: { screenNow: { power: "off", setAt: new Date().toISOString() } },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe(
      "On, set by home automation. The schedule is paused."
    );
  });

  it("Back to schedule ends the hold through the screen-power call", async () => {
    const { wrapper, store } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-follow']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(text(wrapper, "screen-now-state")).toBe("On now");
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
  });

  it("a failed Back to schedule says so and keeps the hold", async () => {
    const { wrapper, store } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
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
    expect(text(wrapper, "screen-now-state")).toBe(
      "Off, set by home automation. The schedule is paused."
    );
  });

  it("Turn on now ends the hold, then saves the choice as today", async () => {
    const { wrapper, store } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-on']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      screenNow: { power: "on", setAt: expect.any(String) },
    });
    const order = [
      store.setScreenPower.mock.invocationCallOrder[0],
      store.saveOverrides.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);
  });

  it("Turn off now on a page that hasn't seen a new hold still ends it", async () => {
    const { wrapper, store } = mountScreens();
    await open(wrapper);
    // Home automation held it after the page loaded; the page still says not held.
    store.fetchScreenPower = vi.fn(async id => ({ id, held: true, ...HOLD, power: "on" }));
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(store.fetchScreenPower).toHaveBeenCalledWith("kitchen");
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      screenNow: { power: "off", setAt: expect.any(String) },
    });
  });

  it("a failed hold check still saves the person's choice", async () => {
    const { wrapper, store } = mountScreens();
    await open(wrapper);
    store.fetchScreenPower = vi.fn(async () => {
      throw new Error("offline");
    });
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).not.toHaveBeenCalled();
    expect(store.saveOverrides).toHaveBeenCalled();
  });

  it("says the hold ended when turning the screen on failed to save", async () => {
    const { wrapper, store } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
    store.saveOverrides = vi.fn(async () => {
      throw new Error("offline");
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-on']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(text(wrapper, "screen-now-message")).toBe(
      "The screen is back on its schedule, but turning it on didn't save. Try again."
    );
    expect(wrapper.find("[data-test='screen-now-message']").classes()).toContain(
      "inline-note--err"
    );
  });

  it("says the hold ended when turning the screen off failed to save", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ powerHold: { ...HOLD, power: "on" } })],
    });
    store.saveOverrides = vi.fn(async () => {
      throw new Error("offline");
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledWith("kitchen", "schedule");
    expect(text(wrapper, "screen-now-message")).toBe(
      "The screen is back on its schedule, but turning it off didn't save. Try again."
    );
  });

  it("disables both buttons while the hold ends and the choice saves", async () => {
    const { wrapper, store } = mountScreens({ kiosks: [kiosk({ powerHold: HOLD })] });
    let release;
    store.setScreenPower = vi.fn(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-on']").trigger("click");
    await flushPromisesNow();
    expect(wrapper.find("[data-test='screen-now-on']").attributes("disabled")).toBeDefined();
    expect(wrapper.find("[data-test='screen-now-off']").attributes("disabled")).toBeDefined();
    // A second tap while the calls run sends nothing.
    await wrapper.find("[data-test='screen-now-on']").trigger("click");
    await flushPromisesNow();
    expect(store.setScreenPower).toHaveBeenCalledTimes(1);
    release({
      id: "kitchen",
      power: "schedule",
      held: false,
      setAt: null,
      by: null,
      desiredOn: true,
    });
    await flushPromises();
    expect(store.setScreenPower).toHaveBeenCalledTimes(1);
    expect(store.saveOverrides).toHaveBeenCalledTimes(1);
  });

  it("explains a screen whose software is too old to hold", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ powerHold: HOLD, agentHolds: false })],
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-old-agent")).toBe(
      "This screen needs an update to stay this way. Until then, its next scheduled change switches it."
    );
  });

  it("without a hold, the row is as before and nothing is ended", async () => {
    const { wrapper, store } = mountScreens();
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On now");
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(store.setScreenPower).not.toHaveBeenCalled();
    expect(store.saveOverrides).toHaveBeenCalled();
  });
});
