// frontend/tests/unit/utils/timezones.spec.js
import { describe, it, expect, afterEach } from "vitest";
import {
  SERVER_TIMEZONE,
  FALLBACK_TIMEZONES,
  availableTimezones,
  buildTimezoneOptions,
  timezoneLabel,
} from "@/utils/timezones";

const realSupportedValuesOf = Intl.supportedValuesOf;

const setSupportedValuesOf = impl => {
  Object.defineProperty(Intl, "supportedValuesOf", {
    configurable: true,
    writable: true,
    value: impl,
  });
};

afterEach(() => {
  setSupportedValuesOf(realSupportedValuesOf);
});

describe("timezoneLabel", () => {
  it("shows the IANA id with underscores as spaces", () => {
    expect(timezoneLabel("America/New_York")).toBe("America/New York");
    expect(timezoneLabel("UTC")).toBe("UTC");
  });
});

describe("availableTimezones", () => {
  it("uses the engine's full IANA list when Intl.supportedValuesOf exists", () => {
    setSupportedValuesOf(() => ["Africa/Abidjan", "Europe/Stockholm"]);
    expect(availableTimezones()).toEqual(["Africa/Abidjan", "Europe/Stockholm"]);
  });

  it("falls back to the previously hardcoded zones when the API is missing", () => {
    setSupportedValuesOf(undefined);
    expect(availableTimezones()).toEqual(FALLBACK_TIMEZONES);
    expect(FALLBACK_TIMEZONES).toContain("Europe/Stockholm");
  });

  it("falls back when the API throws or returns nothing usable", () => {
    setSupportedValuesOf(() => {
      throw new Error("not supported");
    });
    expect(availableTimezones()).toEqual(FALLBACK_TIMEZONES);
    setSupportedValuesOf(() => []);
    expect(availableTimezones()).toEqual(FALLBACK_TIMEZONES);
  });
});

describe("buildTimezoneOptions", () => {
  it("puts the server's timezone first", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm", "UTC"]);
    const options = buildTimezoneOptions(null);
    expect(options[0]).toEqual({ value: SERVER_TIMEZONE, label: "Server's timezone" });
  });

  it("offers the full list with readable labels, UTC second", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm", "America/New_York"]);
    const options = buildTimezoneOptions("Europe/Stockholm");
    expect(options.map(o => o.value)).toEqual([
      SERVER_TIMEZONE,
      "UTC",
      "Europe/Stockholm",
      "America/New_York",
    ]);
    expect(options.find(o => o.value === "America/New_York").label).toBe("America/New York");
  });

  it("keeps a single UTC when the engine lists it itself", () => {
    setSupportedValuesOf(() => ["UTC", "Europe/Stockholm"]);
    expect(buildTimezoneOptions(null).map(o => o.value)).toEqual([
      SERVER_TIMEZONE,
      "UTC",
      "Europe/Stockholm",
    ]);
  });

  it("keeps the selected zone selectable (round-trip)", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    const options = buildTimezoneOptions("Europe/Stockholm");
    expect(options.find(o => o.value === "Europe/Stockholm")).toBeTruthy();
  });

  it("shows a stored zone the runtime list lacks, right after the server option", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    const options = buildTimezoneOptions("Antarctica/Troll");
    expect(options[1]).toEqual({ value: "Antarctica/Troll", label: "Antarctica/Troll" });
  });

  it("does not duplicate a stored zone that is in the list", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    const options = buildTimezoneOptions("Europe/Stockholm");
    expect(options.filter(o => o.value === "Europe/Stockholm")).toHaveLength(1);
  });

  it("adds nothing extra when the server timezone is selected", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    expect(buildTimezoneOptions(SERVER_TIMEZONE).map(o => o.value)).toEqual([
      SERVER_TIMEZONE,
      "UTC",
      "Europe/Stockholm",
    ]);
    expect(buildTimezoneOptions(null).map(o => o.value)).toEqual([
      SERVER_TIMEZONE,
      "UTC",
      "Europe/Stockholm",
    ]);
  });
});
