// Screen power mode (calvin-25g9, UI spec docs/design/2026-11-21-screen-power-mode.md):
// the Schedule / Always on / External choice, the Screen now row it governs,
// the household override and the edge copy.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises as flushPromisesNow } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), open: vi.fn(), up: vi.fn() }),
}));

async function flushPromises() {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  await flushPromisesNow();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-21T12:00:00Z")); // Saturday
  pushMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

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
  kioskPairing: "optional",
  ...over,
});

const kiosk = (over = {}) => ({
  id: "hall",
  hostname: "hall-pi",
  lastSeen: new Date().toISOString(),
  agentVersion: "1.6.0",
  agentHolds: true,
  paired: true,
  overrides: {},
  ...over,
});

const view = over => ({
  id: "hall",
  mode: "schedule",
  power: "schedule",
  held: false,
  setAt: null,
  by: null,
  until: null,
  keyName: null,
  desiredOn: true,
  online: true,
  agentHolds: true,
  paired: true,
  ...over,
});

function mountScreens({
  kiosks = [kiosk()],
  overrides = {},
  cfg = config(),
  screenPower = null,
} = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(k => k.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  store.fetchScreenPower = vi.fn(async id => {
    const answer = screenPower ? { id, ...view(screenPower) } : null;
    const target = store.kiosks.find(k => k.id === id);
    if (target && answer) target.screenPowerView = answer;
    return answer;
  });
  store.setScreenPower = vi.fn(async (id, power) => {
    const target = store.kiosks.find(k => k.id === id);
    const answer = view({
      mode: cfg.screenPower,
      power,
      held: power !== "schedule",
      setAt: power === "schedule" ? null : new Date().toISOString(),
      by: power === "schedule" ? null : "settings",
      desiredOn: power === "schedule" ? true : power === "on",
    });
    if (target) target.screenPowerView = answer;
    return answer;
  });
  return {
    wrapper: mount(ScreensSettings, { props: { config: cfg } }),
    store,
  };
}

async function open(wrapper) {
  await flushPromises();
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushPromises();
}

const text = (wrapper, test) => wrapper.find(`[data-test='${test}']`).text();
const row = (wrapper, label) =>
  wrapper.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);
const powerControl = wrapper =>
  wrapper.findAllComponents(SegmentedControl).find(c => c.props("ariaLabel") === "Screen power");

