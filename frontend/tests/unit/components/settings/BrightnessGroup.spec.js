import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";

const FINDINGS = {
  ddc: true,
  writes: true,
  checkedAt: "2026-11-04T10:00:00Z",
  limit: null,
};
const READINGS = [
  { ddc: 5, menu: 28 },
  { ddc: 19, menu: 61 },
];

function mountGroup(props = {}) {
  return mount(BrightnessGroup, {
    props: {
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: FINDINGS },
      overrides: {},
      screenName: "Kitchen",
      asleep: false,
      ...props,
    },
  });
}
const ramp = { brightnessRampEnabled: true, brightness: 19 };
const find = (wrapper, name) => wrapper.find(`[data-test="${name}"]`);
// Focus assertions need the component in the document (a detached node cannot
// take focus in jsdom).
function mountAttached(props = {}) {
  return mount(BrightnessGroup, {
    attachTo: document.body,
    props: {
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: FINDINGS },
      overrides: {},
      screenName: "Kitchen",
      asleep: false,
      ...props,
    },
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("BrightnessGroup rows", () => {
  it("shows only the ramp toggle while the ramp is off", () => {
    const wrapper = mountGroup();
    expect(find(wrapper, "ramp-toggle").exists()).toBe(true);
    expect(find(wrapper, "brightness-slider").exists()).toBe(false);
    expect(find(wrapper, "ramp-speed").exists()).toBe(false);
    expect(find(wrapper, "check-summary").exists()).toBe(true);
  });

  it("shows brightness and ramp speed while the ramp is on", () => {
    const wrapper = mountGroup({ overrides: ramp });
    expect(find(wrapper, "brightness-slider").exists()).toBe(true);
    expect(find(wrapper, "ramp-speed").text()).toContain("2 every 1.5 s");
  });

  it("emits a patch when the toggle is switched on", async () => {
    const wrapper = mountGroup();
    await find(wrapper, "ramp-toggle")
      .findComponent({ name: "ToggleSwitch" })
      .vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("patch")[0][0]).toEqual({
      brightnessRampEnabled: true,
      brightness: 20,
    });
  });

  it("starts the first brightness at the limit when that is lower than 20", async () => {
    const wrapper = mountGroup({ overrides: { brightnessLimit: 18 } });
    await find(wrapper, "ramp-toggle")
      .findComponent({ name: "ToggleSwitch" })
      .vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("patch")[0][0]).toMatchObject({ brightness: 18 });
  });

  it("shows the Display check summary and opens the check", async () => {
    const wrapper = mountGroup({
      overrides: { brightnessLimit: 26, brightnessConversion: READINGS },
    });
    // The saved findings have no limit here, so this highest was set by hand.
    expect(find(wrapper, "check-summary").text()).toBe(
      "Answers brightness commands · changes take effect · menu match from 2 readings · checked 4 Nov · highest 26, set by hand"
    );
    await find(wrapper, "check-open").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
  });

  it("shows a hand-set highest level when the findings have no date", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: { ...FINDINGS, checkedAt: null },
      },
      overrides: { brightnessLimit: 26, brightnessConversion: READINGS },
    });
    expect(find(wrapper, "check-summary").text()).toBe(
      "Answers brightness commands · changes take effect · menu match from 2 readings · highest 26, set by hand"
    );
  });

  it("words a read-step power trouble by the panel's own buttons, not Calvin's level", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: {
          ...FINDINGS,
          powerTrouble: {
            at: "2026-11-06T17:33:00Z",
            step: "read",
            level: null,
            panelLevel: 74,
            kind: "under-voltage",
          },
        },
      },
    });
    expect(find(wrapper, "power-trouble").text()).toContain(
      "Power trouble while set with the panel's buttons (panel 74) (6 Nov)"
    );
  });

  it("words a fault with no panel level just as set with the panel's buttons", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: {
          ...FINDINGS,
          powerTrouble: {
            at: "2026-11-06T17:33:00Z",
            step: "read",
            level: null,
            kind: "under-voltage",
          },
        },
      },
    });
    const text = find(wrapper, "power-trouble").text();
    expect(text).toContain("Power trouble while set with the panel's buttons (6 Nov)");
    expect(text).not.toContain("panel undefined");
  });

  it("shows saved power trouble in amber with a link to the fix", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: {
          ...FINDINGS,
          powerTrouble: {
            at: "2026-11-06T17:33:00Z",
            step: "write",
            level: 12,
            kind: "under-voltage",
          },
        },
      },
    });
    const note = find(wrapper, "power-trouble");
    expect(note.text()).toContain("Power trouble at Calvin 12 (6 Nov)");
    const link = find(wrapper, "power-fix-link");
    expect(link.text()).toBe("How to fix the power");
    expect(link.attributes("href")).toBe(
      "https://osterbergsimon.github.io/calvin/setup/KIOSK_POWER/"
    );
    expect(link.attributes("target")).toBe("_blank");
  });

  it("says power trouble at idle when the check never started", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: {
          ...FINDINGS,
          powerTrouble: {
            at: "2026-11-06T17:33:00Z",
            step: "preflight",
            level: null,
            kind: "under-voltage",
          },
        },
      },
    });
    expect(find(wrapper, "power-trouble").text()).toContain("Power trouble at idle (6 Nov)");
  });

  it("shows no power line once a later check cleared it", () => {
    const wrapper = mountGroup({
      kiosk: {
        id: "kitchen",
        displayStack: "cog",
        displayCheck: { ...FINDINGS, powerTrouble: null },
      },
    });
    expect(find(wrapper, "power-trouble").exists()).toBe(false);
  });

  it("says Not checked yet before any check", () => {
    const wrapper = mountGroup({
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: null },
    });
    expect(find(wrapper, "check-summary").text()).toBe("Not checked yet");
  });

  it("explains that dim mode keeps the screen running at backlight 0", () => {
    const wrapper = mountGroup();
    expect(find(wrapper, "sleep-mode").text()).toContain("backlight 0");
  });

  it("writes the sleep mode", async () => {
    const wrapper = mountGroup();
    await find(wrapper, "sleep-mode")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", "dim");
    expect(wrapper.emitted("patch")[0][0]).toEqual({ sleepMode: "dim" });
  });
});

