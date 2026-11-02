# Dashboard Region-Chrome Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `touchControlSize` setting one coherent 5-step scale that sizes all dashboard region chrome — labels, every header control, and the floating cluster — as one unit.

**Architecture:** A single JS scale module emits CSS custom properties; `Dashboard.vue` applies them once as an inline `:style` on the dashboard root (inline beats the class cascade, avoiding a specificity trap). Every region-chrome consumer reads those vars. The floating `RegionControls` cluster stops setting its own sizing and inherits.

**Tech Stack:** Vue 3 Composition API, Vite, Vitest + @vue/test-utils, Playwright (visual verify).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-dashboard-region-chrome-scale-design.md`. Bead: calvin-6ig.
- Presets (keys, verbatim): `xsmall`, `small`, `medium`, `large`, `xlarge`. Default `medium`. Existing `small/medium/large` stay valid — no config migration.
- Medium ≈ today for labels' anchor; **header glyph buttons intentionally grow** from 28px to the rail height (42px medium).
- Clock bar is OUT of scope. Do not touch `ClockBar*`.
- Keep the already-committed themed scrollbars (`base.css`) and unlock-banner clip fix (`.dashboard-view--unlocked`) on this branch — do NOT remove them.
- Token names: `--region-rail-h`, `--region-label-fs`, `--region-sublabel-fs`, `--region-glyph-fs`, `--region-content-fs` (phase-2 reserve), plus `--icon-size`/`--icon-font` (IconButton `size="custom"` compat).
- No backend change: `touch_control_size` is not enum-validated server-side (verified).
- Dev server runs at `http://localhost:5175` (Calvin). `:5173` is a different app — do not use it.
- Run gates from `frontend/`: `npm run lint`, `npx prettier --check "src/**/*.{js,jsx,vue,json,css}"`, `npx vitest run`, `npm run build`. Do NOT `pkill -f vitest` (it kills your own run). Shell is fish: use `$status`, not `$?`.

---

### Task 1: Scale module `regionChromeScale.js`

**Files:**
- Create: `frontend/src/styles/regionChromeScale.js`
- Test: `frontend/tests/unit/styles/regionChromeScale.spec.js`

**Interfaces:**
- Produces: `REGION_CHROME_SCALE` (object), `REGION_CHROME_SIZES` (string[] in UI order), `DEFAULT_REGION_CHROME_SIZE` (`"medium"`), `regionChromeVars(size: string) => Record<string,string>` returning the CSS custom properties, falling back to medium for unknown input.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/styles/regionChromeScale.spec.js
import { describe, it, expect } from "vitest";
import {
  REGION_CHROME_SCALE,
  REGION_CHROME_SIZES,
  DEFAULT_REGION_CHROME_SIZE,
  regionChromeVars,
} from "@/styles/regionChromeScale";

