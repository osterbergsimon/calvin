/**
 * Unit tests for mode store
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useModeStore } from "@/stores/mode";

describe("Mode Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should initialize with calendar mode", () => {
    const store = useModeStore();

    expect(store.currentMode).toBe(store.MODES.CALENDAR);
    expect(store.isFullscreen).toBe(false);
    expect(store.fullscreenMode).toBe(null);
  });

  it("should set mode correctly", () => {
    const store = useModeStore();

    store.setMode(store.MODES.PHOTOS);
    expect(store.currentMode).toBe(store.MODES.PHOTOS);
    expect(store.isFullscreen).toBe(false);
  });

  it("should store previous mode when entering settings", () => {
    const store = useModeStore();

    store.setMode(store.MODES.PHOTOS);
    store.setMode(store.MODES.SETTINGS);

    expect(store.currentMode).toBe(store.MODES.SETTINGS);
    expect(store.previousMode).toBe(store.MODES.PHOTOS);
  });

  it("should return from settings to previous mode", () => {
    const store = useModeStore();

    store.setMode(store.MODES.PHOTOS);
    store.setMode(store.MODES.SETTINGS);
    store.returnFromSettings();

    expect(store.currentMode).toBe(store.MODES.PHOTOS);
    expect(store.previousMode).toBe(null);
  });

  it("should enter fullscreen mode", () => {
    const store = useModeStore();

    store.enterFullscreen(store.MODES.PHOTOS);

    expect(store.isFullscreen).toBe(true);
    expect(store.fullscreenMode).toBe(store.MODES.PHOTOS);
  });

  it("should exit fullscreen and return to previous mode", () => {
    const store = useModeStore();

    // Start in calendar mode, then switch to photos and enter fullscreen
    store.setMode(store.MODES.PHOTOS);
    store.enterFullscreen(store.MODES.PHOTOS);

    // Test functionality: exitFullscreen exits fullscreen and restores previous mode
    store.exitFullscreen();

    expect(store.isFullscreen).toBe(false);
    expect(store.fullscreenMode).toBe(null);
    // When exiting fullscreen, it should return to the mode before fullscreen
    // Since we set mode to PHOTOS before entering fullscreen, modeBeforeFullscreen is PHOTOS
    // So it should return to PHOTOS (the mode we were in before fullscreen)
    expect(store.currentMode).toBe(store.MODES.PHOTOS);
  });

  it("should exit fullscreen and return to calendar when no previous mode", () => {
    const store = useModeStore();

    // Enter fullscreen directly without setting a mode first
    // This simulates entering fullscreen from calendar mode
    store.enterFullscreen(store.MODES.PHOTOS);
    store.exitFullscreen();

    // Test functionality: when exiting without a tracked previous mode, falls back to calendar
    expect(store.isFullscreen).toBe(false);
    expect(store.fullscreenMode).toBe(null);
    expect(store.currentMode).toBe(store.MODES.CALENDAR);
  });
});
