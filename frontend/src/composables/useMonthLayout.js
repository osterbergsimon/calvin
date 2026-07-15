// Month-view layout: turn a flat list of day cells into week rows where
// spanning events (all-day or multi-day) become continuous ribbons in stable
// lanes, and point-in-time events stay as a per-day list.
//
// This is pure, framework-free logic so it can be unit-tested in isolation.
// The calendar component owns the date math and passes in day cells that already
// carry the per-day event copies with _isStart / _isEnd / _isMultiDay flags
// (see getEventsForDate in CalendarView.vue).

const DAYS_PER_WEEK = 7;

// An event occupies a ribbon (not the timed list) when it spans more than one
// calendar day or is marked all-day. A midnight-crossing timed event (e.g. a
// red-eye) is multi-day, so it rides the band too — that is the honest read.
export function isSpanningEvent(event) {
  return Boolean(event.all_day || event._isMultiDay);
}

// Split the window into weeks of 7. The month window length is always a
// multiple of 7, but guard the tail so a short/odd array never throws.
function chunkWeeks(days) {
  const weeks = [];
  for (let i = 0; i < days.length; i += DAYS_PER_WEEK) {
    weeks.push(days.slice(i, i + DAYS_PER_WEEK));
  }
  return weeks;
}

// For one week, collapse each spanning event's per-day copies into a single
// segment: the run of columns it covers, plus whether it continues past either
// edge of THIS week (into an earlier/later week or off the visible window).
function segmentsForWeek(weekDays) {
  const byId = new Map();

  weekDays.forEach((day, col) => {
    (day.events || []).forEach(event => {
      if (!isSpanningEvent(event)) return;
      const existing = byId.get(event.id);
      if (existing) {
        existing.lastCol = col;
        existing.endEvent = event;
      } else {
        byId.set(event.id, {
          event,
          firstCol: col,
          lastCol: col,
          startEvent: event,
          endEvent: event,
        });
      }
    });
  });

  return Array.from(byId.values()).map(run => ({
    event: run.event,
    startCol: run.firstCol,
    span: run.lastCol - run.firstCol + 1,
    // Continues left when the copy at the first covered column is NOT the
    // event's real start — i.e. it began before this week's Monday.
    continuesLeft: !run.startEvent._isStart,
    continuesRight: !run.endEvent._isEnd,
  }));
}

// Greedy interval scheduling: place each segment in the lowest lane whose
// occupied columns don't overlap it. Longer bars are placed first so they hold
// the top lanes, which keeps the band visually stable week to week.
function assignLanes(segments) {
  const sorted = [...segments].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    if (a.span !== b.span) return b.span - a.span; // longer first
    return new Date(a.event.start).getTime() - new Date(b.event.start).getTime();
  });

  const lanes = []; // lanes[i] = array of {startCol, endCol} already placed
  return sorted.map(seg => {
    const endCol = seg.startCol + seg.span - 1;
    let lane = lanes.findIndex(
      placed => !placed.some(p => seg.startCol <= p.endCol && endCol >= p.startCol)
    );
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push({ startCol: seg.startCol, endCol });
    return { ...seg, lane };
  });
}

/**
 * Build week rows for the month grid.
 *
 * @param {Array} days - flat day cells: { date, otherMonth, isToday, events }
 * @param {Object} [options]
 * @param {number} [options.maxTimed=Infinity] - max timed events shown per day
 *   before collapsing the rest into a hiddenCount ("+N more").
 * @returns {Array} weeks, each:
 *   {
 *     laneCount: number,
 *     ribbons: [{ event, startCol, span, lane, continuesLeft, continuesRight }],
 *     days: [{ date, otherMonth, isToday, timed: [...], hiddenCount }]  // length 7
 *   }
 */
export function buildMonthWeeks(days, options = {}) {
  const maxTimed = options.maxTimed ?? Infinity;

  return chunkWeeks(days || []).map(weekDays => {
    const ribbons = assignLanes(segmentsForWeek(weekDays));
    const laneCount = ribbons.reduce((max, r) => Math.max(max, r.lane + 1), 0);

    const dayCells = weekDays.map(day => {
      const timedAll = (day.events || []).filter(e => !isSpanningEvent(e));
      return {
        date: day.date,
        otherMonth: day.otherMonth,
        isToday: day.isToday,
        timed: timedAll.slice(0, maxTimed),
        hiddenCount: Math.max(0, timedAll.length - maxTimed),
      };
    });

    return { laneCount, ribbons, days: dayCells };
  });
}