describe("regionChromeScale", () => {
  it("exposes the five presets in UI order", () => {
    expect(REGION_CHROME_SIZES).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_REGION_CHROME_SIZE).toBe("medium");
  });

  it("medium is the anchor (42px rail / 1.25rem label / 1.05rem glyph)", () => {
    const v = regionChromeVars("medium");
    expect(v["--region-rail-h"]).toBe("42px");
    expect(v["--region-label-fs"]).toBe("1.25rem");
    expect(v["--region-glyph-fs"]).toBe("1.05rem");
    // IconButton size="custom" compat mirrors rail + glyph
    expect(v["--icon-size"]).toBe("42px");
    expect(v["--icon-font"]).toBe("1.05rem");
    // phase-2 reserve is present
    expect(v["--region-content-fs"]).toBe("1.0rem");
  });

  it("scales the extremes", () => {
    expect(regionChromeVars("xsmall")["--region-rail-h"]).toBe("30px");
    expect(regionChromeVars("xlarge")["--region-rail-h"]).toBe("58px");
  });

  it("falls back to medium for unknown/undefined input", () => {
    expect(regionChromeVars("bogus")).toEqual(regionChromeVars("medium"));
    expect(regionChromeVars(undefined)).toEqual(regionChromeVars("medium"));
  });

  it("every preset defines every var key", () => {
    const keys = Object.keys(regionChromeVars("medium"));
    for (const size of REGION_CHROME_SIZES) {
      expect(Object.keys(regionChromeVars(size))).toEqual(keys);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx vitest run tests/unit/styles/regionChromeScale.spec.js`
Expected: FAIL — cannot resolve `@/styles/regionChromeScale`.

- [ ] **Step 3: Write the module**

```js
// frontend/src/styles/regionChromeScale.js
// Single source of truth for the dashboard "Touch target size" scale. Drives all
// region chrome (labels, header controls, floating cluster). See
// docs/superpowers/specs/2026-07-06-dashboard-region-chrome-scale-design.md.
export const REGION_CHROME_SCALE = {
  xsmall: { rail: "30px", label: "1.0rem",  sublabel: "0.7rem",  glyph: "0.85rem", content: "0.85rem" },
  small:  { rail: "36px", label: "1.1rem",  sublabel: "0.75rem", glyph: "0.95rem", content: "0.92rem" },
  medium: { rail: "42px", label: "1.25rem", sublabel: "0.85rem", glyph: "1.05rem", content: "1.0rem"  },
  large:  { rail: "50px", label: "1.5rem",  sublabel: "0.95rem", glyph: "1.25rem", content: "1.12rem" },
  xlarge: { rail: "58px", label: "1.7rem",  sublabel: "1.05rem", glyph: "1.4rem",  content: "1.25rem" },
};

export const REGION_CHROME_SIZES = Object.keys(REGION_CHROME_SCALE);
export const DEFAULT_REGION_CHROME_SIZE = "medium";

// CSS custom properties for a size. --icon-size/--icon-font keep IconButton
// size="custom" working; --region-content-fs is reserved for phase 2 (renderer
// bodies) and set now so no rework is needed later.
export function regionChromeVars(size) {
  const t = REGION_CHROME_SCALE[size] ?? REGION_CHROME_SCALE[DEFAULT_REGION_CHROME_SIZE];
  return {
    "--region-rail-h": t.rail,
    "--region-label-fs": t.label,
    "--region-sublabel-fs": t.sublabel,
    "--region-glyph-fs": t.glyph,
    "--region-content-fs": t.content,
    "--icon-size": t.rail,
    "--icon-font": t.glyph,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npx vitest run tests/unit/styles/regionChromeScale.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/regionChromeScale.js frontend/tests/unit/styles/regionChromeScale.spec.js
git commit -m "feat(dashboard): region-chrome scale module (calvin-6ig)"
```

---

### Task 2: Apply the scale on the dashboard root

**Files:**
- Modify: `frontend/src/views/Dashboard.vue` (template class binding ~56-66; remove `.dashboard-view--touch-*` CSS ~527-543)
- Test: `frontend/tests/unit/views/DashboardLabelScale.spec.js` (replace class assertions)

**Interfaces:**
- Consumes: `regionChromeVars` from Task 1.
- Produces: inline CSS vars on `.dashboard-view` — later tasks' consumers rely on `--region-*`/`--icon-*` being present there.

- [ ] **Step 1: Update the test to assert inline vars (failing)**

Replace the first two `it(...)` blocks in `DashboardLabelScale.spec.js` (the ones asserting `dashboard-view--touch-*` classes) with:

```js
  it("applies the medium scale vars by default (Default anchor)", () => {
    const w = setup();
    const style = w.find(".dashboard-view").attributes("style") || "";
    expect(style).toContain("--region-rail-h: 42px");
    expect(style).toContain("--region-label-fs: 1.25rem");
    expect(w.find(".dashboard-view").classes()).not.toContain("dashboard-view--touch-medium");
  });

  it("reflects the Touch-target size setting on the scale vars", () => {
    const large = setup(s => {
      s.touchControlSize = "large";
    });
    expect(large.find(".dashboard-view").attributes("style")).toContain("--region-rail-h: 50px");

    const xsmall = setup(s => {
      s.touchControlSize = "xsmall";
    });
    expect(xsmall.find(".dashboard-view").attributes("style")).toContain("--region-rail-h: 30px");
  });
```

Keep the existing third `it(...)` (the unlock class test) unchanged.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend; npx vitest run tests/unit/views/DashboardLabelScale.spec.js`
Expected: FAIL — style has no `--region-rail-h` yet.

- [ ] **Step 3: Apply inline vars + import**

In `Dashboard.vue` script setup, add the import near the other style imports:

```js
import { regionChromeVars } from "@/styles/regionChromeScale";
```

Change the dashboard-view element (remove the `dashboard-view--touch-*` class line, add `:style`):

```html
          <div
            v-else
            ref="dashboardViewEl"
            :class="[
              'mode-content',
              'dashboard-view',
              mainLayoutClass,
              { 'dashboard-view--unlocked': !configStore.regionsLocked },
            ]"
            :style="regionChromeVars(configStore.touchControlSize)"
          >
```

- [ ] **Step 4: Remove the obsolete class-based CSS**

Delete the `.dashboard-view--touch-small/medium/large` rules and their block comment from the `<style>` (the block that sets `--panel-title-fs`/`--panel-subtitle-fs`). **Keep** the `.mode-content.dashboard-view` base rule and the `.mode-content.dashboard-view.dashboard-view--unlocked { padding-bottom: 4.5rem; }` rule.

- [ ] **Step 5: Run tests + prettier**

Run: `cd frontend; npx vitest run tests/unit/views/DashboardLabelScale.spec.js; npx prettier --write src/views/Dashboard.vue tests/unit/views/DashboardLabelScale.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/Dashboard.vue frontend/tests/unit/views/DashboardLabelScale.spec.js
git commit -m "feat(dashboard): apply region-chrome scale vars via inline style (calvin-6ig)"
```

---

### Task 3: DashboardPanel labels read the scale

**Files:**
- Modify: `frontend/src/components/DashboardPanel.vue` (title/subtitle font-size, lines ~112, ~123, ~164, ~168)

**Interfaces:**
- Consumes: `--region-label-fs`, `--region-sublabel-fs` from Task 2.

- [ ] **Step 1: Rename the var references**

Replace the four occurrences:
- `.dashboard-panel__title` → `font-size: var(--region-label-fs, 1.5rem);`
- `.dashboard-panel__subtitle` → `font-size: var(--region-sublabel-fs, 0.85rem);`
- portrait clamp title → `font-size: clamp(1rem, 3vw, var(--region-label-fs, 1.5rem));`
- portrait clamp subtitle → `font-size: clamp(0.65rem, 1.6vw, var(--region-sublabel-fs, 0.85rem));`

- [ ] **Step 2: Run DashboardPanel + label specs**

Run: `cd frontend; npx vitest run tests/unit/components/DashboardPanel.spec.js tests/unit/views/DashboardLabelScale.spec.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DashboardPanel.vue
git commit -m "feat(dashboard): panel title/subtitle read region-label vars (calvin-6ig)"
```

---

### Task 4: CalendarView header on the rail

**Files:**
- Modify: `frontend/src/components/CalendarView.vue` (label ~1175; header IconButtons ~50/61/67; pills ~1200/1219)

**Interfaces:**
- Consumes: `--region-label-fs`, `--region-rail-h`, `--icon-size`/`--icon-font`.

- [ ] **Step 1: Label reads the shared var**

`.calendar-header__label` → `font-size: var(--region-label-fs, 1.25rem);` (keep `font-family: var(--font-display)` and `font-weight: 700`).

- [ ] **Step 2: Header glyph buttons use the rail**

Add `size="custom"` to the three header `IconButton`s: Previous (`‹`), Next (`›`), and the fullscreen (`⤢`, has `class="calendar-header__fullscreen"`). Example:

```html
            <IconButton size="custom" label="Previous" title="Previous" @click="previousMonth">
              ‹
            </IconButton>
```

- [ ] **Step 3: Text pills share the rail height**

`.calendar-header__view-switch` → `height: var(--region-rail-h, 1.75rem);` (replace `height: 1.75rem`).
`.calendar-header__today` → `height: var(--region-rail-h, 1.75rem);` (replace `height: 1.75rem`).
Leave their `font-size` as-is (readable; visual balance verified in Task 9).

- [ ] **Step 4: Lint + build (no unit test — CSS var wiring; covered visually in Task 9)**

Run: `cd frontend; npm run lint; npx prettier --write src/components/CalendarView.vue`
Expected: lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalendarView.vue
git commit -m "feat(dashboard): calendar header label + controls on the rail (calvin-6ig)"
```

---

### Task 5: View-options trigger on the rail

**Files:**
- Modify: `frontend/src/components/dashboard/RegionViewOptions.vue` (trigger IconButton ~3-21)

**Interfaces:**
- Consumes: `--icon-size`/`--icon-font`. Covers both calendar (`CalendarViewOptions`) and service (`ServiceRegionViewOptions`) since both wrap this component.

- [ ] **Step 1: Trigger uses the rail**

Add `size="custom"` to the `<IconButton class="region-view-options__trigger" ...>`.

- [ ] **Step 2: Run the RegionViewOptions spec if present, else lint**

Run: `cd frontend; npx vitest run tests/unit/components/dashboard 2>/dev/null; npm run lint`
Expected: PASS / lint clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/RegionViewOptions.vue
git commit -m "feat(dashboard): view-options trigger on the rail (calvin-6ig)"
```

---

### Task 6: Service header on the rail + remove the × close

**Files:**
- Modify: `frontend/src/components/WebServiceViewer.vue` (header IconButtons ~55-81; remove `handleClose` ~205-209)
- Test: `frontend/tests/unit/components/fullscreenClose.spec.js` (verify still green)

**Interfaces:**
- Consumes: `--icon-size`/`--icon-font`.

- [ ] **Step 1: Write a failing test — no Close button on the dashboard widget**

Add to `fullscreenClose.spec.js` (or create `frontend/tests/unit/components/WebServiceViewer.spec.js` if the mount harness differs) a test asserting the non-fullscreen service actions contain no `[aria-label="Close"]`. If a suitable harness doesn't exist, add this assertion inside Task 6 verification instead and note it. Minimal form:

```js
// Given a mounted, non-fullscreen WebServiceViewer with >1 service:
expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend; npx vitest run tests/unit/components/fullscreenClose.spec.js`
Expected: FAIL (Close button still present) — or SKIP if no harness; then rely on Step 4 grep.

- [ ] **Step 3: Edit the template**

Add `size="custom"` to the three header `IconButton`s (Previous Service `‹`, Next Service `›`, Enter Fullscreen `⤢`). **Delete** the Close button block entirely:

```html
            <IconButton v-if="!isFullscreen" label="Close" title="Close" @click.stop="handleClose">
              ×
            </IconButton>
```

Then delete the now-orphaned `handleClose`:

```js
const handleClose = event => {
  event.preventDefault();
  event.stopPropagation();
  close();
};
```

(Keep `close()` and `handleCloseFullscreen` — still used by fullscreen exit.)

- [ ] **Step 4: Verify — grep + tests + lint**

Run: `cd frontend; grep -n "handleClose\b" src/components/WebServiceViewer.vue` → only nothing (no matches).
Run: `npx vitest run tests/unit/components/fullscreenClose.spec.js; npm run lint`
Expected: PASS; lint clean (no unused `handleClose`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebServiceViewer.vue frontend/tests/unit/components/fullscreenClose.spec.js
git commit -m "feat(dashboard): service header on the rail; remove nonsensical close (calvin-6ig)"
```

---

### Task 7: Floating cluster inherits the scale

**Files:**
- Modify: `frontend/src/components/dashboard/RegionControls.vue` (remove `sizeClass` ~60-64 + `:class` ~2; remove `.region-controls--*` CSS ~112-123)
- Test: `frontend/tests/unit/components/dashboard/RegionControls.spec.js` (replace size-class assertions)

**Interfaces:**
- Consumes: `--icon-size`/`--icon-font` inherited from `.dashboard-view`.

- [ ] **Step 1: Update the test (failing)**

Replace the block asserting `region-controls--medium/small/large` (lines ~77-85) with an assertion that the cluster renders custom-sized IconButtons and no longer sets its own size class:

```js
  it("renders custom-sized icon buttons that inherit the dashboard scale", () => {
    const w = mountControls(); // existing helper in this spec
    expect(w.find(".region-controls").exists()).toBe(true);
    // no bespoke size modifier remains — sizing comes from inherited --icon-size
    expect(w.find(".region-controls").classes().some(c => c.startsWith("region-controls--"))).toBe(false);
    expect(w.findAll(".icon-btn--custom").length).toBeGreaterThan(0);
  });
```

(Adapt `mountControls`/config setup to the spec's existing helpers; the `isTouch` path must be enabled as it already is for the current size tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend; npx vitest run tests/unit/components/dashboard/RegionControls.spec.js`
Expected: FAIL — `region-controls--medium` still applied.

- [ ] **Step 3: Remove local sizing**

- Template: change `<div v-if="isTouch" class="region-controls" :class="sizeClass">` to `<div v-if="isTouch" class="region-controls">`.
- Script: delete the `sizeClass` computed (lines ~60-64).
- Style: delete the `.region-controls { --icon-size: 42px; --icon-font: 1.05rem; }` local defaults AND the `.region-controls--small/medium/large` rules. Keep the rest of `.region-controls` (display/gap). The `--icon-size`/`--icon-font` now come from `.dashboard-view`.

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend; npx vitest run tests/unit/components/dashboard/RegionControls.spec.js; npm run lint`
Expected: PASS; lint clean (no unused `sizeClass`/`configStore` — keep `configStore` only if still used elsewhere in the file; if not, remove its import too).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/RegionControls.vue frontend/tests/unit/components/dashboard/RegionControls.spec.js
git commit -m "feat(dashboard): floating cluster inherits region-chrome scale (calvin-6ig)"
```

---

### Task 8: Settings control — five presets

**Files:**
- Modify: `frontend/src/components/settings/categories/DisplaySettings.vue` (touchControlSize row ~255-270)
- Test: `frontend/tests/unit/components/settings/DisplaySettings.spec.js` (adjust if it asserts the control type)

**Interfaces:**
- Consumes: `SelectPill` (already imported? if not, add import).

- [ ] **Step 1: Swap SegmentedControl → SelectPill with five options**

```html
      <SettingRow
        label="Dashboard size"
        description="Scales the dashboard region labels and touch controls (calendar, photos, services). Independent of Settings UI size and the clock bar."
      >
        <SelectPill
          :model-value="config.touchControlSize"
          :options="[
            { value: 'xsmall', label: 'X-Small' },
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
            { value: 'xlarge', label: 'X-Large' },
          ]"
          aria-label="Dashboard size"
          @update:model-value="v => emit('update:config', { touchControlSize: v })"
        />
      </SettingRow>
```

Add `import SelectPill from "@/components/ui/SelectPill.vue";` if not already present. Leave the `SegmentedControl` import (still used by other rows).

- [ ] **Step 2: Fix the DisplaySettings spec if it asserts the old control**

Run: `cd frontend; npx vitest run tests/unit/components/settings/DisplaySettings.spec.js`
If it fails on a `SegmentedControl`/label assertion for this row, update the expectation to the new `SelectPill` / "Dashboard size" label. If it passes, no change.

- [ ] **Step 3: Lint + prettier**

Run: `cd frontend; npm run lint; npx prettier --write src/components/settings/categories/DisplaySettings.vue`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/categories/DisplaySettings.vue frontend/tests/unit/components/settings/DisplaySettings.spec.js
git commit -m "feat(settings): 5-step Dashboard size control (calvin-6ig)"
```

---

### Task 9: Full gate + live visual verification

**Files:** none (verification + any overflow fix discovered here).

- [ ] **Step 1: Full gate**

Run (from `frontend/`):
```
npm run lint
npx prettier --check "src/**/*.{js,jsx,vue,json,css}"
npx vitest run
npm run build
```
Expected: all green. (Do NOT `pkill vitest`.)

- [ ] **Step 2: Visual verify across presets (Playwright, dev server on :5175)**

For each of `xsmall, medium, xlarge`: set `touchControlSize` (via Settings SelectPill, or `useConfigStore().touchControlSize` in `browser_evaluate`), then measure and screenshot a calendar region and a service region. Assert with `getComputedStyle`:
- `.calendar-header__label` and `.dashboard-panel__title` have **equal** `fontSize`, and it grows across presets.
- Every control in `.calendar-header__controls` has the **same** `height` (the rail).
- A `.region-controls .icon-btn` height equals a header `.icon-btn` height (cluster == header).
- No `[aria-label="Close"]` inside a non-fullscreen service region.

- [ ] **Step 3: Handle header overflow if seen**

At `large`/`xlarge` on a narrow calendar region, if the control row overflows: add to `.calendar-header__controls` `flex-wrap: wrap` OR reduce its `gap`, OR hide `.calendar-header__today` at the two largest presets via a `--region-rail-h`-based rule. Pick the least-disruptive that keeps the label visible; screenshot before/after. Commit separately:

```bash
git commit -am "fix(dashboard): keep header controls from overflowing at large presets (calvin-6ig)"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin fix/dashboard-label-scale-and-scrollbars
gh pr create --base develop --title "feat(dashboard): unified region-chrome scale (5-step Dashboard size) (calvin-6ig)" --body "<summary from the spec>"
```

- [ ] **Step 5: Watch CI to green**

Run: `gh pr checks <PR#> --watch --interval 20`
Expected: all checks pass. Fix prettier/format if the fast-fail hits.

---

## Self-Review

**Spec coverage:** unify chrome (Tasks 2-7 ✓), 5 presets (Tasks 1,8 ✓), medium≈today anchor (Task 1 values ✓), unified label size (Tasks 3,4 ✓), control rail one-height (Tasks 4,5,6,7 ✓), one source of truth (Tasks 1,2,7 ✓), remove × (Task 6 ✓), `--region-content-fs` reserve (Task 1 ✓), keep scrollbars+unlock fix (Global Constraints ✓), no backend change (verified ✓), overflow risk (Task 9 ✓). No gaps.

**Placeholder scan:** Task 6 Step 1 and Task 8 Step 2 are conditional ("if the harness/spec asserts…") — these are genuine "inspect then adjust" steps with the exact assertion given, not vague TODOs. Acceptable.

**Type consistency:** `regionChromeVars`, `REGION_CHROME_SIZES`, `DEFAULT_REGION_CHROME_SIZE`, and all `--region-*`/`--icon-*` token names are used identically across Tasks 1-8.
