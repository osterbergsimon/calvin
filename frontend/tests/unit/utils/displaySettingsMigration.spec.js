import { describe, it, expect } from "vitest";
import { migrateDisplaySettings } from "@/utils/displaySettingsMigration";

const screenWith = regions => ({
  version: 2,
  activeScreenId: "home",
  screens: [{ id: "home", name: "Home", activeRegionId: regions[0].id, layout: { regions } }],
});

const GLOBALS = {
  showWeekNumbers: true,
  maxVisibleEvents: 6,
  imageDisplayMode: "crop",
};

describe("migrateDisplaySettings", () => {
  it("copies the household values into regions without their own", () => {
    const result = migrateDisplaySettings(
      screenWith([{ id: "cal", kind: "calendar", size: 100 }]),
      GLOBALS
    );
    expect(result.changed).toBe(true);
    expect(result.screens.screens[0].layout.regions[0].view).toMatchObject({
      weekNumbers: true,
      maxVisibleEvents: 6,
    });
  });

  it("maps the retired crop mode to fill for photos regions", () => {
    const result = migrateDisplaySettings(
      screenWith([{ id: "photos", kind: "photos", size: 100 }]),
      GLOBALS
    );
    expect(result.screens.screens[0].layout.regions[0].view).toEqual({ fit: "fill" });
  });

  it("leaves regions that already have explicit values untouched", () => {
    const result = migrateDisplaySettings(
      screenWith([
        {
          id: "cal",
          kind: "calendar",
          size: 100,
          view: { weekNumbers: false, maxVisibleEvents: 2 },
        },
        { id: "photos", kind: "photos", size: 100, view: { fit: "center" } },
      ]),
      GLOBALS
    );
    expect(result.changed).toBe(false);
    expect(result.screens.screens[0].layout.regions[0].view).toMatchObject({
      weekNumbers: false,
      maxVisibleEvents: 2,
    });
    expect(result.screens.screens[0].layout.regions[1].view).toEqual({ fit: "center" });
  });

  it("migrates nested split regions too", () => {
    const result = migrateDisplaySettings(
      screenWith([
        {
          id: "top",
          kind: "calendar",
          size: 100,
          split: {
            regions: [
              { id: "a", kind: "calendar", size: 50 },
              { id: "b", kind: "photos", size: 50 },
            ],
          },
        },
      ]),
      GLOBALS
    );
    const subs = result.screens.screens[0].layout.regions[0].split.regions;
    expect(subs[0].view).toMatchObject({ weekNumbers: true, maxVisibleEvents: 6 });
    expect(subs[1].view).toEqual({ fit: "fill" });
  });

  it("falls back to today's defaults when the old keys are missing", () => {
    const result = migrateDisplaySettings(
      screenWith([
        { id: "cal", kind: "calendar", size: 50 },
        { id: "photos", kind: "photos", size: 50 },
      ]),
      {}
    );
    expect(result.screens.screens[0].layout.regions[0].view).toMatchObject({
      weekNumbers: false,
      maxVisibleEvents: 4,
    });
    expect(result.screens.screens[0].layout.regions[1].view).toEqual({ fit: "smart" });
  });

  it("does not mutate the input", () => {
    const input = screenWith([{ id: "cal", kind: "calendar", size: 100 }]);
    migrateDisplaySettings(input, GLOBALS);
    expect(input.screens[0].layout.regions[0].view).toBeUndefined();
  });
});