describe("BrightnessGroup unavailable states", () => {
  it("never checked: the toggle opens the check at step 1 and is enabled", async () => {
    const wrapper = mountGroup({
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: null },
    });
    expect(find(wrapper, "availability-text").text()).toContain("Calvin checks the display first");
    await find(wrapper, "ramp-toggle")
      .findComponent({ name: "ToggleSwitch" })
      .vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("patch")).toBeUndefined();
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect", enableAfter: true });
  });

  it.each([
    ["no DDC", { ...FINDINGS, ddc: false }, /DDC\/CI/, "Check again"],
    ["writes that do nothing", { ...FINDINGS, writes: false }, /don't change it/, "Check again"],
  ])("%s: says why, disables the toggle and offers %s", async (_n, findings, text, action) => {
    const wrapper = mountGroup({
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: findings },
    });
    expect(find(wrapper, "availability-text").text()).toMatch(text);
    expect(
      find(wrapper, "ramp-toggle").findComponent({ name: "ToggleSwitch" }).props("disabled")
    ).toBe(true);
    expect(find(wrapper, "availability-action").text()).toBe(action);
    await find(wrapper, "availability-action").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
  });

  it("not cog: names the stack, no action, toggle disabled", () => {
    const wrapper = mountGroup({
      kiosk: { id: "hall", displayStack: "x11", displayCheck: null },
      screenName: "Hallway",
    });
    expect(find(wrapper, "availability-text").text()).toBe(
      "Needs the Calvin kiosk display (cog). Hallway uses X11."
    );
    expect(find(wrapper, "availability-action").exists()).toBe(false);
    expect(
      find(wrapper, "ramp-toggle").findComponent({ name: "ToggleSwitch" }).props("disabled")
    ).toBe(true);
  });

  it("keeps the rows editable while the screen is offline and says when they apply", () => {
    const wrapper = mountGroup({ overrides: ramp, online: false });
    expect(find(wrapper, "brightness-note").text()).toContain("Applies when Kitchen is back");
  });
});