describe("ScreensSettings — the Screen power control", () => {
  it("says the hint for the chosen mode", async () => {
    const schedule = mountScreens();
    await open(schedule.wrapper);
    expect(text(schedule.wrapper, "screen-power-hint")).toBe(
      "Turns on and off at the times below."
    );

    const always = mountScreens({ cfg: config({ screenPower: "always_on" }) });
    await open(always.wrapper);
    expect(text(always.wrapper, "screen-power-hint")).toBe(
      "Never turns off on a schedule. Turn off when idle still applies."
    );

    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
    });
    await open(external.wrapper);
    expect(text(external.wrapper, "screen-power-hint")).toBe(
      "Homey, Home Assistant or a script with an API key turns it on and off."
    );
  });

  it("offers the three modes in order", async () => {
    const { wrapper } = mountScreens();
    await open(wrapper);
    expect(
      powerControl(wrapper)
        .props("options")
        .map(o => o.label)
    ).toEqual(["Schedule", "Always on", "External"]);
  });

  it("shows the schedule only in Schedule", async () => {
    const schedule = mountScreens();
    await open(schedule.wrapper);
    expect(schedule.wrapper.findComponent(DisplayScheduleGrid).exists()).toBe(true);

    const always = mountScreens({ cfg: config({ screenPower: "always_on" }) });
    await open(always.wrapper);
    expect(always.wrapper.findComponent(DisplayScheduleGrid).exists()).toBe(false);

    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
    });
    await open(external.wrapper);
    expect(external.wrapper.findComponent(DisplayScheduleGrid).exists()).toBe(false);
  });

  it("drops the Screen now row in Always on and keeps desiredOn true", async () => {
    const { wrapper } = mountScreens({ cfg: config({ screenPower: "always_on" }) });
    await open(wrapper);
    expect(row(wrapper, "Screen now")).toBeUndefined();
    expect(wrapper.find("[data-test='screen-now-state']").exists()).toBe(false);
    expect(wrapper.findComponent(BrightnessGroup).props("asleep")).toBe(false);
  });

  it("labels the buttons by mode", async () => {
    const schedule = mountScreens();
    await open(schedule.wrapper);
    expect(text(schedule.wrapper, "screen-now-on")).toBe("Turn on now");
    expect(text(schedule.wrapper, "screen-now-off")).toBe("Turn off now");

    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      screenPower: { mode: "external", power: "off", by: "automation", keyName: "Homey" },
    });
    await open(external.wrapper);
    expect(text(external.wrapper, "screen-now-on")).toBe("Turn on");
    expect(text(external.wrapper, "screen-now-off")).toBe("Turn off");
  });

  it("shows Back to schedule only in Schedule with a command in force", async () => {
    const following = mountScreens();
    await open(following.wrapper);
    expect(following.wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);

    const command = mountScreens({
      screenPower: { power: "off", by: "automation", keyName: "Homey", until: null },
    });
    await open(command.wrapper);
    expect(text(command.wrapper, "screen-now-follow")).toBe("Back to schedule");

    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      screenPower: { mode: "external", power: "off", by: "automation", keyName: "Homey" },
    });
    await open(external.wrapper);
    expect(external.wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
  });

  it("shows the API key notes only in External and routes to the keys page", async () => {
    const schedule = mountScreens();
    await open(schedule.wrapper);
    expect(schedule.wrapper.find("[data-test='screen-power-keys']").exists()).toBe(false);

    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
    });
    await open(external.wrapper);
    expect(external.wrapper.find("[data-test='screen-power-keys']").exists()).toBe(true);
    expect(external.wrapper.find("[data-test='screen-power-guide']").exists()).toBe(true);

    await external.wrapper.find("[data-test='screen-power-keys']").trigger("click");
    expect(pushMock).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "security-api-keys" },
    });
  });

  it("reads Same as Default or Changed here on a screen page", async () => {
    const inherited = mountScreens();
    await open(inherited.wrapper);
    expect(inherited.wrapper.find("#setting-screenPower .scope-line__label").text()).toBe(
      "Same as Default"
    );

    const changed = mountScreens({ overrides: { screenPower: "external" } });
    await open(changed.wrapper);
    expect(changed.wrapper.find("#setting-screenPower .scope-line__label").text()).toBe(
      "Changed here"
    );
    expect(changed.wrapper.find("[data-test='reset-screen-power']").exists()).toBe(true);
  });

  it("summarises the mode on the screen row and the Default card", async () => {
    const external = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      kiosks: [kiosk({ overrides: { screenPower: "external" } })],
    });
    await flushPromises();
    expect(external.wrapper.find("[data-test='screen-summary']").text()).toContain(
      "External on/off"
    );
    expect(external.wrapper.find("[data-test='default-summary']").text()).toContain(
      "External on/off"
    );

    const schedule = mountScreens({
      kiosks: [kiosk({ overrides: { screenPower: "schedule", displayScheduleEnabled: true } })],
    });
    await flushPromises();
    expect(schedule.wrapper.find("[data-test='screen-summary']").text()).toContain(
      "off 22:00–06:30"
    );

    const always = mountScreens({
      cfg: config({ screenPower: "always_on", displayScheduleEnabled: false }),
      kiosks: [kiosk({ overrides: { screenPower: "always_on", displayScheduleEnabled: false } })],
    });
    await flushPromises();
    expect(always.wrapper.find("[data-test='screen-summary']").text()).not.toContain("off ");
    expect(always.wrapper.find("[data-test='default-summary']").text()).not.toContain("External");
  });

  it("keeps focus on the segment that was chosen", async () => {
    const { wrapper } = mountScreens();
    document.body.appendChild(wrapper.element);
    try {
      await open(wrapper);
      const external = wrapper.findAll('[role="radio"]')[2];
      external.element.focus();
      await external.trigger("click");
      await flushPromises();

      const after = wrapper.findAll('[role="radio"]')[2];
      expect(document.activeElement).toBe(after.element);
      expect(after.attributes("aria-checked")).toBe("true");
    } finally {
      wrapper.element.remove();
    }
  });

  it("does not link to the guide on the kiosk itself", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hall");
    try {
      const { wrapper } = mountScreens({
        cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      });
      await open(wrapper);
      expect(wrapper.find("[data-test='screen-power-keys']").exists()).toBe(true);
      expect(wrapper.find("[data-test='screen-power-guide']").exists()).toBe(false);
    } finally {
      window.sessionStorage.clear();
    }
  });
});

