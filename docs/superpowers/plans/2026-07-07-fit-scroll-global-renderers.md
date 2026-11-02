# Global fit-scroll for schema renderers (`useFitScroll`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give schema renderers one shared, axis-aware fit-scroll behavior — scroll when a pointer (mouse/touch) is present, clamp to whole tracks when keyboard-only — via a new `useFitScroll` composable, adopted by CardGrid, WeatherForecast, and ItemList.

**Architecture:** A presentation composable `useFitScroll` layered over the existing pure `useFitClamp`. It owns the `hasPointer` decision, the clamp/scroll `clampStyle`, the additive `shadeClass`, and the async-data recompute. Renderers bind `ref`/`:class`/`:style` plus one per-renderer "keep items natural size along the axis" layout rule.

**Tech Stack:** Vue 3 Composition API, Vitest + @vue/test-utils.

## Global Constraints

- Frontend dir: all paths under `frontend/`. Run tests from `frontend/`.
- Single-run tests: `npx vitest run <path>` (bare `vitest` is watch mode).
- Scroll-vs-clamp keys on **`hasPointer`** (mouse OR touch), NOT `isTouch`. Keyboard-only (`hasPointer` false) → clamp.
- `computeFitBoundary` / `useFitClamp` measurement logic and `useTouchCapability` are unchanged except dropping `useFitClamp`'s unused `isTouch` param.
- Scroll-fade uses the existing global classes `calvin-plugin-scroll-shade` + `calvin-plugin-scroll-shade--block` / `--inline` (main.css). Apply the directional modifier **additively** (only when shading) — no `:not(--shaded)` double-negative.
- Test mocks that must react to `.value` changes use real Vue `ref()` (a plain `{value}` object does not auto-unwrap in templates/computed) — pattern proven in `CalendarView.touchControls.spec.js`.
- Actual pixel clamping is not jsdom-testable; unit tests assert emitted style/class shape, live docker/Playwright verifies pixels.

---

### Task 1: `useFitScroll` composable + unit test

**Files:**
- Create: `frontend/src/composables/useFitScroll.js`
- Create: `frontend/tests/unit/composables/useFitScroll.spec.js`
- Modify: `frontend/src/composables/useFitClamp.js` (drop unused `isTouch` param)

**Interfaces:**
- Consumes: `useFitClamp(containerRef, { axis, itemSelector, viewport })` → `{ fits, hasOverflow, recompute }`; `useTouchCapability()` → `{ hasPointer }`.
- Produces: `useFitScroll(containerRef, { axis, itemSelector, data, viewport="parent" })` → `{ clampStyle, shadeClass, showShade, recompute }`.
  - `axis`: `"block"` (Y) | `"inline"` (X).
  - `clampStyle` (computed): `hasPointer` → `{ overflow<X|Y>:"auto", scrollSnapType:"<x|y> proximity" }`; else `{ max<Inline|Block>Size: fits?fits+"px":null, overflow<X|Y>:"hidden" }`.
  - `shadeClass` (computed): `["calvin-plugin-scroll-shade", { "calvin-plugin-scroll-shade--<block|inline>": showShade.value }]`.
  - `showShade` (computed): `hasPointer.value && hasOverflow.value`.

- [ ] **Step 1: Write the failing unit test**

Create `frontend/tests/unit/composables/useFitScroll.spec.js`:

```javascript
import { ref } from "vue";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Real refs so useFitScroll's computeds track them (plain {value} won't react).
const caps = { hasPointer: ref(true) };
const clamp = { fits: ref(0), hasOverflow: ref(false), recompute: vi.fn() };

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => caps,
}));
vi.mock("@/composables/useFitClamp", () => ({
  useFitClamp: () => clamp,
}));

import { useFitScroll } from "@/composables/useFitScroll";

describe("useFitScroll", () => {
  beforeEach(() => {
    caps.hasPointer.value = true;
    clamp.fits.value = 0;
    clamp.hasOverflow.value = false;
  });

  it("pointer present → scroll+snap style on the block axis", () => {
    const { clampStyle } = useFitScroll(ref(null), { axis: "block", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ overflowY: "auto", scrollSnapType: "y proximity" });
  });

  it("keyboard-only → clamp to fits on the block axis", () => {
    caps.hasPointer.value = false;
    clamp.fits.value = 120;
    const { clampStyle } = useFitScroll(ref(null), { axis: "block", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ maxBlockSize: "120px", overflowY: "hidden" });
  });

  it("inline axis maps to the X properties", () => {
    const { clampStyle } = useFitScroll(ref(null), { axis: "inline", itemSelector: ".x" });
    expect(clampStyle.value).toEqual({ overflowX: "auto", scrollSnapType: "x proximity" });
    caps.hasPointer.value = false;
    clamp.fits.value = 90;
    expect(clampStyle.value).toEqual({ maxInlineSize: "90px", overflowX: "hidden" });
  });

  it("shadeClass adds the directional modifier only when pointer AND overflow", () => {
    const { shadeClass, showShade } = useFitScroll(ref(null), { axis: "inline", itemSelector: ".x" });
    expect(showShade.value).toBe(false); // no overflow yet
    clamp.hasOverflow.value = true;
    expect(showShade.value).toBe(true);
    expect(shadeClass.value).toEqual([
      "calvin-plugin-scroll-shade",
      { "calvin-plugin-scroll-shade--inline": true },
    ]);
    caps.hasPointer.value = false; // keyboard-only: no shade even with overflow
    expect(showShade.value).toBe(false);
    expect(shadeClass.value).toEqual([
      "calvin-plugin-scroll-shade",
      { "calvin-plugin-scroll-shade--inline": false },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/composables/useFitScroll.spec.js`
Expected: FAIL — `useFitScroll` module does not exist.

- [ ] **Step 3: Implement `useFitScroll`**

Create `frontend/src/composables/useFitScroll.js`:

```javascript
import { computed, nextTick, watch } from "vue";
import { useFitClamp } from "./useFitClamp.js";
import { useTouchCapability } from "./useTouchCapability";

// Presentation layer over the pure useFitClamp: decides scroll-vs-clamp from
// hasPointer (mouse OR touch → scroll+snap+fade; keyboard-only → clamp to the
// last whole track), and emits ready-to-bind style + class. Axis-agnostic:
// "block" clamps height (Y), "inline" clamps width (X).
export function useFitScroll(containerRef, { axis, itemSelector, data, viewport = "parent" }) {
  const inline = axis === "inline";
  const { hasPointer } = useTouchCapability();
  const { fits, hasOverflow, recompute } = useFitClamp(containerRef, {
    axis,
    itemSelector,
    viewport,
  });

  // The container's border-box is pinned by its layout, so ResizeObserver won't
  // fire when data loads/changes late — recompute the clamp when it does.
  if (data) {
    watch(data, () => nextTick(recompute), { deep: true });
  }

  const clampStyle = computed(() => {
    if (hasPointer.value) {
      return inline
        ? { overflowX: "auto", scrollSnapType: "x proximity" }
        : { overflowY: "auto", scrollSnapType: "y proximity" };
    }
    const size = fits.value ? `${fits.value}px` : null;
    return inline
      ? { maxInlineSize: size, overflowX: "hidden" }
      : { maxBlockSize: size, overflowY: "hidden" };
  });

  const showShade = computed(() => hasPointer.value && hasOverflow.value);
  const shadeClass = computed(() => [
    "calvin-plugin-scroll-shade",
    { [`calvin-plugin-scroll-shade--${inline ? "inline" : "block"}`]: showShade.value },
  ]);

  return { clampStyle, shadeClass, showShade, recompute };
}
```

- [ ] **Step 4: Drop the unused `isTouch` param from `useFitClamp`**

In `frontend/src/composables/useFitClamp.js`, change the options destructure (line 54) from:

```javascript
  { axis = "block", itemSelector, isTouch: _isTouch, viewport = "self" }
```

to:

```javascript
  { axis = "block", itemSelector, viewport = "self" }
```