describe("BrightnessGroup slider", () => {
  const withMenu = { ...ramp, brightnessLimit: 26, brightnessConversion: READINGS };

  it("reads in the panel's menu numbers when a menu match exists", () => {
    const wrapper = mountGroup({ overrides: withMenu });
    expect(find(wrapper, "brightness-value").text()).toContain("61");
    expect(find(wrapper, "brightness-value").text()).toContain("on the panel's own menu");
    expect(find(wrapper, "brightness-value").text()).toContain("Calvin value 19 · estimated");
    const input = find(wrapper, "brightness-slider").element;
    expect(Number(input.value)).toBe(61);
  });

  it("falls back to Calvin's scale with a link to the display check", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    expect(find(wrapper, "brightness-value").text().replace(/\s+/g, " ")).toContain(
      "19 (Calvin's scale)"
    );
    await find(wrapper, "match-link").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
  });

  it("cannot go past the limit itself", () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    expect(find(wrapper, "brightness-slider").attributes("max")).toBe("26");
    expect(find(wrapper, "limit-hatch").exists()).toBe(true);
  });

  it("without a limit there is no hatch and a link that opens the display check", async () => {
    const wrapper = mountGroup({ overrides: ramp });
    expect(find(wrapper, "limit-hatch").exists()).toBe(false);
    expect(find(wrapper, "limit-note").text()).toContain("No limit found yet");
    await find(wrapper, "limit-link").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
  });

  it("saves once on release, not during the drag", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    const input = find(wrapper, "brightness-slider");
    input.element.value = "21";
    await input.trigger("input");
    input.element.value = "22";
    await input.trigger("input");
    expect(wrapper.emitted("patch")).toBeUndefined();
    await input.trigger("change");
    expect(wrapper.emitted("patch")).toHaveLength(1);
    expect(wrapper.emitted("patch")[0][0]).toEqual({ brightness: 22 });
  });

  it("converts a menu value back to Calvin's scale on release", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    const input = find(wrapper, "brightness-slider");
    input.element.value = "47";
    await input.trigger("input");
    await input.trigger("change");
    expect(wrapper.emitted("patch")[0][0]).toEqual({ brightness: 13 });
  });

  it("shows Changing… until the ramp has had time to finish", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    const input = find(wrapper, "brightness-slider");
    input.element.value = "67";
    await input.trigger("input");
    await input.trigger("change");
    await wrapper.setProps({ overrides: { ...withMenu, brightness: 22 } });
    expect(find(wrapper, "brightness-note").text()).toContain(
      "Changing… 61 → 68 on the panel's own menu, 2 at a time"
    );
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(find(wrapper, "brightness-note").exists()).toBe(false);
  });

  it("says Applies when Kitchen wakes while the screen is asleep", async () => {
    const wrapper = mountGroup({ overrides: withMenu, asleep: true });
    expect(find(wrapper, "brightness-note").text()).toContain("Applies when Kitchen wakes");
  });

  it("has an accessible value text", () => {
    const wrapper = mountGroup({ overrides: withMenu });
    expect(find(wrapper, "brightness-slider").attributes("aria-valuetext")).toBe(
      "61 on the panel's own menu, Calvin value 19"
    );
  });
});

describe("BrightnessGroup ramp speed", () => {
  it("reveals steppers and a warning behind Change", async () => {
    const wrapper = mountGroup({ overrides: ramp });
    expect(find(wrapper, "ramp-speed-editor").exists()).toBe(false);
    await find(wrapper, "ramp-speed-change").trigger("click");
    expect(find(wrapper, "ramp-speed-editor").text()).toContain(
      "Bigger steps are what reset the touch screen"
    );
    const steppers = wrapper.findAllComponents({ name: "NumberStepper" });
    steppers[0].vm.$emit("update:modelValue", 3);
    expect(wrapper.emitted("patch")[0][0]).toEqual({ brightnessStep: 3 });
    steppers[1].vm.$emit("update:modelValue", 2);
    expect(wrapper.emitted("patch")[1][0]).toEqual({ brightnessStepSeconds: 2 });
  });
});

describe("BrightnessGroup live states", () => {
  it("explains the one last step-up after the ramp is turned off while asleep", async () => {
    const wrapper = mountGroup({ overrides: ramp, asleep: true });
    await find(wrapper, "ramp-toggle")
      .findComponent({ name: "ToggleSwitch" })
      .vm.$emit("update:modelValue", false);
    await wrapper.setProps({ overrides: { brightnessRampEnabled: false, brightness: 19 } });
    expect(find(wrapper, "ramp-off-asleep-note").text()).toContain(
      "Kitchen is asleep at its lowest brightness."
    );
    expect(find(wrapper, "ramp-off-asleep-note").text()).toContain("stops changing its brightness");
  });

  it("never checked: only the Display check row offers the check, not the ramp row", () => {
    const wrapper = mountGroup({
      kiosk: { id: "kitchen", displayStack: "cog", displayCheck: null },
    });
    expect(
      wrapper.findAll("button").filter(b => b.text().includes("Check this display")).length
    ).toBe(1);
    expect(find(wrapper, "availability-action").exists()).toBe(false);
  });
});

