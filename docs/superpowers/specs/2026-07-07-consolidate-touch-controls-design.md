# Consolidate region controls onto the header rail + pointer-gated controls (calvin-ohq)

**Date:** 2026-07-07
**Issue:** calvin-ohq — Remove legacy `RegionControls` floating cluster
**Branch (in progress):** `fix/touch-detection-maxtouchpoints` (sibling to calvin-c37 / PR #86)

## Problem

`RegionControls.vue` (`‹ prev / › next / ↻ refresh / ⤢ fullscreen`) is a pre-#83
control set that renders in each region's focused `#actions` header slot whenever
`isTouch` is true. PR #83 moved region controls onto the header rail but never
removed this cluster, so on a focused region on a touch device a **second,
redundant set of controls** appears. The touch-detection fix (calvin-c37, PR #86)
makes this show on Auto once a touchscreen is detected.

Two deeper issues surfaced while scoping this:

1. **Wrong capability axis.** The controls are gated on `isTouch`, but the real
   distinction is **pointer present (mouse *or* touch) → show click controls**
   vs **keyboard-only kiosk → keyboard drives everything, no click controls**. A
   mouse-only desktop has `isTouch=false` today, so it wrongly gets *no* click
   controls even though a mouse can use them.
2. **Calendar shows its control row unconditionally.** `.calendar-header` (nav +
   view-switch + fullscreen) is always visible regardless of focus, unlike
   service/photos whose rails are focus-gated. Only the month/year **label** is
   genuinely always-needed context.

## Goal

The header rail is the **single** control set — shown when a pointing device
exists and the region is selected — without losing any per-region function.
Delete `RegionControls.vue`.

## Decisions (confirmed with user)

1. **Capability axis → new `hasPointer` (mouse or touch).** Add a sibling
   capability to `useTouchCapability`: `hasPointer` = mouse-or-touch present,
   honoring the same `touchControls` `on`/`off`/`auto` override. Region
   **click-controls** (nav / fullscreen / refresh) gate on `hasPointer && focused`.
   `isTouch` is unchanged and still gates touch-*only* chrome (screen dots,
   fullscreen-close button). Result: mouse desktop **and** touch show controls;
   keyboard-only kiosk shows none.
2. **Calendar refresh** → a **"Refresh now"** action in the calendar **tune
   dropdown** (`CalendarViewOptions`), not a standalone header button. Calendar
   already auto-refreshes on an interval + on `visibilitychange`.
3. **Calendar header split** → the **month/year label stays always-visible**
   (important "what am I looking at" info); everything else in the header row
   (Today, `‹ ›`, Month/Week/Day view-switch, tune, `⤢`) hides unless
   `focused && hasPointer`. This makes calendar consistent with service/photos.
4. **Consistency** → all three regions' click-controls follow one rule:
   `focused && hasPointer`. (Service nav, currently shown unfocused on desktop,
   becomes focus-gated like the rest.)

## Design

### New capability: `hasPointer`

Extend `useTouchCapability()` to also return `hasPointer` (keep the existing
`isTouch` export and behavior intact):

- Add a reactive `fine` signal from `matchMedia("(any-pointer: fine)")` with the
  same add/removeEventListener lifecycle already used for the coarse query.
- `hasPointer` computed:
  - `touchControls: 'on'`  → `true`
  - `touchControls: 'off'` → `false`
  - `'auto'` → `fine.value || coarse.value` (coarse already ORs
    `navigator.maxTouchPoints > 0`).
- Return `{ isTouch, hasPointer }` (both `readonly`).

Rationale: reusing the `touchControls` override keeps one kiosk knob — `off`
forces a clean keyboard-only display even if a mouse is attached, `on` forces
controls. (Semantic note: the config name now governs pointer controls too; a
future rename to `pointerControls` is out of scope.)

### Gating rule (unified)

Region click-controls render when `hasPointer && focused`. All use
`IconButton size="custom"` so they inherit `--icon-size` / `--icon-font`
(regionChromeVars, driven by "Dashboard size") — no fullscreen-header regression
(fullscreen sets `header-visible=false`, so no rail renders there).

### Calendar (`CalendarView.vue` + `CalendarViewOptions.vue`)

- Remove `<RegionControls>` from the `#actions` slot and its import; drop the now
  empty `<template #actions>` block.
- Split `.calendar-header`:
  - `.calendar-header__label` (currentMonthYear) — **always visible**, unchanged.
  - `.calendar-header__controls` (Today, `‹`, view-switch, `›`, `CalendarViewOptions`,
    `⤢`) — wrap so it renders only `v-if="focused && hasPointer"`.
- Import `hasPointer` from `useTouchCapability` in `CalendarView.vue`.
- `CalendarViewOptions`: add a **"Refresh now"** row calling
  `calendarStore.refreshEvents()` directly (global refresh; same effect as the
  keyboard `calendar_refresh`, no active-region guard needed). Import
  `useCalendarStore` there.
  - The tune dropdown lives inside `.calendar-header__controls`, so on a
    keyboard-only kiosk (no `hasPointer`) it's hidden and refresh is
    keyboard/auto only — acceptable.

### Service (`WebServiceViewer.vue` + `ServiceRegionViewOptions.vue`)

- Remove both `<RegionControls>` instances (empty-state panel + ServiceViewer
  actions) and the import.
- Re-gate the header nav/fullscreen from `!isTouch` to `focused && hasPointer`:
  - `‹` `›`: `v-if="focused && hasPointer && canNavigateServices && services.length > 1"`
  - `⤢`: `v-if="focused && hasPointer && !isFullscreen"`
  - (Adds `focused` so unfocused service regions no longer show nav — matches the
    "hidden unless selected" rule.)
- Swap the `useTouchCapability` import to pull `hasPointer` (drop `isTouch` if it
  becomes unused in this file — the fullscreen-close is `v-if="isFullscreen"`,
  not touch-gated).
- `ServiceRegionViewOptions`: add a **"Refresh now"** row calling
  `webServicesStore.refreshCurrentService()` directly. Import `useWebServicesStore`.

**Open point — iframe services:** the service tune dropdown shows
`v-if="focused && isLinkCapable"` (card-grid / item-list only), so **iframe
services get no "Refresh now"**. `service_refresh` = `refreshCurrentService()`
refetches service *metadata*, not iframe content, so an embedded live URL gains
little; navigating away/back reloads the iframe. **Recommendation:** accept the
gap. Alternative: a standalone `↻` `IconButton` in the service rail
(`focused && hasPointer`) wired to `service_refresh` — flag at review.

### Photos (`PhotoSlideshow.vue`)

- Remove `<RegionControls>` and its import.
- Add `‹ › ⤢` `IconButton`s to the `#actions` slot, rendered
  `v-if="focused && hasPointer"`, wired via the already-imported `handleAction`
  to `images_prev`, `images_next`, `photos_enter_fullscreen`. Keep `size="custom"`.
- Pull `hasPointer` from `useTouchCapability`; keep `isTouch` for the touch-only
  fullscreen-close (`v-if="isFullscreen && isTouch"`).
- No refresh (photos never had one).

### Removal + tests

- Delete `frontend/src/components/dashboard/RegionControls.vue`.
- Delete `frontend/tests/unit/components/dashboard/RegionControls.spec.js`.
- Update `frontend/tests/unit/components/regionFocusForwarding.spec.js`: it asserts
  `.region-controls` renders when focused. Rewrite to assert the new photos nav —
  a nav button present when `focused && hasPointer`, absent when not focused, and
  absent when `hasPointer=false`. Update the `useTouchCapability` mock to return
  `{ isTouch, hasPointer }`.
- Extend/add unit coverage (all mocks now return `{ isTouch, hasPointer }`):
  - `useTouchCapability`: `hasPointer` true on fine pointer, true on coarse/touch,
    false when neither; `on`/`off` override forces both.
  - Calendar: label renders unfocused; controls row hidden unless
    `focused && hasPointer`; no duplicate cluster; `CalendarViewOptions`
    "Refresh now" calls `refreshEvents()`.
  - Service: `‹ › ⤢` render on `focused && hasPointer`, hidden otherwise;
    `ServiceRegionViewOptions` "Refresh now" calls `refreshCurrentService()`.
  - Photos: nav renders on `focused && hasPointer`, hidden otherwise.

### Live verification (acceptance)

Docker dev stack via Playwright:

- **Touch** (`touchControls=on`), focused: no floating `‹ › ↻ ⤢` cluster; only the
  header rail. Calendar single control row; service nav+fullscreen+refresh(tune);
  photos `‹ › ⤢`. Can navigate / fullscreen / scroll (card-grid) by touch.
- **Mouse** desktop (`auto`): focused region shows the same click-controls
  (hasPointer via `any-pointer: fine`).
- **Keyboard-only** (`touchControls=off`): no click-controls anywhere; calendar
  shows only its label; keyboard actions still navigate/refresh/fullscreen.
- Calendar month/year label visible in all cases (even unfocused / keyboard-only).
- Controls scale with Dashboard size; no fullscreen-header regression.

## Out of scope

- Keyboard bindings / `useKeyboardActions` wiring (all mapped actions stay
  reachable by keyboard and by the rail buttons).
- Fullscreen close/overlay controls.
- Touch detection itself (calvin-c37 / PR #86).
- Renaming the `touchControls` config.

## Files

| Action | File |
|---|---|
| Edit | `frontend/src/composables/useTouchCapability.js` (add `hasPointer`) |
| Delete | `frontend/src/components/dashboard/RegionControls.vue` |
| Delete | `frontend/tests/unit/components/dashboard/RegionControls.spec.js` |
| Edit | `frontend/src/components/CalendarView.vue` |
| Edit | `frontend/src/components/dashboard/CalendarViewOptions.vue` |
| Edit | `frontend/src/components/WebServiceViewer.vue` |
| Edit | `frontend/src/components/dashboard/ServiceRegionViewOptions.vue` |
| Edit | `frontend/src/components/PhotoSlideshow.vue` |
| Edit | `frontend/tests/unit/components/regionFocusForwarding.spec.js` |
| Add/Edit | `useTouchCapability` unit test (`hasPointer` coverage) |
