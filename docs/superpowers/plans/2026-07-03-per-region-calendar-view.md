# Per-region Calendar View + Rolling Modifier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make calendar base view (month/week/day) and a rolling-window modifier a per-region setting, add a "rolling-week" agenda strip, and expose it via on-calendar controls — removing the global 4-value `calendarViewMode`.

**Architecture:** Each calendar region carries a `view` block `{ mode, rolling, weeks, days }` inside `dashboardScreens`. `CalendarView` reads it from a prop instead of global config. Mutations go through a `setRegionView` layout helper + `updateRegionView` store action. On-calendar header controls (view-switch button + a gear popover) and the keyboard shortcut drive those mutations.

**Tech Stack:** Vue 3 Composition API, Pinia, Vitest; FastAPI/pydantic backend (config normalization only).

## Global Constraints

- Frontend tests: `npx vitest run <path>` from `frontend/`. Lint: `npx eslint <path>`.
- Rolling-week = agenda strip: N days from **today**, today in column 1, per-day date headers. Month-rolling unchanged (weekday grid, week-boundary anchored).
- Counts: `weeks` clamped 1–12, `days` clamped 1–14. Default view `{ mode: "month", rolling: false, weeks: 4, days: 7 }`.
- `base=day` + rolling → rolling ignored in render; gear hides the rolling controls.
- No view controls in the region editor; no global "Calendar display" settings section.
- Never touch `develop`/`main` directly — work on `feat/rolling-window-modifier`.

---

## File structure

- `frontend/src/utils/layout.js` — add `DEFAULT_CALENDAR_VIEW`, `clampCalendarView`, extend `normalizeDashboardScreens` to backfill `view` on calendar regions, add `setRegionView(screens, regionId, patch)`.
- `frontend/src/stores/config.js` — add `updateRegionView` action; remove `calendarViewMode`/`calendarWeeks` state, `setCalendarViewMode`, `cycleCalendarViewMode`.
- `frontend/src/components/CalendarView.vue` — accept `view`/`regionId` props; derive `viewMode`/`rolling`/`weeks`/`days`; rolling-week `calendarDays` branch; dynamic `weekdayHeaders`; `cycleView` → `updateRegionView`; header gear button.
- `frontend/src/components/dashboard/CalendarViewGear.vue` — NEW popover: rolling toggle + count stepper.
- `frontend/src/components/DashboardRegion.vue` — pass `:view` + `:region-id` to `CalendarView` (split + non-split calendar branches).
- `frontend/src/views/Dashboard.vue` — fullscreen carries `region.view` via `fullscreenContext`; pass `:view` to fullscreen `CalendarView`.
- `frontend/src/composables/useKeyboardActions.js` — view-cycle targets the focused region via `updateRegionView`.
- `frontend/src/stores/configRegistry.js`, `frontend/src/composables/useConfigForm.js`, `backend/app/api/routes/config.py` — remove `calendarViewMode`/`calendarWeeks`.
- `frontend/src/components/settings/categories/ContentSettings.vue` — remove the global calendar-display view/weeks controls.
- Tests: `frontend/tests/unit/utils/layout.spec.js`, `frontend/tests/unit/components/CalendarView*.spec.js`, `frontend/tests/unit/stores/config*.spec.js`.

---

## Task 1: Region `view` data model + normalizer

**Files:**
- Modify: `frontend/src/utils/layout.js`
- Test: `frontend/tests/unit/utils/layout.spec.js`

**Interfaces:**
- Produces: `DEFAULT_CALENDAR_VIEW = { mode: "month", rolling: false, weeks: 4, days: 7 }`; `clampCalendarView(view) -> view` (mode∈{month,week,day} else "month"; rolling→Boolean; weeks clamp 1–12; days clamp 1–14); `normalizeDashboardScreens` backfills `region.view` (merged with defaults + clamped) for every `kind: "calendar"` region, including nested `split.regions`.

- [ ] **Step 1: Write failing tests**