describe("BrightnessGroup ramp speed range and the limit", () => {
  it("matches the API range: step 1-5, interval 0.5-10 s in half steps", async () => {
    const wrapper = mountGroup({ overrides: ramp });
    await find(wrapper, "ramp-speed-change").trigger("click");
    const [size, interval] = wrapper.findAllComponents({ name: "NumberStepper" });
    expect(size.props()).toMatchObject({ min: 1, max: 5, step: 1 });
    expect(interval.props()).toMatchObject({ min: 0.5, max: 10, step: 0.5 });
  });

  it("lets the owner clear the whole calibration next to the limit", async () => {
    const wrapper = mountGroup({
      overrides: {
        ...ramp,
        brightnessLimit: 26,
        brightnessFloor: 2,
        brightnessConversion: READINGS,
      },
    });
    expect(find(wrapper, "limit-clear").exists()).toBe(false);
    await find(wrapper, "calibration-clear").trigger("click");
    expect(wrapper.emitted("patch")[0][0]).toEqual({
      brightnessConversion: null,
      brightnessLimit: null,
      brightnessFloor: null,
    });
  });

  it("offers Clear calibration when only readings are saved", () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessConversion: READINGS } });
    expect(find(wrapper, "calibration-clear").exists()).toBe(true);
  });

  it("offers no clear link with nothing to clear", () => {
    const wrapper = mountGroup({ overrides: ramp });
    expect(find(wrapper, "calibration-clear").exists()).toBe(false);
  });
});

