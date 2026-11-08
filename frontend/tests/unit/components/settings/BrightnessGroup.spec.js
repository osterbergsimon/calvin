import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";

const FINDINGS = { ddc: true, writes: true, checkedAt: "2026-11-04T10:00:00Z" };
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
    expect(find(wrapper, "check-summary").text()).toContain("limit 26 (4 Nov)");
    await find(wrapper, "check-open").trigger("click");
    expect(wrapper.emitted("open-check")[0][0]).toEqual({ step: "detect" });
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
    expect(link.attributes("href")).toContain("KIOSK_POWER.md");
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

  it("explains the limit on the menu scale", () => {
    const wrapper = mountGroup({ overrides: withMenu });
    expect(find(wrapper, "limit-note").text()).toContain(
      "You can go up to 78 on the panel's own menu (Calvin 26)."
    );
    expect(find(wrapper, "limit-note").text()).toContain("limit the display check found on 4 Nov");
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

  it("shows the lowest level the check found, on the menu scale when there is a match", () => {
    const wrapper = mountGroup({
      overrides: {
        ...ramp,
        brightnessLimit: 26,
        brightnessFloor: 5,
        brightnessConversion: READINGS,
      },
    });
    expect(find(wrapper, "floor-note").text()).toContain("Lowest: Panel 28 (Calvin 5)");
  });

  it("shows the lowest level on Calvin's scale without a match, and hides it when unset", () => {
    expect(
      find(mountGroup({ overrides: { ...ramp, brightnessFloor: 3 } }), "floor-note").text()
    ).toContain("Lowest: Calvin 3");
    expect(find(mountGroup({ overrides: ramp }), "floor-note").exists()).toBe(false);
  });
});