describe("ScreensSettings — the Screen now status line", () => {
  it("says who and when: set here", async () => {
    const { wrapper } = mountScreens({
      screenPower: {
        power: "off",
        by: "settings",
        setAt: "2026-11-21T21:04:00Z",
        until: "2026-11-21T22:00:00Z",
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set here at 21:04");
    expect(text(wrapper, "screen-now-until")).toBe("Until the next scheduled change at 22:00");
  });

  it("says who and when: set by the key's name", async () => {
    const { wrapper } = mountScreens({
      screenPower: {
        power: "off",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        keyName: "Homey",
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set by Homey at 21:04");
  });

  it("says set by home automation without a key name", async () => {
    const { wrapper } = mountScreens({
      screenPower: {
        power: "off",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        keyName: null,
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set by home automation at 21:04");
  });

  it("cuts a key name longer than 40 characters", async () => {
    const { wrapper } = mountScreens({
      screenPower: {
        power: "on",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        keyName: "A very long API key name that keeps going past forty characters",
      },
    });
    await open(wrapper);
    const status = text(wrapper, "screen-now-state");
    const name = status.slice("On · set by ".length, status.indexOf(" at "));
    expect(name).toHaveLength(40);
    expect(name.endsWith("…")).toBe(true);
  });

  it("names the weekday within the last 6 days and the day when older", async () => {
    const three = mountScreens({
      screenPower: {
        power: "on",
        by: "settings",
        setAt: "2026-11-18T21:04:00Z",
      },
    });
    await open(three.wrapper);
    expect(text(three.wrapper, "screen-now-state")).toBe("On · set here on Wed at 21:04");

    const older = mountScreens({
      screenPower: {
        power: "off",
        by: "automation",
        setAt: "2026-11-01T21:04:00Z",
        keyName: "Homey",
      },
    });
    await open(older.wrapper);
    expect(text(older.wrapper, "screen-now-state")).toBe("Off · set by Homey on 1 Nov");
  });

  it("follows the household's 12-hour clock", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ timeFormat: "12h" }),
      screenPower: {
        power: "off",
        by: "settings",
        setAt: "2026-11-21T21:04:00Z",
        until: "2026-11-21T22:00:00Z",
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · set here at 9:04 PM");
    expect(text(wrapper, "screen-now-until")).toBe("Until the next scheduled change at 10:00 PM");
  });

  it("says no command yet in External, and on", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      screenPower: { mode: "external", power: "schedule" },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On · no command yet");
    expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
  });

  it("follows the schedule and names the next change", async () => {
    const { wrapper } = mountScreens();
    await open(wrapper);
    // Saturday 12:00, schedule off 22:00 everyday.
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
    expect(text(wrapper, "screen-now-until")).toBe("Turns off at 22:00");
  });

  it("has no until line when the schedule has no next change", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ displaySchedule: [] }),
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
    expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
  });

  it("drops who and when and takes the answer's state on an unpaired Schedule screen", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ kioskPairing: "required" }),
      kiosks: [kiosk({ paired: false })],
      screenPower: {
        power: "off",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        until: "2026-11-21T22:00:00Z",
        keyName: "Homey",
        desiredOn: true,
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On");
    // The command is not reaching this screen, so it cannot disable the button
    // or promise an until.
    expect(
      wrapper.find("[data-test='screen-now-off']").attributes("aria-disabled")
    ).toBeUndefined();
    expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
  });

  it("takes the answer's state on an unpaired External screen too", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        screenPower: "external",
        displayScheduleEnabled: false,
        kioskPairing: "required",
      }),
      kiosks: [kiosk({ paired: false })],
      screenPower: {
        mode: "external",
        power: "off",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        keyName: "Homey",
        desiredOn: true,
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On");
    expect(
      wrapper.find("[data-test='screen-now-off']").attributes("aria-disabled")
    ).toBeUndefined();
  });

  it("takes the answer's off state on an unpaired screen", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        screenPower: "external",
        displayScheduleEnabled: false,
        kioskPairing: "required",
      }),
      kiosks: [kiosk({ paired: false })],
      screenPower: {
        mode: "external",
        power: "on",
        by: "automation",
        setAt: "2026-11-21T21:04:00Z",
        keyName: "Homey",
        desiredOn: false,
      },
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off");
    expect(wrapper.find("[data-test='screen-now-on']").attributes("aria-disabled")).toBeUndefined();
  });

  it("uses the answer's desiredOn for the following-the-schedule state", async () => {
    // At 12:00 the browser's schedule math says on; the server says off.
    const { wrapper } = mountScreens({ screenPower: { desiredOn: false } });
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("Off · by the schedule");
  });
});

