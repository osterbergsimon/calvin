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
const CONTROL_KINDS = [
  "segmented",
  "toggle",
  "select",
  "number",
  "range",
  "photoSources",
  "schedule",
  "readings",
  "theme",
  "time",
];

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
      "focusLightMode",
      "focusLightDimOthers",
      "keyboardFeedbackEnabled",
      "keyboardFeedbackMode",
      "showUI",
      "clockBarShowInKiosk",
      "tapAnywhereReveal",
      "hotCornerPosition",
      "hotCornerOpacity",
      "hotCornerSize",
      "hotCornerLongPressMs",
      "selectedTheme",
      "themeMode",
      "darkModeStart",
      "darkModeEnd",
      "typeTheme",
      "touchControlSize",
      "uiSize",
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
      "touchControls",
      "onScreenKeyboard",
      "showUI",
      "clockBarShowInKiosk",
      "tapAnywhereReveal",
      // Settings text size keeps its plain-browser layer (ThisBrowserSettings
      // and useUiScale still read calvin-ui-size).
      "uiSize",
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
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "loadingLight",
      "layoutMode",
      "focusLightMode",
      "focusLightDimOthers",
      "keyboardFeedbackEnabled",
      "keyboardFeedbackMode",
      "hotCornerPosition",
      "hotCornerOpacity",
      "hotCornerSize",
      "hotCornerLongPressMs",
      "selectedTheme",
      "themeMode",
      "darkModeStart",
      "darkModeEnd",
      "typeTheme",
      "touchControlSize",
    ]) {
      expect(descriptorFor(key).browserLayer, key).toBe(false);
    }
  });

  it("puts Look after Pages and moves the two sizes into Display", () => {
    expect(descriptorsForSection("look").map(descriptor => descriptor.key)).toEqual([
      "selectedTheme",
      "themeMode",
      "darkModeStart",
      "darkModeEnd",
      "typeTheme",
    ]);
    expect(descriptorsForSection("look").map(descriptor => descriptor.label)).toEqual([
      "Theme",
      "Light or dark",
      "Dark from",
      "Dark to",
      "Font",
    ]);
    const display = descriptorsForSection("display").map(descriptor => descriptor.key);
    expect(display.slice(-2)).toEqual(["touchControlSize", "uiSize"]);
    expect(descriptorFor("touchControlSize").label).toBe("Dashboard size");
    expect(descriptorFor("uiSize").label).toBe("Settings text size");
  });

  it("keeps the old appearance, theme and font words on the Look rows", () => {
    const words = new Set(descriptorsForSection("look").flatMap(d => d.keywords));
    for (const word of ["appearance", "theme", "dark mode", "font", "typeface"]) {
      expect(words.has(word), word).toBe(true);
    }
  });

  it("shows the dark-hour rows only on a schedule", () => {
    const look = descriptorsForSection("look");
    expect(visibleDescriptors(look, { themeMode: "auto" }).map(d => d.key)).toEqual([
      "selectedTheme",
      "themeMode",
      "typeTheme",
    ]);
    expect(visibleDescriptors(look, { themeMode: "time" }).map(d => d.key)).toEqual([
      "selectedTheme",
      "themeMode",
      "darkModeStart",
      "darkModeEnd",
      "typeTheme",
    ]);
  });

  it("finds descriptors by key and section", () => {
    expect(descriptorFor("loadingLight").label).toBe("Loading light");
    expect(descriptorFor("nope")).toBeNull();
    expect(descriptorsForSection("behaviour").map(descriptor => descriptor.key)).toEqual([
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "photoRotationInterval",
      "loadingLight",
      "layoutMode",
    ]);
    expect(descriptorsForSection("effects").map(descriptor => descriptor.key)).toEqual([
      "effectsLevel",
      "focusLightMode",
      "focusLightDimOthers",
    ]);
    // The button-press label is part of the remote now.
    expect(descriptorsForSection("remote").map(descriptor => descriptor.key)).toEqual([
      "keyboardFeedbackEnabled",
      "keyboardFeedbackMode",
    ]);
    expect(descriptorsForSection("controls").map(descriptor => descriptor.key)).toEqual([
      "showUI",
      "clockBarShowInKiosk",
      "tapAnywhereReveal",
      "hotCornerPosition",
      "hotCornerOpacity",
      "hotCornerSize",
      "hotCornerLongPressMs",
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

  it("reads Photo frame as a boolean from either spelling", () => {
    const descriptor = descriptorFor("photoFrameEnabled");
    expect(normalizeSettingValue(descriptor, true)).toBe(true);
    expect(normalizeSettingValue(descriptor, "true")).toBe(true);
    expect(normalizeSettingValue(descriptor, false)).toBe(false);
    expect(normalizeSettingValue(descriptor, "false")).toBe(false);
    expect(normalizeSettingValue(descriptor, undefined)).toBe(false);
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

  it("offers photo times from 10 seconds to an hour, and keeps a time between them", () => {
    const showFor = descriptorFor("photoRotationInterval");
    expect(showFor.section).toBe("behaviour");
    expect(settingControlOptions(showFor, 30).map(option => option.label)).toEqual([
      "10 s",
      "15 s",
      "30 s",
      "1 min",
      "2 min",
      "5 min",
      "10 min",
      "15 min",
      "30 min",
      "1 hour",
    ]);
    // Ten minutes is one choice.
    expect(settingControlOptions(showFor, 600).find(option => option.value === 600).label).toBe(
      "10 min"
    );
    // A value set with the old 5 s stepper stays as it was.
    expect(normalizeSettingValue(showFor, 45)).toBe(45);
    expect(settingControlOptions(showFor, 45).map(option => option.label)).toContain("45 s");
    expect(normalizeSettingValue(showFor, "nope")).toBe(30);
    expect(normalizeSettingValue(showFor, 2)).toBe(30);
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
      "photoRotationInterval",
      "loadingLight",
      "layoutMode",
    ]);
    expect(
      visibleDescriptors(behaviour, { photoFrameEnabled: true }).map(descriptor => descriptor.key)
    ).toEqual([
      "photoFrameEnabled",
      "photoFrameTimeout",
      "photoFrameSourceIds",
      "photoRotationInterval",
      "loadingLight",
      "layoutMode",
    ]);
    expect(isSettingVisible(descriptorFor("loadingLight"), {})).toBe(true);
  });

  it("shows the corner rows only while the controls are hidden", () => {
    const controls = descriptorsForSection("controls");
    expect(visibleDescriptors(controls, { showUI: true }).map(d => d.key)).toEqual([
      "showUI",
      "clockBarShowInKiosk",
      "tapAnywhereReveal",
    ]);
    expect(visibleDescriptors(controls, { showUI: false }).map(d => d.key)).toEqual([
      "showUI",
      "clockBarShowInKiosk",
      "tapAnywhereReveal",
      "hotCornerPosition",
      "hotCornerOpacity",
      "hotCornerSize",
      "hotCornerLongPressMs",
    ]);
  });
});
