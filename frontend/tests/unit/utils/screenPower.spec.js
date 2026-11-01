import { describe, it, expect } from "vitest";
import {
  activePowerOverride,
  formatUntil,
  nextScheduleBoundary,
  scheduleDesiredOn,
} from "@/utils/screenPower";

const TZ = "Europe/Stockholm"; // CEST (+02:00) in July, CET (+01:00) in January.

const schedule = (on = "06:00", off = "22:00", days = [0, 1, 2, 3, 4, 5, 6]) =>
  days.map(day => ({ day, enabled: true, onTime: on, offTime: off }));

const at = iso => new Date(iso);

describe("nextScheduleBoundary", () => {
  it("finds today's off time in the screen's timezone", () => {
    const boundary = nextScheduleBoundary({
      enabled: true,
      schedule: schedule(),
      now: at("2026-07-11T09:00:00+02:00"), // Saturday
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-11T20:00:00.000Z"); // 22:00 local
  });

  it("finds tomorrow's on time after the off window starts", () => {
    const boundary = nextScheduleBoundary({
      enabled: true,
      schedule: schedule(),
      now: at("2026-07-11T23:00:00+02:00"),
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-12T04:00:00.000Z"); // 06:00 local
  });

  it("handles a window that spans midnight", () => {
    const boundary = nextScheduleBoundary({
      enabled: true,
      schedule: schedule("20:00", "07:00"),
      now: at("2026-07-11T23:00:00+02:00"),
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-12T05:00:00.000Z"); // 07:00 local
  });

  it("returns null without a schedule or with the schedule off", () => {
    const now = at("2026-07-11T09:00:00+02:00");
    expect(
      nextScheduleBoundary({ enabled: false, schedule: schedule(), now, timeZone: TZ })
    ).toBeNull();
    expect(nextScheduleBoundary({ enabled: true, schedule: [], now, timeZone: TZ })).toBeNull();
  });

  it("skips days that are not switched on", () => {
    const boundary = nextScheduleBoundary({
      enabled: true,
      // Only Sunday (6) is on, and it starts at 06:00.
      schedule: [{ day: 6, enabled: true, onTime: "06:00", offTime: "22:00" }],
      now: at("2026-07-11T23:00:00+02:00"), // Saturday night
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-12T04:00:00.000Z"); // Sunday 06:00
  });

  it("uses the wall clock of the given zone, not the browser's", () => {
    const boundary = nextScheduleBoundary({
      enabled: true,
      schedule: schedule(),
      now: at("2026-07-11T03:00:00Z"), // 05:00 in Stockholm: the 06:00 wake-up comes next
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-11T04:00:00.000Z");
  });
});

describe("scheduleDesiredOn", () => {
  it("follows the daily window", () => {
    expect(
      scheduleDesiredOn({
        enabled: true,
        schedule: schedule(),
        now: at("2026-07-11T09:00:00+02:00"),
        timeZone: TZ,
      })
    ).toBe(true);
    expect(
      scheduleDesiredOn({
        enabled: true,
        schedule: schedule(),
        now: at("2026-07-11T23:00:00+02:00"),
        timeZone: TZ,
      })
    ).toBe(false);
  });

  it("keeps the screen on with no schedule, or on a day that is off", () => {
    const now = at("2026-07-11T23:00:00+02:00");
    expect(scheduleDesiredOn({ enabled: false, schedule: schedule(), now, timeZone: TZ })).toBe(
      true
    );
    expect(
      scheduleDesiredOn({
        enabled: true,
        schedule: [{ day: 5, enabled: false, onTime: "06:00", offTime: "22:00" }],
        now,
        timeZone: TZ,
      })
    ).toBe(true);
  });
});

describe("activePowerOverride", () => {
  const now = at("2026-07-11T09:00:00+02:00");

  it("honours an override until a future boundary", () => {
    expect(activePowerOverride({ power: "off", until: "2026-07-11T20:00:00.000Z" }, now)).toEqual({
      power: "off",
      until: "2026-07-11T20:00:00.000Z",
    });
  });

  it("honours an override with no until (no schedule to take over)", () => {
    expect(activePowerOverride({ power: "on", until: null }, now)).toEqual({
      power: "on",
      until: null,
    });
  });

  it("ignores an expired or malformed override", () => {
    expect(activePowerOverride({ power: "on", until: "2026-07-11T06:00:00.000Z" }, now)).toBeNull();
    expect(activePowerOverride({ power: "on", until: "not a date" }, now)).toBeNull();
    expect(activePowerOverride({ power: "sideways", until: null }, now)).toBeNull();
    expect(activePowerOverride(null, now)).toBeNull();
  });
});

describe("formatUntil", () => {
  it("shows the boundary's wall-clock time in the screen's timezone", () => {
    expect(formatUntil("2026-07-11T20:00:00.000Z", TZ)).toBe("22:00");
    expect(formatUntil("2026-01-11T05:00:00.000Z", TZ)).toBe("06:00");
  });
});