```js
// frontend/tests/unit/utils/layout.spec.js  (add to existing or create)
import { describe, it, expect } from "vitest";
import { normalizeDashboardScreens, clampCalendarView, DEFAULT_CALENDAR_VIEW } from "@/utils/layout";

describe("calendar region view normalization", () => {
  it("backfills default view on a calendar region with none", () => {
    const screens = normalizeDashboardScreens({
      screens: [{ id: "s1", regions: [{ id: "r1", kind: "calendar", instanceIds: [], size: 100 }] }],
    });
    expect(screens.screens[0].regions[0].view).toEqual(DEFAULT_CALENDAR_VIEW);
  });

  it("preserves and clamps an explicit view", () => {
    const screens = normalizeDashboardScreens({
      screens: [{ id: "s1", regions: [
        { id: "r1", kind: "calendar", instanceIds: [], size: 100,
          view: { mode: "week", rolling: true, weeks: 99, days: 99 } }] }],
    });
    expect(screens.screens[0].regions[0].view).toEqual({ mode: "week", rolling: true, weeks: 12, days: 14 });
  });

  it("does not add view to non-calendar regions", () => {
    const screens = normalizeDashboardScreens({
      screens: [{ id: "s1", regions: [{ id: "r1", kind: "photos", instanceIds: [], size: 100 }] }],
    });
    expect(screens.screens[0].regions[0].view).toBeUndefined();
  });

  it("clampCalendarView coerces bad values", () => {
    expect(clampCalendarView({ mode: "bogus", rolling: 1, weeks: 0, days: 50 }))
      .toEqual({ mode: "month", rolling: true, weeks: 1, days: 14 });
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `cd frontend && npx vitest run tests/unit/utils/layout.spec.js` → FAIL (exports missing / view undefined).

- [ ] **Step 3: Implement in `layout.js`**

```js
export const DEFAULT_CALENDAR_VIEW = Object.freeze({ mode: "month", rolling: false, weeks: 4, days: 7 });

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

export function clampCalendarView(view = {}) {
  const mode = ["month", "week", "day"].includes(view.mode) ? view.mode : "month";
  return {
    mode,
    rolling: view.rolling === true || view.rolling === "true" || view.rolling === 1,
    weeks: clampInt(view.weeks, 1, 12, DEFAULT_CALENDAR_VIEW.weeks),
    days: clampInt(view.days, 1, 14, DEFAULT_CALENDAR_VIEW.days),
  };
}
```

Then, in `normalizeDashboardScreens`, wherever regions are normalized (including `split.regions` recursion), set for calendar regions:
`region.view = clampCalendarView({ ...DEFAULT_CALENDAR_VIEW, ...(region.view || {}) })`.

- [ ] **Step 4: Run to verify PASS** — same command → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/utils/layout.js frontend/tests/unit/utils/layout.spec.js && git commit -m "feat(calendar): per-region view model + normalizer backfill (calvin-0t3)"`

---

## Task 2: `setRegionView` layout helper + `updateRegionView` store action

**Files:**
- Modify: `frontend/src/utils/layout.js`, `frontend/src/stores/config.js`
- Test: `frontend/tests/unit/utils/layout.spec.js`

**Interfaces:**
- Produces: `setRegionView(screens, regionId, patch) -> screens` — deep-clones, finds the region by id on the **active** screen (searching nested `split.regions`), merges+clamps `view`, returns new screens (no mutation of input). Store: `updateRegionView(regionId, patch)` — `const next = setRegionView(dashboardScreens.value, regionId, patch); dashboardScreens.value = next; await updateConfig({ dashboardScreens: next })`.

- [ ] **Step 1: Write failing test**

```js
import { setRegionView } from "@/utils/layout";
it("setRegionView merges+clamps a region's view on the active screen", () => {
  const screens = normalizeDashboardScreens({
    activeScreenId: "s1",
    screens: [{ id: "s1", regions: [{ id: "r1", kind: "calendar", instanceIds: [], size: 100 }] }],
  });
  const next = setRegionView(screens, "r1", { mode: "week", rolling: true });
  expect(next.screens[0].regions[0].view).toEqual({ mode: "week", rolling: true, weeks: 4, days: 7 });
  // input not mutated
  expect(screens.screens[0].regions[0].view.mode).toBe("month");
});
```

- [ ] **Step 2: Run → FAIL** (`setRegionView` undefined).
- [ ] **Step 3: Implement** `setRegionView` in `layout.js`:

```js
export function setRegionView(screens, regionId, patch) {
  const next = structuredClone(screens);
  const active = next.screens.find(s => s.id === next.activeScreenId) || next.screens[0];
  if (!active) return next;
  const visit = regions => {
    for (const r of regions || []) {
      if (r.id === regionId && r.kind === "calendar") {
        r.view = clampCalendarView({ ...DEFAULT_CALENDAR_VIEW, ...(r.view || {}), ...patch });
        return true;
      }
      if (r.split && visit(r.split.regions)) return true;
    }
    return false;
  };
  visit(active.regions);
  return next;
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Add store action** in `config.js` (near the other `dashboardScreens` mutators ~line 366–380):

```js
const updateRegionView = async (regionId, patch) => {
  const next = setRegionView(dashboardScreens.value, regionId, patch);
  dashboardScreens.value = next;
  await updateConfig({ dashboardScreens: next });
};
```
Import `setRegionView` from `../utils/layout`; add `updateRegionView` to the store's return object.

- [ ] **Step 6: Commit** — `git commit -am "feat(calendar): setRegionView helper + updateRegionView store action (calvin-0t3)"`

---

## Task 3: CalendarView reads `view` from props (remove global reads)

**Files:**
- Modify: `frontend/src/components/CalendarView.vue`, `frontend/src/components/DashboardRegion.vue`
- Test: `frontend/tests/unit/components/CalendarViewMode.spec.js` (new)

**Interfaces:**
- Consumes: region `view` block (Task 1).
- Produces: `CalendarView` props `view: Object|null`, `regionId: String|null`. `viewMode = computed(() => props.view?.mode ?? "month")`, `rolling = computed(() => props.view?.rolling === true)`, `rollingWeeks = computed(() => clampInt(props.view?.weeks,1,12,4))`, `rollingDays = computed(() => clampInt(props.view?.days,1,14,7))`. `DashboardRegion` passes `:view="region.view"` and `:region-id="region.id"` (and `:view="sub.view"` / `:region-id="sub.id"` in the split branch).

- [ ] **Step 1: Write failing test** — mount `CalendarView` with `props.view = { mode: "week", rolling: false }`, assert the header view label reads "Week" (currently it reads global config → "Month").

```js
// frontend/tests/unit/components/CalendarViewMode.spec.js
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CalendarView from "@/components/CalendarView.vue";
beforeEach(() => setActivePinia(createPinia()));
it("derives view mode from the view prop, not global config", () => {
  const wrapper = mount(CalendarView, { props: { view: { mode: "week", rolling: false }, regionId: "r1" } });
  expect(wrapper.find(".calendar-header__view-label").text()).toBe("Week");
});
```
(If mount needs stubs for async children, stub `DashboardPanel`/`RegionControls`.)

- [ ] **Step 2: Run → FAIL** (label reads global default "Month").
- [ ] **Step 3: Implement** — add props; replace `viewMode`/`rollingWeeks` computed to read `props.view`; add `rolling`/`rollingDays`. Keep `viewModeLabel` map. In `DashboardRegion.vue` add `:view` + `:region-id` to both calendar `CalendarView` usages.
- [ ] **Step 4: Run → PASS.** Also run existing calendar specs; update any that set `configStore.calendarViewMode` to pass `view` prop instead.
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): CalendarView reads view from region prop (calvin-0t3)"`

---

## Task 4: Rolling-week agenda-strip render

**Files:**
- Modify: `frontend/src/components/CalendarView.vue`
- Test: `frontend/tests/unit/components/CalendarViewRollingWeek.spec.js` (new)

**Interfaces:**
- Produces: when `viewMode==="week" && rolling`, `calendarDays` = `rollingDays` entries starting **today** (today first, `otherMonth:false`); `weekdayHeaders` computed returns per-day labels (e.g. `Wed 2`) for rolling-week, fixed weekday names otherwise; `loadEvents` range = today‥today+days-1.

- [ ] **Step 1: Write failing tests** — with a fixed "today", assert (a) `calendarDays` first entry is today and length === `days`; (b) header row shows per-day date labels, today first. Prefer testing the exposed computeds via a thin harness or `wrapper.vm`. Example:

```js
it("rolling-week starts today and spans `days` days", () => {
  const wrapper = mount(CalendarView, { props: { view: { mode: "week", rolling: true, days: 5 }, regionId: "r1" } });
  const days = wrapper.vm.calendarDays;
  expect(days).toHaveLength(5);
  const t = new Date(); t.setHours(0,0,0,0);
  expect(new Date(days[0].date).toDateString()).toBe(t.toDateString());
});
```

- [ ] **Step 2: Run → FAIL** (falls through to week/other branch).
- [ ] **Step 3: Implement** the rolling-week branch in `calendarDays` (mirror the day/rolling branches; start at `today`, loop `rollingDays`), a `weekdayHeaders` computed that the template renders instead of the hardcoded weekday row when rolling-week, and the `loadEvents` date range. Add a `rolling-week` class hook to the grid for column sizing if needed.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): rolling-week agenda strip render (calvin-0t3)"`

---

## Task 5: View-switch button cycles the region

**Files:**
- Modify: `frontend/src/components/CalendarView.vue`
- Test: `frontend/tests/unit/components/CalendarViewMode.spec.js`

**Interfaces:**
- Consumes: `updateRegionView` (Task 2), `props.regionId`.
- Produces: `cycleView()` → `configStore.updateRegionView(props.regionId, { mode: next })` cycling month→week→day.

- [ ] **Step 1: Write failing test** — mock the store's `updateRegionView`; click `.calendar-header__view-switch`; assert called with `("r1", { mode: "week" })` when starting from month.
- [ ] **Step 2: Run → FAIL** (still calls removed `cycleCalendarViewMode`).
- [ ] **Step 3: Implement** new `cycleView`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): view-switch cycles the region's base mode (calvin-0t3)"`

---

## Task 6: Gear popover — rolling toggle + count

**Files:**
- Create: `frontend/src/components/dashboard/CalendarViewGear.vue`
- Modify: `frontend/src/components/CalendarView.vue` (add gear button in header controls)
- Test: `frontend/tests/unit/components/CalendarViewGear.spec.js` (new)

**Interfaces:**
- Consumes: `updateRegionView`, `props: { regionId, view }`.
- Produces: a gear button that toggles a popover; popover shows a "Rolling window" toggle (→ `updateRegionView(regionId,{rolling})`) and a count stepper labelled "Weeks" (base=month) / "Days" (base=week), bound to `view.weeks`/`view.days` with clamps; renders nothing/no rolling controls when `view.mode==="day"`.

- [ ] **Step 1: Write failing tests** — mount with `view={mode:"month",rolling:false,weeks:4}`; toggling rolling calls `updateRegionView("r1",{rolling:true})`; count label is "Weeks"; with `mode:"week"` label is "Days"; with `mode:"day"` the rolling controls are absent.
- [ ] **Step 2: Run → FAIL** (component missing).
- [ ] **Step 3: Implement** `CalendarViewGear.vue` (use `calvin-plugin-*`/shell primitives + existing popover pattern; a ⚙ button + a small floating panel). Add it to the header controls next to the view-switch, passing `:region-id` and `:view`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): gear popover for rolling window + count (calvin-0t3)"`

---

## Task 7: Keyboard view-cycle targets the focused region

**Files:**
- Modify: `frontend/src/composables/useKeyboardActions.js`
- Test: `frontend/tests/unit/composables/useKeyboardActions.*` (extend existing if present, else new)

**Interfaces:**
- Consumes: `updateRegionView`, active screen's `activeRegionId` (from `dashboardScreens`).
- Produces: the calendar view-cycle action reads the focused region's current `view.mode` and calls `updateRegionView(activeRegionId, { mode: next })`. Remove the `calendarViewMode`/`setCalendarViewMode` fallback branch.

- [ ] **Step 1: Write failing test** — with a stubbed store (active region "r1", its view.mode "month"), invoke the view-cycle action; assert `updateRegionView("r1", { mode: "week" })`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — resolve `activeRegionId` from the active screen; look up its region's `view.mode`; cycle; call `updateRegionView`. Delete references to `configStore.calendarViewMode` / `cycleCalendarViewMode` / `setCalendarViewMode` here (lines ~113–130, 468/509/547 read `calendarViewMode` — switch those to the focused region's `view.mode`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): keyboard view-cycle targets focused region (calvin-0t3)"`