// calvin-hts5: Highest and Lowest are edited here, without a new display check.
describe("BrightnessGroup highest and lowest", () => {
  const withMenu = {
    ...ramp,
    brightnessLimit: 26,
    brightnessFloor: 5,
    brightnessConversion: READINGS,
  };
  const stepper = (wrapper, name) =>
    wrapper
      .findAllComponents({ name: "NumberStepper" })
      .find(s => s.attributes("data-test") === name);
  async function openEditor(wrapper) {
    await find(wrapper, "levels-change").trigger("click");
  }
  async function setLevel(wrapper, name, value) {
    stepper(wrapper, name).vm.$emit("update:modelValue", value);
    await wrapper.vm.$nextTick();
  }

  it("shows both levels on the panel's menu when there is a match", () => {
    const wrapper = mountGroup({ overrides: withMenu });
    const text = find(wrapper, "levels-summary").text();
    expect(text).toContain("Highest 78");
    expect(text).toContain("Lowest 28");
    expect(text).toContain("panel's own menu");
  });

  it("shows both levels on Calvin's scale without a match", () => {
    const wrapper = mountGroup({
      overrides: { ...ramp, brightnessLimit: 26, brightnessFloor: 3 },
    });
    const text = find(wrapper, "levels-summary").text();
    expect(text).toContain("Highest 26");
    expect(text).toContain("Lowest 3");
    expect(text).toContain("Calvin's scale");
  });

  it("has no levels row before a limit exists", () => {
    expect(find(mountGroup({ overrides: ramp }), "levels-summary").exists()).toBe(false);
  });

  it("no longer calls the limit something the highest level sits below", () => {
    const note = find(mountGroup({ overrides: withMenu }), "limit-note").text();
    expect(note).not.toContain("too close to the limit");
    expect(note).toContain("never goes above your highest level");
  });

  it("lowering Highest saves at once, rounded down from the panel number", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 70); // (70 - 16.2) / 2.36 = 22.8
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessLimit: 22 }]]);
    // The step is rounded down, so the shown number returns to the saved limit.
    await wrapper.setProps({ overrides: { ...withMenu, brightnessLimit: 22 } });
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(68);
    expect(find(wrapper, "levels-editor").text()).toContain("Calvin 22");
  });

  it("lowering Highest under everyday and lowest pulls both down in one change", async () => {
    const wrapper = mountGroup({
      overrides: { ...ramp, brightnessLimit: 26, brightnessFloor: 5 },
    });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 4);
    expect(wrapper.emitted("patch")).toEqual([
      [{ brightnessLimit: 4, brightness: 4, brightnessFloor: 4 }],
    ]);
    expect(find(wrapper, "brightness-note").text()).toContain("Changing… 19 → 4");
  });

  it("raising Highest saves nothing until confirmed, and points to the display check", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    expect(wrapper.emitted("patch")).toBeUndefined();
    const warning = find(wrapper, "raise-warning");
    expect(warning.text()).toContain("display check");
    expect(find(wrapper, "raise-trouble").exists()).toBe(false);
    await find(wrapper, "raise-check").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
    await find(wrapper, "raise-confirm").trigger("click");
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessLimit: 30 }]]);
  });

  it("Keep drops a raise without saving", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    await find(wrapper, "raise-cancel").trigger("click");
    expect(find(wrapper, "raise-warning").exists()).toBe(false);
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(26);
    expect(wrapper.emitted("patch")).toBeUndefined();
  });

  it("raising Highest keeps an unset everyday level where it is, so nothing brightens", async () => {
    const wrapper = mountGroup({
      overrides: { brightnessRampEnabled: true, brightnessLimit: 15 },
    });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    await find(wrapper, "raise-confirm").trigger("click");
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessLimit: 30, brightness: 15 }]]);
  });

  it("warns more strongly when raising to a level with recorded power trouble", async () => {
    const kiosk = {
      id: "kitchen",
      displayStack: "cog",
      displayCheck: {
        ...FINDINGS,
        powerTrouble: { at: "2026-11-07T10:00:00Z", step: "conversion", level: 28 },
      },
    };
    const wrapper = mountGroup({ kiosk, overrides: { ...ramp, brightnessLimit: 24 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 27);
    expect(find(wrapper, "raise-warning").exists()).toBe(true);
    expect(find(wrapper, "raise-trouble").exists()).toBe(false);
    await setLevel(wrapper, "highest-stepper", 28);
    const strong = find(wrapper, "raise-trouble");
    expect(strong.text()).toContain("Power trouble at Calvin 28");
    expect(strong.text()).toContain("unplugged");
  });

  it("compares a panel-buttons power trouble on the panel's menu", async () => {
    const kiosk = {
      id: "kitchen",
      displayStack: "cog",
      displayCheck: {
        ...FINDINGS,
        powerTrouble: { at: "2026-11-08T13:58:00Z", step: "read", level: null, panelLevel: 74 },
      },
    };
    const wrapper = mountGroup({ kiosk, overrides: { ...withMenu, brightnessLimit: 20 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 75);
    expect(find(wrapper, "raise-trouble").text()).toContain("panel 74");
  });

  it("changing Lowest saves at once, on the panel's menu", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    await openEditor(wrapper);
    await setLevel(wrapper, "lowest-stepper", 35); // (35 - 16.2) / 2.36 = 8.0
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessFloor: 8 }]]);
  });

  it("Lowest can't go above the everyday level, so editing never brightens the screen", async () => {
    const wrapper = mountGroup({
      overrides: { ...ramp, brightness: 12, brightnessLimit: 26, brightnessFloor: 3 },
    });
    await openEditor(wrapper);
    expect(stepper(wrapper, "lowest-stepper").props("max")).toBe(12);
    await setLevel(wrapper, "lowest-stepper", 20);
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessFloor: 12 }]]);
  });

  // Major 1: the shown number is the limit, so one step up and back is no
  // change. Converting the stepped value before comparing it with the limit
  // reads the saved number as one Calvin step lower (it rounds down).
  it("steps up and back to the saved Highest without saving or warning", async () => {
    const wrapper = mountGroup({
      overrides: { ...ramp, brightnessLimit: 25, brightnessConversion: READINGS },
    });
    await openEditor(wrapper);
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(75);
    await setLevel(wrapper, "highest-stepper", 76);
    await setLevel(wrapper, "highest-stepper", 75);
    expect(wrapper.emitted("patch")).toBeUndefined();
    expect(find(wrapper, "raise-warning").exists()).toBe(false);
  });

  it("does not warn at the saved number when a menu step is under a Calvin step", async () => {
    const flat = [
      { ddc: 10, menu: 15 },
      { ddc: 30, menu: 25 },
    ];
    const wrapper = mountGroup({
      overrides: { ...ramp, brightnessLimit: 25, brightnessConversion: flat },
    });
    await openEditor(wrapper);
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(23);
    await setLevel(wrapper, "highest-stepper", 24);
    await setLevel(wrapper, "highest-stepper", 23);
    expect(wrapper.emitted("patch")).toBeUndefined();
    expect(find(wrapper, "raise-warning").exists()).toBe(false);
  });

  // Major 2: the note is announced, and Keep/Raise return focus to the stepper
  // whose buttons they removed.
  it("announces the raise note in a live region that is there before the note", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    const status = find(wrapper, "raise-status");
    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.text()).toBe("");
    await setLevel(wrapper, "highest-stepper", 30);
    expect(find(wrapper, "raise-status").exists()).toBe(true);
    expect(find(wrapper, "raise-status").text()).toContain(
      "Only the display check proves a level works"
    );
  });

  const increaseButton = wrapper =>
    find(wrapper, "highest-stepper").find('[data-step="inc"]').element;

  it("puts focus on the Highest stepper's Increase button after Keep", async () => {
    const wrapper = mountAttached({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    await find(wrapper, "raise-cancel").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(increaseButton(wrapper));
    wrapper.unmount();
  });

  it("puts focus on the Highest stepper's Increase button after Raise", async () => {
    const wrapper = mountAttached({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    await find(wrapper, "raise-confirm").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(increaseButton(wrapper));
    wrapper.unmount();
  });

  it("drops a raise when the limit changes elsewhere", async () => {
    const wrapper = mountGroup({ overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    expect(find(wrapper, "raise-warning").exists()).toBe(true);
    await wrapper.setProps({ overrides: { ...ramp, brightnessLimit: 24 } });
    expect(find(wrapper, "raise-warning").exists()).toBe(false);
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(24);
  });

  it("drops a Lowest draft when the floor changes elsewhere", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    await openEditor(wrapper);
    await setLevel(wrapper, "lowest-stepper", 40); // (40 - 16.2) / 2.36 = 10.1
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessFloor: 10 }]]);
    await wrapper.setProps({ overrides: { ...withMenu, brightnessFloor: 2 } });
    expect(stepper(wrapper, "lowest-stepper").props("modelValue")).toBe(21);
  });

  it("drops both drafts when the editor is closed and opened again", async () => {
    const wrapper = mountGroup({ overrides: withMenu });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 90);
    await setLevel(wrapper, "lowest-stepper", 40);
    expect(find(wrapper, "raise-warning").exists()).toBe(true);
    await find(wrapper, "levels-change").trigger("click");
    await find(wrapper, "levels-change").trigger("click");
    expect(stepper(wrapper, "highest-stepper").props("modelValue")).toBe(78);
    expect(stepper(wrapper, "lowest-stepper").props("modelValue")).toBe(28);
    expect(find(wrapper, "raise-warning").exists()).toBe(false);
  });

  it("ignores panel-menu power trouble on Calvin's scale, where it cannot compare", async () => {
    const kiosk = {
      id: "kitchen",
      displayStack: "cog",
      displayCheck: {
        ...FINDINGS,
        powerTrouble: { at: "2026-11-08T13:58:00Z", step: "read", level: null, panelLevel: 74 },
      },
    };
    const wrapper = mountGroup({ kiosk, overrides: { ...ramp, brightnessLimit: 26 } });
    await openEditor(wrapper);
    await setLevel(wrapper, "highest-stepper", 30);
    expect(find(wrapper, "raise-warning").exists()).toBe(true);
    expect(find(wrapper, "raise-trouble").exists()).toBe(false);
  });

  // No floor saved: the agent dims to DDC 0 (floor_level() in the kiosk agent),
  // so the editor shows that level instead of a blank.
  it("shows Lowest at 0, the level the agent dims to, when no floor is saved", async () => {
    const wrapper = mountGroup({
      overrides: { ...ramp, brightnessLimit: 26, brightnessConversion: READINGS },
    });
    expect(find(wrapper, "levels-summary").text()).toContain("Lowest 16");
    await openEditor(wrapper);
    expect(stepper(wrapper, "lowest-stepper").props("modelValue")).toBe(16);
    await setLevel(wrapper, "lowest-stepper", 30);
    expect(wrapper.emitted("patch")).toEqual([[{ brightnessFloor: 6 }]]);
  });
});