(No caller breaks: passing an extra `isTouch` key is simply ignored, and `useFitScroll` does not pass it.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/composables/useFitScroll.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the existing fit-clamp / renderer suites for regressions**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS (the `isTouch` param drop is inert; CardGrid still passes `isTouch` harmlessly until Task 2).

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/composables/useFitScroll.js tests/unit/composables/useFitScroll.spec.js src/composables/useFitClamp.js
git commit -m "feat(renderers): add useFitScroll (hasPointer scroll/clamp) over useFitClamp (calvin-vmo)"
```

---

### Task 2: Refactor CardGrid onto `useFitScroll`

**Files:**
- Modify: `frontend/src/components/plugins/renderers/CardGrid.vue`
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js` (existing CardGrid tests must still pass; add one shade-class assertion)

**Interfaces:**
- Consumes: `useFitScroll` (Task 1).
- Produces: CardGrid's scroll container carries `shadeClass` + `clampStyle`; keeps `gridAutoRows:"max-content"`. Behavior change: scroll-vs-clamp now keys on `hasPointer` (mouse desktop scrolls instead of clamping).

- [ ] **Step 1: Add the failing assertion**

In `frontend/tests/unit/components/plugins/Renderers.spec.js`, inside `describe("CardGrid", ...)`, add:

```javascript
  it("marks the grid as a fit-scroll container", () => {
    const wrapper = mount(CardGrid, { props: { schema, data: mealData } });
    expect(wrapper.find(".card-grid").classes()).toContain("calvin-plugin-scroll-shade");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js -t "fit-scroll container"`
Expected: FAIL for the CardGrid case — the class is currently hardcoded only as `calvin-plugin-scroll-shade--block` alongside a `card-grid--shaded` toggle; after refactor it comes from `shadeClass`. (It may pass by accident on the current hardcoded class; if so, still proceed — the refactor is the point and Step 5 re-verifies.)

- [ ] **Step 3: Refactor the `<script setup>`**

In `CardGrid.vue`, replace the imports and the fit block. Change the vue import (line 44) from:

```javascript
import { ref, computed, watch, nextTick } from "vue";
```

to:

```javascript
import { ref, computed } from "vue";
```

Replace the two composable imports (lines 48-49):

```javascript
import { useFitClamp } from "../../../composables/useFitClamp.js";
import { useTouchCapability } from "../../../composables/useTouchCapability";
```

with:

```javascript
import { useFitScroll } from "../../../composables/useFitScroll.js";
```

Replace the whole fit block (current lines 63-89 — `gridEl`, `isTouch`, `useFitClamp`, the `watch`, `clampStyle`, `showShade`) with:

```javascript
const gridEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(gridEl, {
  axis: "block",
  itemSelector: ".card-grid__card",
  data: () => props.data,
});
```

- [ ] **Step 4: Refactor the template + scoped CSS**

In `CardGrid.vue` template, change the root element's classes (lines 3-5) from:

```html
    class="card-grid calvin-plugin-grid calvin-plugin-scroll-shade calvin-plugin-scroll-shade--block"
    :class="{ 'card-grid--shaded': showShade }"
    :style="[gridStyle, clampStyle]"
```

to:

```html
    class="card-grid calvin-plugin-grid"
    :class="shadeClass"
    :style="[gridStyle, clampStyle]"
```

In the scoped `<style>`, delete the now-dead shaded-negation rule (lines 172-175):

```css
.card-grid:not(.card-grid--shaded) {
  -webkit-mask-image: none;
  mask-image: none;
}
```

Keep `.card-grid { overflow: hidden; }` (the cross-axis clip) and `gridAutoRows:"max-content"` in `gridStyle`.

- [ ] **Step 5: Run the full renderer suite**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS — including the existing `grid-auto-rows: max-content` guard and the column-count/card-min tests (all read `gridStyle`, unchanged), plus the new shade-class assertion.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/plugins/renderers/CardGrid.vue tests/unit/components/plugins/Renderers.spec.js
git commit -m "refactor(card-grid): consume useFitScroll; scroll on any pointer (calvin-vmo)"
```

---

### Task 3: WeatherForecast — X-axis fit-scroll on the forecast strip

**Files:**
- Modify: `frontend/src/components/plugins/renderers/WeatherForecast.vue`
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js`

**Interfaces:**
- Consumes: `useFitScroll` (Task 1).
- Produces: `.weather-forecast-renderer__items` is an inline (X) fit-scroll container with natural column widths.

- [ ] **Step 1: Write the failing test**

In `Renderers.spec.js`, inside `describe("WeatherForecast", ...)`, add (reuse the block's existing `schema` const):

```javascript
  it("makes the forecast strip an inline fit-scroll container with natural columns", () => {
    const wrapper = mount(WeatherForecast, {
      props: {
        schema,
        data: {
          location: "Oslo",
          current: { temperature: 8, display: { icon: "mdi:weather-rainy" } },
          forecast: [
            { date: "2099-01-01", temp_min: 2, temp_max: 9, display: { icon: "mdi:weather-cloudy" } },
            { date: "2099-01-02", temp_min: 1, temp_max: 7, display: { icon: "mdi:weather-cloudy" } },
          ],
        },
      },
    });
    const strip = wrapper.find(".weather-forecast-renderer__items");
    expect(strip.classes()).toContain("calvin-plugin-scroll-shade");
    expect(strip.attributes("style")).toContain("grid-auto-columns");
    expect(strip.attributes("style")).toContain("max-content");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js -t "inline fit-scroll container"`
Expected: FAIL — the strip has no shade class and no inline `grid-auto-columns`.

- [ ] **Step 3: Wire the composable in `<script setup>`**

In `WeatherForecast.vue`, change the vue import (line 75) from:

```javascript
import { computed } from "vue";
```

to:

```javascript
import { computed, ref } from "vue";
```

Add after the imports (below line 77's `weatherIcons` import):

```javascript
import { useFitScroll } from "../../../composables/useFitScroll.js";
```

Add after the `forecast` computed (after line 98):

```javascript
const itemsEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(itemsEl, {
  axis: "inline",
  itemSelector: ".weather-forecast-renderer__item",
  data: () => props.data,
});
// Natural column widths so the strip OVERFLOWS horizontally instead of shrinking
// columns to fit — that overflow is what useFitScroll clamps/scrolls (X-axis
// analogue of the card-grid grid-auto-rows:max-content fix).
const stripStyle = { gridAutoColumns: "minmax(90px, max-content)" };
```

- [ ] **Step 4: Bind the strip in the template**

Change the forecast items container (line 43) from:

```html
      <div class="weather-forecast-renderer__items">
```

to:

```html
      <div
        ref="itemsEl"
        class="weather-forecast-renderer__items"
        :class="shadeClass"
        :style="[stripStyle, clampStyle]"
      >
```

- [ ] **Step 5: Move the strip's axis styling out of scoped CSS**

In the scoped `<style>`, edit `.weather-forecast-renderer__items` (lines 258-266) to drop the now-inline `grid-auto-columns` and the now-composable `overflow-x` (keep the rest):

```css
.weather-forecast-renderer__items {
  display: grid;
  grid-auto-flow: column;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 6: Run the renderer suite**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS — the new strip test and the existing "renders current weather and forecast" test.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/components/plugins/renderers/WeatherForecast.vue tests/unit/components/plugins/Renderers.spec.js
git commit -m "feat(weather): X-axis fit-scroll on the forecast strip via useFitScroll (calvin-vmo)"
```

---

### Task 4: ItemList — Y-axis fit-scroll

**Files:**
- Modify: `frontend/src/components/plugins/renderers/ItemList.vue`
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js`

**Interfaces:**
- Consumes: `useFitScroll` (Task 1).
- Produces: the `.item-list` `<ul>` is a block (Y) fit-scroll container; rows don't shrink.

- [ ] **Step 1: Write the failing test**

In `Renderers.spec.js`, inside `describe("ItemList", ...)`, add:

```javascript
  it("makes the list a block fit-scroll container", () => {
    const wrapper = mount(ItemList, {
      props: {
        schema: { kind: "item-list", item: { label_path: "$.label" } },
        data: [{ label: "one" }, { label: "two" }],
      },
    });
    const ul = wrapper.find(".item-list");
    expect(ul.classes()).toContain("calvin-plugin-scroll-shade");
    // pointer is present by default in the test env → scroll style
    expect(ul.attributes("style") || "").toContain("scroll-snap-type");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js -t "block fit-scroll container"`
Expected: FAIL — the `<ul>` has no shade class / clamp style.

- [ ] **Step 3: Wire the composable in `<script setup>`**

In `ItemList.vue`, change the vue import (line 36) from:

```javascript
import { computed } from "vue";
```

to:

```javascript
import { computed, ref } from "vue";
```

Add after the `useLinkOpen` import (after line 41):

```javascript
import { useFitScroll } from "../../../composables/useFitScroll.js";
```

Add after the `items` computed (after line 58):

```javascript
const listEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(listEl, {
  axis: "block",
  itemSelector: ".item-list__row",
  data: () => props.data,
});
```

- [ ] **Step 4: Bind the `<ul>` and stop rows from shrinking**

Change the root `<ul>` (line 2) from:

```html
  <ul class="item-list calvin-plugin-list calvin-plugin-list--scroll">
```

to:

```html
  <ul
    ref="listEl"
    class="item-list calvin-plugin-list calvin-plugin-list--scroll"
    :class="shadeClass"
    :style="clampStyle"
  >
```

In the scoped `<style>`, add `flex-shrink: 0;` to `.item-list__row` (it is a flex child of the `calvin-plugin-list` flex column; without this it can compress instead of overflowing):

```css
.item-list__row {
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Run the renderer suite**

Run: `cd frontend && npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS — the new list test and the existing ItemList row/empty tests.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/plugins/renderers/ItemList.vue tests/unit/components/plugins/Renderers.spec.js
git commit -m "feat(item-list): block fit-scroll via useFitScroll; rows keep natural height (calvin-vmo)"
```

---

### Task 5: Full gate + live verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors. Fix any unused-import fallout (e.g. a stray `useFitClamp`/`useTouchCapability`/`watch`/`nextTick` left in CardGrid).

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live-verify on the docker dev stack (Playwright)**

Across a weather-forecast service, a card-grid service, and an item-list service:
- **Weather strip (the headline case):** keyboard-only (`touchControls=off`) → whole-day-column clamp, no partial column, no scroll; mouse/touch (`on`/auto with pointer) → horizontal scroll + snap + right-edge fade; the current-conditions block above the strip stays put.
- **CardGrid:** keyboard-only → whole-row clamp (unchanged); **mouse and touch → vertical scroll + snap + bottom fade** (the intended mouse-desktop behavior change).
- **ItemList:** keyboard-only → whole-row clamp; pointer → vertical scroll + fade.

- [ ] **Step 5: Close the issue**

```bash
bd close calvin-vmo
```

---

## Self-Review Notes

- **Spec coverage:** `useFitScroll` + drop `isTouch` param (Task 1) · CardGrid refactor onto it, incl. shade-gating simplification and hasPointer trigger (Task 2) · WeatherForecast X-axis + strip natural width (Task 3) · ItemList Y-axis + row no-shrink (Task 4) · full gate + live verify + close (Task 5). All spec sections mapped.
- **Placeholder scan:** none — every code/step is concrete.
- **Type/name consistency:** `useFitScroll(containerRef, { axis, itemSelector, data, viewport })` → `{ clampStyle, shadeClass, showShade, recompute }` used identically in Tasks 2/3/4; `axis` values `"block"`/`"inline"`; shade classes `calvin-plugin-scroll-shade[--block|--inline]` match main.css; `data:()=>props.data` getter form consistent across renderers.
- **hasPointer trigger** is applied uniformly (CardGrid included) — the one shipped-behavior change (mouse-desktop card-grid scroll) is user-approved.
