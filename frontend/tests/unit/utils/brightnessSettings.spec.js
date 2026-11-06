import { describe, it, expect } from "vitest";
import {
  DEFAULT_COPYABLE_KEYS,
  SCREEN_SETTING_LABELS,
  changedSettingRows,
  descriptorFor,
  withoutAllOverrides,
} from "@/utils/screenOverrides";

const BRIGHTNESS_KEYS = [
  "brightnessRampEnabled",
  "brightness",
  "brightnessStep",
  "brightnessStepSeconds",
  "sleepMode",
  "brightnessLimit",
  "brightnessConversion",
];

describe("brightness per-screen descriptors (calvin-29ws)", () => {
  it.each(BRIGHTNESS_KEYS)("%s is a per-screen setting that is never copied to Default", key => {
    const descriptor = descriptorFor(key);
    expect(descriptor).not.toBeNull();
    expect(descriptor.section).toBe("brightness");
    expect(descriptor.copyable).toBe(false);
    expect(DEFAULT_COPYABLE_KEYS).not.toContain(key);
    expect(SCREEN_SETTING_LABELS[key]).toBeTruthy();
  });

  it("lists brightness overrides in Changed here, in page order, after the schedule", () => {
    const rows = changedSettingRows({
      touchControls: "on",
      brightnessRampEnabled: true,
      displayScheduleEnabled: true,
      sleepMode: "dim",
    });
    expect(rows.map(r => r.key)).toEqual([
      "displayScheduleEnabled",
      "brightnessRampEnabled",
      "sleepMode",
      "touchControls",
    ]);
  });

  it("reset everything turns the ramp off but keeps the check results", () => {
    const next = withoutAllOverrides({
      displayName: "Kitchen",
      brightnessRampEnabled: true,
      brightness: 19,
      brightnessStep: 3,
      sleepMode: "dim",
      brightnessLimit: 26,
      brightnessConversion: [{ ddc: 5, menu: 28 }],
      touchControls: "on",
    });
    expect(next).toEqual({
      displayName: "Kitchen",
      brightnessLimit: 26,
      brightnessConversion: [{ ddc: 5, menu: 28 }],
    });
  });

  it("defaults the descriptors the agent defaults to", () => {
    expect(descriptorFor("brightnessRampEnabled").defaultValue).toBe(false);
    expect(descriptorFor("sleepMode").defaultValue).toBe("standby");
    expect(descriptorFor("brightnessStep").defaultValue).toBe(2);
    expect(descriptorFor("brightnessStepSeconds").defaultValue).toBe(1.5);
  });
});
