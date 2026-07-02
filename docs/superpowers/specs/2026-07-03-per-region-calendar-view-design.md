# Per-region calendar view + rolling-as-modifier — design

**Bead:** calvin-0t3 (scope expanded during brainstorming from "split the global
`calendarViewMode` field" to "make calendar view per-region").

## Problem

`calendarViewMode` is a single global field with four values
(`month`/`week`/`day`/`rolling`). Two problems:

1. **Rolling isn't a peer view** — it's a *windowing* choice orthogonal to
   granularity, but it's modeled as a 4th mutually-exclusive value. The result is
   asymmetric: the on-calendar toggle can cycle *out* of rolling (→ month) but
   never *into* it.
2. **View is global** — every calendar region on every screen shows the same
   view. There's no way to have full-month on one page and a rolling window on
   another.

## Model

Two independent axes, held **per calendar region** (not globally):

- **Base granularity:** `month | week | day` (the on-calendar toggle)
- **Windowing:** `rolling` on/off (a per-region setting)

"Rolling" rolls the next unit down from now:

| base | rolling off | rolling on |
|---|---|---|
| month | month grid *(unchanged)* | **month-rolling**: `weeks` weeks from the current week, weekday grid *(today's existing rolling behavior)* |
| week | current week, Mon–Sun *(unchanged)* | **rolling-week (NEW)**: `days` days from today — an agenda strip |
| day | single day | rolling n/a (ignored) |

**Rolling-week is an agenda strip**, decided deliberately: N days starting today,
today always in column 1, column headers become per-day dates (not fixed
weekday names). It is *not* a weekday grid — rolling by days breaks fixed Mon–Sun
columns. Month-rolling is unchanged (still a weekday grid anchored to the week
boundary).

## Data model

The calendar region object gains an optional `view` block:

```js
{ id: "region-1", kind: "calendar", instanceIds: [], size: 70,
  view: { mode: "month" | "week" | "day",
          rolling: false,
          weeks: 4,     // month-rolling count (range 1–12)
          days: 7 } }   // rolling-week count (range 1–14)
```

- `normalizeDashboardScreens` (`frontend/src/utils/layout.js`) backfills
  `view: { mode: "month", rolling: false, weeks: 4, days: 7 }` when absent, so
  existing regions render exactly as today with no DB migration.
- The global `calendarViewMode` and `calendarWeeks` settings are **removed**
  (config store, `configRegistry.js`, `useConfigForm.js`, backend `config.py`).
  Single source of truth is the region. DB reset is acceptable (dev); the
  normalizer also handles any stragglers. The legacy 4-value `rolling` is not
  migrated — it simply no longer exists as a base mode.

## Components & data flow

### CalendarView (`frontend/src/components/CalendarView.vue`)

- Add an explicit `view` prop (the region's `view` block). `DashboardRegion`
  passes `:view="region.view"` alongside the existing `:source-ids`; fullscreen
  passes `modeStore.fullscreenContext.view`. Replace
  `viewMode = computed(() => configStore.calendarViewMode)` with
  `viewMode = computed(() => props.view?.mode ?? "month")`; likewise
  `rolling`, `weeks`, `days` (counts clamped).
- `calendarDays`: keep month / week / day / month-rolling branches; add a
  **rolling-week** branch — `days` days starting today, today first, never
  "other-month".
- **Headers**: the weekday-header row becomes dynamic for rolling-week only —
  per-day date headers instead of fixed weekday names. Month / week / month-
  rolling keep fixed weekday columns.
- `loadEvents` date range for rolling-week: `today ‥ today + days - 1`.
- `currentMonthYear`, `isCurrentPeriod`, navigation key off the effective
  `(mode, rolling)` instead of the old 4-value field.

### On-calendar controls (calendar header)

- **View-switch button** (existing `Month ▸`): cycles *this region's*
  `view.mode` (month → week → day) and persists to the region in the dashboard
  layout — no longer mutates a global field. Rolling stays out of the cycle.
- **Gear (⚙) popover** (new, next to the view-switch): compact windowing
  controls for the focused region —
  - "Rolling window" toggle → `view.rolling`
  - count stepper → `view.weeks` (label "Weeks") when base=month,
    `view.days` (label "Days") when base=week
  - hidden when base=day (rolling n/a)
- Both act on the region that owns this calendar → inherently per-region /
  per-page. **No view controls in the region editor** (keeps it lean; sidesteps
  the calvin-3v4 cramping) and **no global "Calendar display" settings section**.

### Keyboard (`frontend/src/composables/useKeyboardActions.js`)

The view-cycle shortcut targets the **focused region** and persists its
`view.mode`, mirroring the button.

### Fullscreen (`frontend/src/views/Dashboard.vue`)

Fullscreen calendar carries the region's `view` via `fullscreenContext` (same
pattern as `sourceIds` today), so a fullscreened calendar keeps its own view.

### Persistence

Region `view` lives inside `dashboardScreens` / `dashboardLayout` config. Mutations
(view-switch, gear popover, keyboard) update that structure and persist via the
existing config-update path. A single helper updates a region's `view` by region
id on the active screen, reused by button/gear/keyboard.

## Error handling / edge cases

- Missing/partial `view` → normalizer fills defaults; `CalendarView` also
  defensively defaults (`?? "month"`, counts clamped).
- Counts clamped: `weeks` 1–12, `days` 1–14.
- base=day + rolling=true → rolling ignored in render; gear hides the toggle so
  it can't be set in that state.
- Non-calendar regions have no `view` block; unaffected.

## Testing

- `utils/layout.js`: normalizer backfills `view` defaults; preserves an explicit
  `view`; clamps counts.
- `CalendarView`: effective view resolution from `props.view`; rolling-week day
  generation (starts today, N days, today first); dynamic per-day headers for
  rolling-week vs fixed weekday headers otherwise; month-rolling unchanged.
- Region view mutation helper: cycles mode / sets rolling+count on the correct
  region of the active screen; persists.
- Update existing calendar specs that assumed the global 4-value field.

## Out of scope

- Region-editor UI for view (deliberately omitted — controls live on the calendar).
- Any change to month-rolling behavior (identical to today).
- The overlap-cache fix (already handled separately in
  `plugin_calendar_service`).
