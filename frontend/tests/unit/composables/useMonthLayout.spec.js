import { describe, it, expect } from "vitest";
import { buildMonthWeeks, isSpanningEvent } from "@/composables/useMonthLayout";

// Build a per-day event copy the way getEventsForDate does, carrying the
// position flags the layout relies on.
function copy(id, { start, allDay = false, multi = false, isStart, isEnd, title = id }) {
  return {
    id,
    title,
    start: start ?? "2026-07-14T09:00:00Z",
    end: start ?? "2026-07-14T09:00:00Z",
    all_day: allDay,
    _isMultiDay: multi,
    _isStart: isStart,
    _isEnd: isEnd,
    _isMiddle: multi && !isStart && !isEnd,
  };
}

// Assemble one week (7 day cells) from a map of column -> event copies.
function week(colEvents) {
  return Array.from({ length: 7 }, (_, col) => ({
    date: new Date(2026, 6, 13 + col),
    otherMonth: false,
    isToday: false,
    events: colEvents[col] || [],
  }));
}

describe("isSpanningEvent", () => {
  it("treats all-day and multi-day events as spanning, timed single-day as not", () => {
    expect(isSpanningEvent({ all_day: true })).toBe(true);
    expect(isSpanningEvent({ _isMultiDay: true })).toBe(true);
    expect(isSpanningEvent({ all_day: false, _isMultiDay: false })).toBe(false);
  });
});

describe("buildMonthWeeks — segmentation", () => {
  it("collapses a multi-day event's per-day copies into one spanning segment", () => {
    // Grandma visiting: Tue(1) -> Thu(3), contained in the week.
    const days = week({
      1: [copy("g", { multi: true, isStart: true, isEnd: false })],
      2: [copy("g", { multi: true, isStart: false, isEnd: false })],
      3: [copy("g", { multi: true, isStart: false, isEnd: true })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.ribbons).toHaveLength(1);
    const seg = wk.ribbons[0];
    expect(seg.startCol).toBe(1);
    expect(seg.span).toBe(3);
    expect(seg.continuesLeft).toBe(false);
    expect(seg.continuesRight).toBe(false);
  });

  it("flags continuation when a span crosses the week's edges", () => {
    // Enters from a previous week (no real start in-week) and runs to the edge
    // without ending: continuesLeft on the left week, continuesRight here.
    const days = week({
      0: [copy("trip", { multi: true, isStart: false, isEnd: false })],
      1: [copy("trip", { multi: true, isStart: false, isEnd: false })],
      2: [copy("trip", { multi: true, isStart: false, isEnd: false })],
    });
    const [wk] = buildMonthWeeks(days);
    const seg = wk.ribbons[0];
    expect(seg.startCol).toBe(0);
    expect(seg.span).toBe(3);
    expect(seg.continuesLeft).toBe(true);
    expect(seg.continuesRight).toBe(true);
  });

  it("keeps a single-day all-day event as a one-column ribbon", () => {
    const days = week({
      2: [copy("holiday", { allDay: true, multi: false, isStart: true, isEnd: true })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.ribbons).toHaveLength(1);
    expect(wk.ribbons[0].span).toBe(1);
    expect(wk.ribbons[0].continuesLeft).toBe(false);
    expect(wk.ribbons[0].continuesRight).toBe(false);
  });
});

describe("buildMonthWeeks — lane assignment", () => {
  it("stacks overlapping spans on separate lanes and reports laneCount", () => {
    const days = week({
      0: [copy("a", { multi: true, isStart: true, isEnd: false })],
      1: [
        copy("a", { multi: true, isStart: false, isEnd: true }),
        copy("b", { multi: true, isStart: true, isEnd: false }),
      ],
      2: [copy("b", { multi: true, isStart: false, isEnd: true })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.laneCount).toBe(2);
    const a = wk.ribbons.find(r => r.event.id === "a");
    const b = wk.ribbons.find(r => r.event.id === "b");
    expect(a.lane).not.toBe(b.lane);
  });

  it("reuses a lane for non-overlapping spans in the same week", () => {
    const days = week({
      0: [copy("early", { multi: true, isStart: true, isEnd: false })],
      1: [copy("early", { multi: true, isStart: false, isEnd: true })],
      4: [copy("late", { multi: true, isStart: true, isEnd: false })],
      5: [copy("late", { multi: true, isStart: false, isEnd: true })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.laneCount).toBe(1);
    expect(wk.ribbons.every(r => r.lane === 0)).toBe(true);
  });

  it("gives the longest overlapping span the top lane for stability", () => {
    const days = week({
      0: [copy("long", { multi: true, isStart: true, isEnd: false })],
      1: [
        copy("long", { multi: true, isStart: false, isEnd: false }),
        copy("short", { multi: true, isStart: true, isEnd: true, title: "short" }),
      ],
      2: [copy("long", { multi: true, isStart: false, isEnd: true })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.ribbons.find(r => r.event.id === "long").lane).toBe(0);
    expect(wk.ribbons.find(r => r.event.id === "short").lane).toBe(1);
  });
});

describe("buildMonthWeeks — timed events", () => {
  it("puts point-in-time events in the day's timed list, not the band", () => {
    const days = week({
      2: [copy("meeting", { start: "2026-07-15T14:00:00Z" })],
    });
    const [wk] = buildMonthWeeks(days);
    expect(wk.ribbons).toHaveLength(0);
    expect(wk.days[2].timed).toHaveLength(1);
    expect(wk.days[2].timed[0].id).toBe("meeting");
  });

  it("caps timed events at maxTimed and reports the remainder as hiddenCount", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      copy(`e${i}`, { start: `2026-07-15T0${i}:00:00Z` })
    );
    const days = week({ 2: many });
    const [wk] = buildMonthWeeks(days, { maxTimed: 3 });
    expect(wk.days[2].timed).toHaveLength(3);
    expect(wk.days[2].hiddenCount).toBe(2);
  });

  it("does not hide anything when timed count is within the cap", () => {
    const days = week({ 2: [copy("only", { start: "2026-07-15T14:00:00Z" })] });
    const [wk] = buildMonthWeeks(days, { maxTimed: 4 });
    expect(wk.days[2].hiddenCount).toBe(0);
  });
});

describe("buildMonthWeeks — shape", () => {
  it("returns one entry per 7-day week with 7 day cells each", () => {
    const days = [...week({}), ...week({})];
    const weeks = buildMonthWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toHaveLength(7);
  });

  it("is empty for empty input", () => {
    expect(buildMonthWeeks([])).toEqual([]);
    expect(buildMonthWeeks()).toEqual([]);
  });
});
