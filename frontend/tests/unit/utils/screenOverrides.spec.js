import { describe, it, expect } from "vitest";
import {
  DEFAULT_COPYABLE_KEYS,
  SCREEN_SETTING_DESCRIPTORS,
  SCREEN_SETTING_LABELS,
  descriptorFor,
  descriptorsForSection,
  isSettingVisible,
  normalizeSettingValue,
  settingControlOptions,
  visibleDescriptors,
} from "@/utils/screenOverrides";

// One descriptor per per-screen setting (settings-scope §7 item 2). The
// descriptor is the one place that says a key is per screen with a household
// default, which control edits it, and whether a plain browser has a local
// layer of its own.
const CONTROL_KINDS = ["segmented", "toggle", "select", "number", "photoSources", "schedule"];

describe("screen setting descriptors", () => {
  it("describes every per-screen setting with the fields the row needs", () => {
    for (const descriptor of SCREEN_SETTING_DESCRIPTORS) {
      expect(descriptor.key, "key").toBeTruthy();
      expect(descriptor.label, `${descriptor.key} label`).toBeTruthy();
      expect(descriptor.section, `${descriptor.key} section`).toBeTruthy();
      expect(CONTROL_KINDS, `${descriptor.key} control kind`).toContain(descriptor.control.kind);
      expect(Array.isArray(descriptor.keywords), `${descriptor.key} keywords`).toBe(true);
      expect(descriptor.keywords.length, `${descriptor.key} keywords`).toBeGreaterThan(0);
      expect(typeof descriptor.browserLayer, `${descriptor.key} browser layer`).toBe("boolean");
    }
  });

  it("covers the Behaviour, Effects and Default-copyable settings", () => {
    const keys = SCREEN_SETTING_DESCRIPTORS.map(descriptor => descriptor.key);
    for (const key of [
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "loadingLight",
      "layoutMode",
      "effectsLevel",
      ...DEFAULT_COPYABLE_KEYS,
    ]) {
      expect(keys, key).toContain(key);
    }
  });

  it("derives the copyable keys and labels from the descriptors", () => {
    expect(new Set(DEFAULT_COPYABLE_KEYS)).toEqual(
      new Set(
        SCREEN_SETTING_DESCRIPTORS.filter(descriptor => descriptor.copyable).map(
          descriptor => descriptor.key
        )
      )
    );
    for (const descriptor of SCREEN_SETTING_DESCRIPTORS) {
      expect(SCREEN_SETTING_LABELS[descriptor.key]).toBe(descriptor.label);
    }
    // Pages are overrides too, but they are not per-screen settings.
    expect(SCREEN_SETTING_LABELS.availableScreens).toBe("Pages shown");
    expect(SCREEN_SETTING_LABELS.defaultScreenId).toBe("Start page");
  });

  it("marks the settings with a browser localStorage layer", () => {
    for (const key of [
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "loadingLight",
      "layoutMode",
      "touchControls",
      "onScreenKeyboard",
    ]) {
      expect(descriptorFor(key).browserLayer, key).toBe(true);
    }
    for (const key of [
      "effectsLevel",
      "orientation",
      "orientationFlipped",
      "applyDisplayRotation",
      "displayScheduleEnabled",
      "displaySchedule",
      "displayTimeoutEnabled",
      "displayTimeout",
    ]) {
      expect(descriptorFor(key).browserLayer, key).toBe(false);
    }
  });

  it("finds descriptors by key and section", () => {
    expect(descriptorFor("loadingLight").label).toBe("Loading light");
    expect(descriptorFor("nope")).toBeNull();
    expect(descriptorsForSection("behaviour").map(descriptor => descriptor.key)).toEqual([
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "loadingLight",
      "layoutMode",
    ]);
    expect(descriptorsForSection("effects").map(descriptor => descriptor.key)).toEqual([
      "effectsLevel",
    ]);
  });
});

describe("descriptor values", () => {
  it("normalizes a toggle", () => {
    const descriptor = descriptorFor("orientationFlipped");
    expect(normalizeSettingValue(descriptor, true)).toBe(true);
    expect(normalizeSettingValue(descriptor, "true")).toBe(true);
    expect(normalizeSettingValue(descriptor, false)).toBe(false);
    expect(normalizeSettingValue(descriptor, "false")).toBe(false);
  });

  it("normalizes a segmented choice and falls back to its default", () => {
    const descriptor = descriptorFor("loadingLight");
    expect(normalizeSettingValue(descriptor, "pulse")).toBe("pulse");
    expect(normalizeSettingValue(descriptor, "sparkle")).toBe("comet");
    expect(normalizeSettingValue(descriptorFor("layoutMode"), "phone")).toBe("phone");
    expect(normalizeSettingValue(descriptorFor("layoutMode"), "table")).toBe("auto");
    // The pre-rename effects value still reads as Standard.
    expect(normalizeSettingValue(descriptorFor("effectsLevel"), "performance")).toBe("standard");
  });

  it("normalizes a select and can keep a value outside its list", () => {
    const startAfter = descriptorFor("photoFrameTimeout");
    expect(normalizeSettingValue(startAfter, 600)).toBe(600);
    expect(normalizeSettingValue(startAfter, "900")).toBe(900);
    expect(normalizeSettingValue(startAfter, "nope")).toBe(300);

    const options = settingControlOptions(startAfter, 420);
    expect(options.map(option => option.label)).toContain("7 min");
    expect(options.find(option => option.value === 420)).toBeTruthy();
  });

  it("normalizes a number against its limits", () => {
    const descriptor = {
      key: "demoNumber",
      label: "Demo",
      control: { kind: "number", min: 10, max: 100, step: 5 },
      defaultValue: 20,
    };
    expect(normalizeSettingValue(descriptor, 50)).toBe(50);
    expect(normalizeSettingValue(descriptor, 5)).toBe(10);
    expect(normalizeSettingValue(descriptor, 500)).toBe(100);
    expect(normalizeSettingValue(descriptor, "nope")).toBe(20);
  });

  it("shows the start-after and photos-from rows only when the frame is on", () => {
    const behaviour = descriptorsForSection("behaviour");
    expect(visibleDescriptors(behaviour, {}).map(descriptor => descriptor.key)).toEqual([
      "photoFrameEnabled",
      "loadingLight",
      "layoutMode",
    ]);
    expect(
      visibleDescriptors(behaviour, { photoFrameEnabled: true }).map(descriptor => descriptor.key)
    ).toEqual([
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "loadingLight",
      "layoutMode",
    ]);
    expect(isSettingVisible(descriptorFor("loadingLight"), {})).toBe(true);
  });
});