describe("ScreensSettings — Screen now edges", () => {
  it("explains hidden presence and keeps both buttons and Back to schedule", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ presenceHidden: true })],
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-hidden")).toBe(
      "Sign in as admin to see whether this screen is on or off, and who set it."
    );
    expect(wrapper.find("[data-test='screen-now-state']").exists()).toBe(false);
    expect(wrapper.find("[data-test='screen-now-on']").attributes("aria-disabled")).toBeUndefined();
    expect(
      wrapper.find("[data-test='screen-now-off']").attributes("aria-disabled")
    ).toBeUndefined();
    expect(text(wrapper, "screen-now-follow")).toBe("Back to schedule");
  });

  it("says only Offline on a hidden-presence row", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ presenceHidden: true, lastSeen: "2026-11-20T12:00:00Z" })],
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-offline")).toBe("Offline.");
  });

  it("warns that an unpaired screen cannot use External, with Pair a screen", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        screenPower: "external",
        displayScheduleEnabled: false,
        kioskPairing: "required",
      }),
      kiosks: [kiosk({ paired: false })],
      screenPower: { mode: "external", power: "on", by: "settings", setAt: null },
    });
    await open(wrapper);
    expect(wrapper.find("[data-test='screen-now-unpaired'] .inline-note__text").text()).toBe(
      "Not paired, so home automation can't switch it. Pair it to use External."
    );
    expect(wrapper.find("[data-test='screen-now-unpaired']").classes()).toContain(
      "inline-note--warn"
    );
    expect(wrapper.find("[data-test='screen-now-pair']").text()).toBe("Pair a screen");
  });

  it("warns that an unpaired screen's schedule still works", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ kioskPairing: "required" }),
      kiosks: [kiosk({ paired: false })],
    });
    await open(wrapper);
    expect(text(wrapper, "screen-now-unpaired")).toBe(
      "Not paired, so home automation can't switch it. Its schedule still works."
    );
    expect(wrapper.find("[data-test='screen-now-pair']").exists()).toBe(false);
  });

  it("has no note for an old agent", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentHolds: false })],
      screenPower: { power: "off", by: "automation", keyName: "Homey" },
    });
    await open(wrapper);
    expect(wrapper.find("[data-test='screen-now-old-agent']").exists()).toBe(false);
  });

  it("says an offline screen will turn on or off when it is back", async () => {
    const offline = kiosk({ lastSeen: "2026-11-20T12:00:00Z" });
    const on = mountScreens({
      kiosks: [offline],
      screenPower: { power: "on", by: "settings", setAt: null, desiredOn: true },
    });
    await open(on.wrapper);
    expect(text(on.wrapper, "screen-now-offline")).toBe("Offline. It turns on when it's back.");

    const off = mountScreens({
      kiosks: [offline],
      screenPower: { power: "off", by: "settings", setAt: null, desiredOn: false },
    });
    await open(off.wrapper);
    expect(text(off.wrapper, "screen-now-offline")).toBe("Offline. It turns off when it's back.");
  });

  it("never renders hold, held or paused in the Power section", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ screenPower: "external", displayScheduleEnabled: false }),
      screenPower: { mode: "external", power: "off", by: "automation", keyName: "Homey" },
    });
    await open(wrapper);
    expect(wrapper.find("#section-screen-power").text()).not.toMatch(/\b(hold|held|paused)\b/i);
  });
});