---

## Task 8: Fullscreen carries the region's view

**Files:**
- Modify: `frontend/src/views/Dashboard.vue`, `frontend/src/stores/mode.js` (if `fullscreenContext` shape is defined there), `frontend/src/components/DashboardRegion.vue` (where fullscreen is triggered, to include `view`)
- Test: extend a Dashboard/mode spec if present; otherwise a focused unit test on the context shape.

**Interfaces:**
- Consumes: region `view`.
- Produces: `fullscreenContext.view` set when entering calendar fullscreen; `Dashboard.vue` passes `:view="modeStore.fullscreenContext?.view"` to the fullscreen `CalendarView`.

- [ ] **Step 1: Write failing test** — entering calendar fullscreen from region "r1" (view week) yields `fullscreenContext.view.mode === "week"`; the fullscreen CalendarView receives it. (Match the existing fullscreen-context test pattern from commit 8fb8012.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — include `view` alongside `sourceIds` when building `fullscreenContext`; pass `:view` in `Dashboard.vue` line ~34–38.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(calendar): fullscreen carries the region's view (calvin-0t3)"`

---

## Task 9: Remove global calendar view config + global settings UI

**Files:**
- Modify: `frontend/src/stores/config.js`, `frontend/src/stores/configRegistry.js`, `frontend/src/composables/useConfigForm.js`, `backend/app/api/routes/config.py`, `frontend/src/components/settings/categories/ContentSettings.vue`
- Test: update `frontend/tests/unit/stores/config*.spec.js`, `backend/tests/integration/test_api_config.py`

**Interfaces:** Removes `calendarViewMode`, `calendarWeeks` everywhere; the region editor/ContentSettings no longer expose a global calendar view/weeks control.

- [ ] **Step 1:** Grep to confirm all readers migrated: `rg -n "calendarViewMode|calendar_view_mode|calendarWeeks|calendar_weeks|cycleCalendarViewMode|setCalendarViewMode" frontend backend` — every remaining hit must be a definition to delete or a test to update.
- [ ] **Step 2: Update tests first** — remove/rewrite assertions referencing the global keys (config store spec, `test_api_config.py` expected-keys set). Run them → they should now FAIL against the still-present code.
- [ ] **Step 3: Remove** the state/refs/registry entries/`useConfigForm` lines/`config.py` normalization + `clock_key_map`-style mapping for the two keys, and the ContentSettings global calendar-display block.
- [ ] **Step 4: Run** the updated suites → PASS. Full `frontend` vitest + backend `pytest tests/unit tests/integration/test_api_config.py`.
- [ ] **Step 5: Commit** — `git commit -am "refactor(calendar): remove global calendarViewMode/calendarWeeks (calvin-0t3)"`

---

## Task 10: Full verification + lint

- [ ] Full suites: `cd frontend && npx vitest run` (all green); `cd backend && uv run pytest tests/unit tests/integration/test_api_config.py -q`.
- [ ] Lint: `npx eslint` on every changed frontend file; `ruff check` on `config.py`.
- [ ] In-app (Playwright, dev stack): a calendar region set to Week+rolling renders the agenda strip (today first); the gear toggles rolling; two regions/screens show different views; fullscreen keeps the region's view.
- [ ] Commit any lint fixups. Push branch; open PR against `develop` (do not merge).

---

## Self-review notes

- **Spec coverage:** per-region `view` (T1–3), drop global (T9), rolling-week strip (T4), on-calendar controls (T5–6), keyboard focus-region (T7), fullscreen (T8), tests throughout. ✓
- **Type consistency:** `view = { mode, rolling, weeks, days }`; helper `setRegionView(screens, regionId, patch)`; store `updateRegionView(regionId, patch)`; CalendarView props `view` + `regionId` — used consistently across tasks. ✓
- **Open impl detail:** exact `weekdayHeaders` template wiring and the day/rolling class hooks are resolved during T4 against the live template; the header currently hardcodes weekday names — T4 replaces that row with the computed for rolling-week only.
