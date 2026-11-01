import { describe, it, expect } from "vitest";
import {
  activePowerOverride,
  buildPowerOverride,
  firstScheduleBoundaryAfter,
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

describe("firstScheduleBoundaryAfter", () => {
  it("skips a boundary exactly equal to the set time", () => {
    const boundary = firstScheduleBoundaryAfter({
      enabled: true,
      schedule: schedule(),
      moment: at("2026-07-11T06:00:00+02:00"),
      timeZone: TZ,
    });
    expect(boundary.toISOString()).toBe("2026-07-11T20:00:00.000Z"); // 22:00, not 06:00
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
  const options = { enabled: true, schedule: schedule(), now, timeZone: TZ };

  it("honours an override until the first boundary after setAt", () => {
    expect(
      activePowerOverride({ power: "off", setAt: "2026-07-11T07:00:00.000Z" }, options)
    ).toEqual({
      power: "off",
      setAt: "2026-07-11T07:00:00.000Z",
      expiry: at("2026-07-11T20:00:00.000Z"), // 22:00 local
      hasSchedule: true,
    });
  });

  it("expires exactly on the boundary", () => {
    const override = { power: "off", setAt: "2026-07-11T07:00:00.000Z" };
    expect(
      activePowerOverride(override, { ...options, now: at("2026-07-11T21:59:59+02:00") })
    ).not.toBeNull();
    expect(
      activePowerOverride(override, { ...options, now: at("2026-07-11T22:00:00+02:00") })
    ).toBeNull();
  });

  it("stays until changed without a schedule", () => {
    expect(
      activePowerOverride(
        { power: "on", setAt: "2026-07-11T07:00:00.000Z" },
        { ...options, enabled: false }
      )
    ).toEqual({
      power: "on",
      setAt: "2026-07-11T07:00:00.000Z",
      expiry: null,
      hasSchedule: false,
    });
  });

  it("ignores an expired or malformed override", () => {
    expect(
      activePowerOverride(
        { power: "on", setAt: "2026-07-11T06:00:00.000Z" },
        { ...options, now: at("2026-07-11T23:00:00+02:00") }
      )
    ).toBeNull();
    expect(activePowerOverride({ power: "on", setAt: "not a date" }, options)).toBeNull();
    expect(
      activePowerOverride({ power: "sideways", setAt: "2026-07-11T07:00:00Z" }, options)
    ).toBeNull();
    // The retired shape (until) is no longer an override.
    expect(activePowerOverride({ power: "on", until: null }, options)).toBeNull();
    expect(activePowerOverride(null, options)).toBeNull();
  });
});

describe("activePowerOverride with an unknown screen zone", () => {
  const now = at("2026-11-02T04:30:00Z");
  const setAt = "2026-11-01T21:48:25.107Z";
  const options = { enabled: true, schedule: schedule(), now, timeZone: null };

  // The config says "system", so the screen's zone is the Pi's, not the
  // browser's. Pretend the admin browser is an hour ahead: its own 22:00 to
  // 06:00 window already ended at 04:00Z, while the Pi's ends at 05:00Z.
  const withBrowserZone = (timeZone, run) => {
    const original = process.env.TZ;
    process.env.TZ = timeZone;
    try {
      return run();
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  };

  it("stays active past the browser's own boundary, with no time to show", () => {
    withBrowserZone("Europe/Athens", () => {
      expect(activePowerOverride({ power: "on", setAt }, options)).toEqual({
        power: "on",
        setAt,
        expiry: null,
        hasSchedule: true,
      });
    });
  });

  it("still ends once the agent's whole weekly search window is long gone", () => {
    const longAfter = at("2026-11-20T00:00:00Z");
    expect(activePowerOverride({ power: "on", setAt }, { ...options, now: longAfter })).toBeNull();
  });

  it("says the choice lasts until changed when no schedule can end it", () => {
    expect(activePowerOverride({ power: "off", setAt }, { ...options, enabled: false })).toEqual({
      power: "off",
      setAt,
      expiry: null,
      hasSchedule: false,
    });
  });
});

describe("buildPowerOverride", () => {
  it("stores the choice and the UTC instant, not a browser-computed boundary", () => {
    const now = at("2026-07-11T09:00:00+02:00");
    expect(buildPowerOverride({ power: "off", now })).toEqual({
      power: "off",
      setAt: "2026-07-11T07:00:00.000Z",
    });
  });
});

describe("formatUntil", () => {
  it("shows the boundary's wall-clock time in the screen's timezone", () => {
    expect(formatUntil("2026-07-11T20:00:00.000Z", TZ)).toBe("22:00");
    expect(formatUntil("2026-01-11T05:00:00.000Z", TZ)).toBe("06:00");
  });
});