describe("ScreensSettings — pressing a power button", () => {
  it("sends one call, shows its loading label, the saved line and keeps focus", async () => {
    const { wrapper, store } = mountScreens();
    document.body.appendChild(wrapper.element);
    try {
      await open(wrapper);
      let release;
      store.setScreenPower = vi.fn(
        (id, _power) =>
          new Promise(resolve => {
            release = answer => {
              const target = store.kiosks.find(k => k.id === id);
              if (target) target.screenPowerView = answer;
              resolve(answer);
            };
          })
      );

      const off = wrapper.find("[data-test='screen-now-off']");
      off.element.focus();
      await off.trigger("click");
      await flushPromisesNow();

      expect(text(wrapper, "screen-now-off")).toBe("Turning off…");
      expect(wrapper.find("[data-test='screen-now-on']").attributes("aria-disabled")).toBe("true");
      expect(wrapper.find("[data-test='screen-now-off']").attributes("aria-disabled")).toBe("true");

      release(
        view({
          power: "off",
          by: "settings",
          setAt: new Date().toISOString(),
          desiredOn: false,
        })
      );
      await flushPromises();

      expect(store.setScreenPower).toHaveBeenCalledTimes(1);
      expect(store.setScreenPower).toHaveBeenCalledWith("hall", "off");
      expect(text(wrapper, "screen-now-message")).toBe(
        "Saved. This screen updates within a minute."
      );
      expect(text(wrapper, "screen-now-state")).toBe("Off · set here at 12:00");
      expect(document.activeElement).toBe(wrapper.find("[data-test='screen-now-off']").element);
    } finally {
      wrapper.element.remove();
    }
  });

  it("shows a 409's own message and reloads the screen's power", async () => {
    const { wrapper, store } = mountScreens();
    store.setScreenPower = vi.fn(async () => {
      const err = new Error("conflict");
      err.response = {
        status: 409,
        data: {
          detail: {
            code: "screen_power_always_on",
            message: "This screen is set to Always on. Choose Schedule or External to switch it.",
          },
        },
      };
      throw err;
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();

    expect(text(wrapper, "screen-now-message")).toBe(
      "This screen is set to Always on. Choose Schedule or External to switch it."
    );
    expect(wrapper.find("[data-test='screen-now-message']").classes()).toContain(
      "inline-note--err"
    );
    expect(store.fetchScreenPower).toHaveBeenCalledTimes(2);
  });

  it("shows the External 409's message too", async () => {
    const { wrapper, store } = mountScreens();
    store.setScreenPower = vi.fn(async () => {
      const err = new Error("conflict");
      err.response = {
        status: 409,
        data: {
          detail: {
            code: "screen_power_external",
            message: "This screen is set to External. Send on or off.",
          },
        },
      };
      throw err;
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(text(wrapper, "screen-now-message")).toBe(
      "This screen is set to External. Send on or off."
    );
  });

  it("names the wait on a 429", async () => {
    const { wrapper, store } = mountScreens();
    store.setScreenPower = vi.fn(async () => {
      const err = new Error("rate limited");
      err.response = {
        status: 429,
        headers: { "retry-after": "30" },
        data: { detail: { code: "rate_limited" } },
      };
      throw err;
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(text(wrapper, "screen-now-message")).toBe(
      "Too many changes in a minute. Try again in 30 seconds."
    );
  });

  it("Back to schedule is one call and does not touch the override layer", async () => {
    const { wrapper, store } = mountScreens({
      screenPower: {
        power: "off",
        by: "settings",
        setAt: new Date().toISOString(),
        until: "2026-11-21T22:00:00Z",
      },
    });
    await open(wrapper);
    await wrapper.find("[data-test='screen-now-follow']").trigger("click");
    await flushPromises();

    expect(store.setScreenPower).toHaveBeenCalledWith("hall", "schedule");
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
  });

  it("keeps focus on the available Screen now button after Back to schedule", async () => {
    const { wrapper } = mountScreens({
      screenPower: {
        power: "off",
        by: "settings",
        setAt: new Date().toISOString(),
        until: "2026-11-21T22:00:00Z",
        desiredOn: false,
      },
    });
    document.body.appendChild(wrapper.element);
    try {
      await open(wrapper);
      const follow = wrapper.find("[data-test='screen-now-follow']");
      follow.element.focus();
      await follow.trigger("click");
      await flushPromises();

      expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
      // At 12:00 the schedule is on, so Turn off now is the available choice.
      const off = wrapper.find("[data-test='screen-now-off']");
      expect(off.attributes("aria-disabled")).toBeUndefined();
      expect(document.activeElement).toBe(off.element);
    } finally {
      wrapper.element.remove();
    }
  });
});

describe("ScreensSettings — screen power refresh", () => {
  it("re-reads the open screen's command every 30 seconds", async () => {
    const { wrapper, store } = mountScreens();
    await open(wrapper);
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);

    store.fetchScreenPower = vi.fn(async id => {
      const answer = view({
        power: "off",
        by: "automation",
        keyName: "Homey",
        setAt: "2026-11-21T21:04:00Z",
        desiredOn: false,
      });
      const target = store.kiosks.find(k => k.id === id);
      if (target) target.screenPowerView = answer;
      return answer;
    });

    await vi.advanceTimersByTimeAsync(30000);
    await flushPromisesNow();

    expect(text(wrapper, "screen-now-state")).toBe("Off · set by Homey at 21:04");
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(true);
  });

  it("clears a view the admin may no longer see on a 403", async () => {
    const { wrapper, store } = mountScreens({
      screenPower: { power: "off", by: "automation", keyName: "Homey", desiredOn: false },
    });
    await open(wrapper);
    expect(store.kiosks[0].screenPowerView).toBeTruthy();

    store.fetchScreenPower = vi.fn(async () => {
      const err = new Error("forbidden");
      err.response = { status: 403 };
      throw err;
    });
    await vi.advanceTimersByTimeAsync(30000);
    await flushPromisesNow();

    expect(store.kiosks[0].screenPowerView).toBeUndefined();
    expect(text(wrapper, "screen-now-state")).toBe("On · by the schedule");
  });
});
