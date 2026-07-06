# Card-grid fit-clamp + per-region card size — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop plugin renderers from clipping partial items — show only the whole rows/items that fit (non-touch) or scroll to the rest with an affordance (touch) — and give each service region a 5-step card-size lever.

**Architecture:** A pure measurement helper + `useFitClamp` composable (vueuse-backed) clamps overflow to whole tracks. Card-grid consumes it plus two CSS vars (`--card-min`, `--card-pad`) set per-region from the existing `view` object. A "Card size" control in the existing `ServiceRegionViewOptions` popover persists via `updateRegionView`. Card-grid ships this PR; weather-forecast + item-list are a fast follow.

**Tech Stack:** Vue 3 Composition API, `@vueuse/core@^10.7.0` (first repo use), Pinia, Vitest + @vue/test-utils, Playwright (live dev stack in docker: frontend `:5174`, backend `:8001`).

**Spec:** `docs/superpowers/specs/2026-07-06-card-grid-fit-clamp-and-size-control-design.md`

## Global Constraints

- Region content-scaling from Part A (PR #84) is live: `--region-content-fs` on the dashboard root, renderer internals in `em`. This plan is **orthogonal** — it changes card *footprint*, never text size. Do not touch `--region-content-fs` or the `em` conversions.
- Card-size scale keys/labels are **identical to the global Dashboard-size setting**: `xsmall / small / medium / large / xlarge` → `X-Small / Small / Medium / Large / X-Large`. `medium` is the default and a **no-op** (equals today's `auto-fit-220`, `1rem` padding).
- `medium` MUST leave card-grid pixel-identical to pre-change (regression guard).
- Excluded renderers (unchanged): `iframe`, `web-component`. Statusbar context unchanged.
- Run frontend commands from `/home/tux/code/calvin/frontend`. Tests: `npx vitest run <path>`. Lint: `npx eslint <path>`. Format touched files with `npx prettier --write <path>` before each commit.
- Commit style: `<type>(scope): subject (calvin-fub)`.

---

## File Structure

**Create:**
- `frontend/src/styles/cardSizeScale.js` — 5-step footprint scale + `cardSizeVars(size)`. Mirrors `regionChromeScale.js`.
- `frontend/src/composables/useFitClamp.js` — pure `computeFitBoundary(...)` helper + `useFitClamp(...)` composable.
- `frontend/tests/unit/styles/cardSizeScale.spec.js`
- `frontend/tests/unit/composables/useFitClamp.spec.js`
- `frontend/tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js`

**Modify:**
- `frontend/src/components/dashboard/ServiceRegionViewOptions.vue` — add "Card size" row.
- `frontend/src/components/WebServiceViewer.vue` — derive `cardSize` from `view`, apply `cardSizeVars` on the viewer root.
- `frontend/src/components/plugins/renderers/CardGrid.vue` — consume `--card-min`/`--card-pad`, wire `useFitClamp`, scroll-shade.
- `frontend/src/styles/main.css` — add `.calvin-plugin-scroll-shade` utility.
- `frontend/tests/unit/components/plugins/Renderers.spec.js` — extend CardGrid coverage.

---

## Task 1: Card-size scale module

**Files:**
- Create: `frontend/src/styles/cardSizeScale.js`
- Test: `frontend/tests/unit/styles/cardSizeScale.spec.js`

**Interfaces:**
- Produces: `CARD_SIZE_SCALE` (object), `CARD_SIZE_KEYS` (string[]), `DEFAULT_CARD_SIZE` (`"medium"`), `cardSizeVars(size: string) -> { "--card-min": string, "--card-pad": string }`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/styles/cardSizeScale.spec.js`:
```js
import { describe, it, expect } from "vitest";
import {
  cardSizeVars,
  CARD_SIZE_KEYS,
  DEFAULT_CARD_SIZE,
} from "@/styles/cardSizeScale.js";

describe("cardSizeScale", () => {
  it("exposes the five Dashboard-size-aligned keys", () => {
    expect(CARD_SIZE_KEYS).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_CARD_SIZE).toBe("medium");
  });

  it("medium is the current-default no-op (220px / 1rem)", () => {
    expect(cardSizeVars("medium")).toEqual({ "--card-min": "220px", "--card-pad": "1rem" });
  });

  it("returns min-width + padding for each size", () => {
    expect(cardSizeVars("xsmall")).toEqual({ "--card-min": "160px", "--card-pad": "0.6rem" });
    expect(cardSizeVars("xlarge")).toEqual({ "--card-min": "300px", "--card-pad": "1.4rem" });
  });

  it("falls back to medium for unknown input", () => {
    expect(cardSizeVars("bogus")).toEqual(cardSizeVars("medium"));
    expect(cardSizeVars(undefined)).toEqual(cardSizeVars("medium"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/styles/cardSizeScale.spec.js`
Expected: FAIL — cannot resolve `@/styles/cardSizeScale.js`.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/styles/cardSizeScale.js`:
```js
// Per-region card footprint scale. Deliberately shares the five keys of the
// global "Dashboard size" setting (regionChromeScale.js) so the two controls
// align. `medium` equals today's card-grid default (auto-fit-220 / 1rem pad),
// making it a no-op — exactly how Dashboard-size `medium` leaves chrome as-is.
// Unlike Dashboard size (text), this scales card FOOTPRINT: column min-width +
// internal padding. The two are orthogonal.
export const CARD_SIZE_SCALE = {
  xsmall: { min: "160px", pad: "0.6rem" },
  small: { min: "190px", pad: "0.8rem" },
  medium: { min: "220px", pad: "1rem" },
  large: { min: "260px", pad: "1.2rem" },
  xlarge: { min: "300px", pad: "1.4rem" },
};

export const CARD_SIZE_KEYS = Object.keys(CARD_SIZE_SCALE);
export const DEFAULT_CARD_SIZE = "medium";

// CSS custom properties consumed by CardGrid: --card-min drives the auto-fit
// column min-width, --card-pad the card padding. Unknown -> medium.
export function cardSizeVars(size) {
  const t = CARD_SIZE_SCALE[size] ?? CARD_SIZE_SCALE[DEFAULT_CARD_SIZE];
  return { "--card-min": t.min, "--card-pad": t.pad };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/styles/cardSizeScale.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/styles/cardSizeScale.js tests/unit/styles/cardSizeScale.spec.js
git add src/styles/cardSizeScale.js tests/unit/styles/cardSizeScale.spec.js
git commit -m "feat(dashboard): add 5-step card-size footprint scale (calvin-fub)"
```

---

## Task 2: Card-size control + per-region CSS vars

**Files:**
- Modify: `frontend/src/components/dashboard/ServiceRegionViewOptions.vue`
- Modify: `frontend/src/components/WebServiceViewer.vue:175` (near `linkAction` computed) and the root element style
- Test: `frontend/tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js`

**Interfaces:**
- Consumes: `cardSizeVars`, `DEFAULT_CARD_SIZE` (Task 1); `configStore.updateRegionView(regionId, patch)`; `SelectPill` (`modelValue`, `options`, `@update:modelValue`).
- Produces: region root carries `--card-min`/`--card-pad` (consumed by Task 4). `view.cardSize` persisted key.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js`:
```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ServiceRegionViewOptions from "@/components/dashboard/ServiceRegionViewOptions.vue";
import { useConfigStore } from "@/stores/config";

describe("ServiceRegionViewOptions — card size", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function openPopover(view = {}) {
    const wrapper = mount(ServiceRegionViewOptions, {
      props: { regionId: "region-1", view },
    });
    // RegionViewOptions renders the popover slot only when open; click the trigger.
    wrapper.find(".region-view-options__trigger").trigger("click");
    return wrapper;
  }

  it("reflects the region's current card size (default medium when absent)", async () => {
    const wrapper = openPopover({});
    await wrapper.vm.$nextTick();
    const pill = wrapper.findAll('[aria-label="Card size"]');
    expect(pill.length).toBe(1);
    // default surfaced as medium
    expect(wrapper.html()).toContain("Medium");
  });

  it("persists a card-size change via updateRegionView", async () => {
    const wrapper = openPopover({ cardSize: "medium" });
    await wrapper.vm.$nextTick();
    const store = useConfigStore();
    const spy = vi.spyOn(store, "updateRegionView").mockResolvedValue();
    // Click the "Large" option button inside the Card size control.
    const large = wrapper.findAll("button").find(b => b.text() === "Large");
    await large.trigger("click");
    expect(spy).toHaveBeenCalledWith("region-1", { cardSize: "large" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js`
Expected: FAIL — no `Card size` control / no `cardSize` handling.

- [ ] **Step 3: Add the Card-size row to `ServiceRegionViewOptions.vue`**

In the template, add a second row after the existing `.svo-row` (Link behavior), inside the `RegionViewOptions` slot:
```html
    <div class="svo-row">
      <span class="svo-label">Card size</span>
      <SelectPill
        class="svo-size"
        :model-value="currentCardSize"
        :options="cardSizeOptions"
        aria-label="Card size"
        @update:model-value="setCardSize"
      />
    </div>
```

In `<script setup>`, add imports and logic (keep existing link-behavior code):
```js
import SelectPill from "@/components/ui/SelectPill.vue";
import { DEFAULT_CARD_SIZE } from "@/styles/cardSizeScale.js";

const cardSizeOptions = [
  { value: "xsmall", label: "X-Small" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "X-Large" },
];
const currentCardSize = computed(() => props.view?.cardSize ?? DEFAULT_CARD_SIZE);

const setCardSize = value => {
  if (value === currentCardSize.value) return;
  configStore.updateRegionView(props.regionId, { cardSize: value }).catch(err => {
    console.error("Failed to update card size:", err);
  });
};
```

Add a scoped style so five pills wrap cleanly in the narrow popover:
```css
.svo-size {
  flex-wrap: wrap;
  justify-content: flex-end;
}
```

- [ ] **Step 4: Run the control test to verify it passes**

Run: `npx vitest run tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js`
Expected: PASS (2 tests). If SelectPill renders option labels as buttons, the `.find(b => b.text() === "Large")` locates it; if it uses a different element, adjust the selector to match `SelectPill.vue`'s option markup.

- [ ] **Step 5: Apply `--card-min`/`--card-pad` on the region in `WebServiceViewer.vue`**

Near the existing `linkAction` computed (around line 175), add:
```js
import { cardSizeVars } from "@/styles/cardSizeScale.js";

const cardStyle = computed(() => cardSizeVars(props.view?.cardSize));
```

Bind it on the root element so descendants (the card-grid) inherit the vars:
```html
<div class="web-service-viewer" :class="{ fullscreen: isFullscreen }" :style="cardStyle">
```

- [ ] **Step 6: Run the full renderer + viewer suites to confirm no regressions**

Run: `npx vitest run tests/unit/components/plugins/ tests/unit/components/dashboard/`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/components/dashboard/ServiceRegionViewOptions.vue src/components/WebServiceViewer.vue tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js
git add src/components/dashboard/ServiceRegionViewOptions.vue src/components/WebServiceViewer.vue tests/unit/components/dashboard/ServiceRegionViewOptions.spec.js
git commit -m "feat(dashboard): per-region card-size control feeding --card-min/--card-pad (calvin-fub)"
```

---

## Task 3: `useFitClamp` composable (pure helper + vueuse wiring)

**Files:**
- Create: `frontend/src/composables/useFitClamp.js`
- Test: `frontend/tests/unit/composables/useFitClamp.spec.js`

**Interfaces:**
- Produces:
  - `computeFitBoundary(itemBounds: {start:number,end:number}[], containerSize: number, epsilon=1) -> { fits:number, fitCount:number, hasOverflow:boolean, trackCount:number }` — pure; groups items into tracks by shared `start` (within `epsilon`), returns the end of the last fully-fitting track, the number of items within fitting tracks, and whether anything overflowed. If no track fits but ≥1 exists, shows the first track (never blank).
  - `useFitClamp(containerRef, { axis:"block"|"inline", itemSelector:string, isTouch:Ref<boolean>|boolean }) -> { fits:Ref<number>, fitCount:Ref<number>, hasOverflow:Ref<boolean>, recompute:()=>void }`.

- [ ] **Step 1: Write the failing test (pure helper)**

`frontend/tests/unit/composables/useFitClamp.spec.js`:
```js
import { describe, it, expect } from "vitest";
import { computeFitBoundary } from "@/composables/useFitClamp.js";

describe("computeFitBoundary", () => {
  // Three horizontal items, each its own track (distinct starts).
  const oneDim = [
    { start: 0, end: 90 },
    { start: 100, end: 190 },
    { start: 200, end: 290 },
    { start: 300, end: 390 },
  ];

  it("returns the last whole item that fits (1D)", () => {
    // Container 295px: items 1-3 fit (end 290), 4th (end 390) does not.
    const r = computeFitBoundary(oneDim, 295);
    expect(r.fitCount).toBe(3);
    expect(r.fits).toBe(290);
    expect(r.hasOverflow).toBe(true);
  });

  it("no overflow when everything fits", () => {
    const r = computeFitBoundary(oneDim, 400);
    expect(r.fitCount).toBe(4);
    expect(r.hasOverflow).toBe(false);
    expect(r.fits).toBe(390);
  });

  it("groups items sharing a start into one track (2D rows)", () => {
    // Two rows of two cards. Row 1 ends at 80, row 2 at 170.
    const grid = [
      { start: 0, end: 80 },
      { start: 0, end: 78 },
      { start: 90, end: 170 },
      { start: 90, end: 168 },
    ];
    // Container 130px: only row 1 fits; both its cards count.
    const r = computeFitBoundary(grid, 130);
    expect(r.trackCount).toBe(2);
    expect(r.fitCount).toBe(2);
    expect(r.fits).toBe(80);
    expect(r.hasOverflow).toBe(true);
  });

  it("never blanks: shows the first track even if it overflows", () => {
    const r = computeFitBoundary([{ start: 0, end: 200 }], 120);
    expect(r.fitCount).toBe(1);
    expect(r.fits).toBe(200);
    expect(r.hasOverflow).toBe(true);
  });

  it("empty input is a no-op", () => {
    expect(computeFitBoundary([], 100)).toEqual({
      fits: 0,
      fitCount: 0,
      hasOverflow: false,
      trackCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/composables/useFitClamp.spec.js`
Expected: FAIL — cannot resolve `@/composables/useFitClamp.js`.

- [ ] **Step 3: Write the implementation**

`frontend/src/composables/useFitClamp.js`:
```js
import { ref, unref } from "vue";
import { useResizeObserver } from "@vueuse/core";

// Pure: given item bounds along the clamp axis (in DOM order), group them into
// tracks by shared `start` (rows of a grid / individual items of a strip), then
// return the boundary of the last track that fully fits `containerSize`.
// Never returns an empty result when items exist — the first track always shows
// so a too-small region degrades to "one partial track" instead of blank.
export function computeFitBoundary(itemBounds, containerSize, epsilon = 1) {
  if (!itemBounds || itemBounds.length === 0) {
    return { fits: 0, fitCount: 0, hasOverflow: false, trackCount: 0 };
  }
  // Group into tracks by start offset (within epsilon).
  const tracks = [];
  for (const b of itemBounds) {
    const last = tracks[tracks.length - 1];
    if (last && Math.abs(b.start - last.start) <= epsilon) {
      last.end = Math.max(last.end, b.end);
      last.count += 1;
    } else {
      tracks.push({ start: b.start, end: b.end, count: 1 });
    }
  }
  let fitTracks = 0;
  let fitCount = 0;
  for (const t of tracks) {
    if (t.end <= containerSize + epsilon) {
      fitTracks += 1;
      fitCount += t.count;
    } else {
      break;
    }
  }
  // Never blank: always show at least the first track.
  if (fitTracks === 0) {
    fitTracks = 1;
    fitCount = tracks[0].count;
  }
  return {
    fits: tracks[fitTracks - 1].end,
    fitCount,
    hasOverflow: fitTracks < tracks.length,
    trackCount: tracks.length,
  };
}

// Composable: measures `containerRef`'s children (`itemSelector`) along `axis`
// and exposes reactive clamp outputs. vueuse's useResizeObserver owns the
// observer lifecycle; this stays a thin measurement layer.
export function useFitClamp(containerRef, { axis = "block", itemSelector, isTouch }) {
  const fits = ref(0);
  const fitCount = ref(0);
  const hasOverflow = ref(false);

  const recompute = () => {
    const el = unref(containerRef);
    if (!el) return;
    const crect = el.getBoundingClientRect();
    const containerSize = axis === "inline" ? crect.width : crect.height;
    const items = Array.from(el.querySelectorAll(itemSelector));
    const bounds = items.map(it => {
      const r = it.getBoundingClientRect();
      if (axis === "inline") {
        return { start: r.left - crect.left, end: r.right - crect.left };
      }
      return { start: r.top - crect.top, end: r.bottom - crect.top };
    });
    const res = computeFitBoundary(bounds, containerSize);
    // Guard against observer feedback loops: only write on change.
    if (res.fits !== fits.value) fits.value = res.fits;
    if (res.fitCount !== fitCount.value) fitCount.value = res.fitCount;
    if (res.hasOverflow !== hasOverflow.value) hasOverflow.value = res.hasOverflow;
  };

  useResizeObserver(containerRef, recompute);

  return { fits, fitCount, hasOverflow, recompute };
}
```
> Note: `isTouch` is accepted in the option bag but not read inside the composable — callers (renderers) use it to choose clamp-vs-scroll; the composable only measures. Keeping it in the signature gives every renderer a uniform call shape. If eslint flags the unused destructured option, prefix it (`isTouch: _isTouch`) or drop it from the destructure while keeping it documented.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/composables/useFitClamp.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint (first vueuse import in the repo)**

Run: `npx eslint src/composables/useFitClamp.js`
Expected: no errors. Remove the `_unrefForTypes` export if flagged.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/composables/useFitClamp.js tests/unit/composables/useFitClamp.spec.js
git add src/composables/useFitClamp.js tests/unit/composables/useFitClamp.spec.js
git commit -m "feat(plugins): useFitClamp — clamp overflow to whole tracks (calvin-fub)"
```

---

## Task 4: Wire CardGrid to card-size vars + fit-clamp + scroll shade

**Files:**
- Modify: `frontend/src/components/plugins/renderers/CardGrid.vue`
- Modify: `frontend/src/styles/main.css` (add `.calvin-plugin-scroll-shade`)
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js` (extend)

**Interfaces:**
- Consumes: `--card-min`/`--card-pad` (Task 2), `useFitClamp` (Task 3), `useTouchCapability` (`{ isTouch }`).

- [ ] **Step 1: Write the failing tests (footprint vars)**

Append to `frontend/tests/unit/components/plugins/Renderers.spec.js` (inside a new describe):
```js
describe("CardGrid — footprint vars (calvin-fub)", () => {
  const schema = {
    kind: "card-grid",
    layout: { columns: "auto-fit-220" },
    card: { title_path: "$.day", items_path: "$.meals", item: { value_path: "$.name" } },
  };
  const data = [{ day: "Mon", meals: [{ name: "Korean Noodle Bowl with Tofu" }] }];

  it("drives the auto-fit min-width from --card-min (fallback = schema min)", () => {
    const wrapper = mount(CardGrid, { props: { schema, data } });
    const grid = wrapper.find(".card-grid");
    // The grid-template-columns must reference the CSS var so a region can override it.
    expect(grid.attributes("style")).toContain("var(--card-min");
    expect(grid.attributes("style")).toContain("220px"); // schema fallback preserved
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/plugins/Renderers.spec.js -t "footprint vars"`
Expected: FAIL — `grid-template-columns` is a literal `minmax(220px, 1fr)`, no `var(--card-min`.

- [ ] **Step 3: Consume `--card-min` in `gridStyle` and `--card-pad` on the card**

In `CardGrid.vue`'s `gridStyle` computed, change the `auto-fit-` branch:
```js
  if (typeof cols === "string" && cols.startsWith("auto-fit-")) {
    const min = cols.slice("auto-fit-".length);
    // A region's card-size control can override the min via --card-min; the
    // schema's own min stays the fallback so plugins that don't opt in are
    // unchanged.
    return { gridTemplateColumns: `repeat(auto-fit, minmax(var(--card-min, ${min}px), 1fr))` };
  }
```

In the scoped `<style>`, make card padding follow `--card-pad` (overrides the `1rem` from `.calvin-plugin-surface` via scoped specificity):
```css
.card-grid__card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow: hidden;
  padding: var(--card-pad, 1rem);
}
```

- [ ] **Step 4: Run to verify footprint test passes**

Run: `npx vitest run tests/unit/components/plugins/Renderers.spec.js -t "footprint vars"`
Expected: PASS.

- [ ] **Step 5: Add the scroll-shade utility to `main.css`**

Append near the other `.calvin-plugin-*` layout primitives:
```css
/* Edge affordance: a soft fade on the scrollable edge, shown only when content
   overflows and the surface is touch-scrollable. Direction set by the modifier. */
.calvin-plugin-scroll-shade {
  --shade: 24px;
}
.calvin-plugin-scroll-shade--block {
  mask-image: linear-gradient(to bottom, #000 calc(100% - var(--shade)), transparent);
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--shade)), transparent);
}
.calvin-plugin-scroll-shade--inline {
  mask-image: linear-gradient(to right, #000 calc(100% - var(--shade)), transparent);
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--shade)), transparent);
}
```

- [ ] **Step 6: Wire fit-clamp + touch behavior into `CardGrid.vue`**

In `<script setup>`, add:
```js
import { ref, computed } from "vue";
import { useFitClamp } from "../../../composables/useFitClamp.js";
import { useTouchCapability } from "../../../composables/useTouchCapability";

const gridEl = ref(null);
const { isTouch } = useTouchCapability();
const { fits, hasOverflow } = useFitClamp(gridEl, {
  axis: "block",
  itemSelector: ".card-grid__card",
  isTouch,
});

// Non-touch (keyboard / kiosk): clamp height to the last whole row so no partial
// card ever shows, and hide the remainder — nothing to scroll, nothing stranded
// in the tab order (card items aren't focusable). Touch: let it scroll, snapping
// to whole rows, and fade the bottom edge when there's more.
const clampStyle = computed(() =>
  isTouch.value
    ? { overflowY: "auto", scrollSnapType: "y proximity" }
    : { maxBlockSize: fits.value ? `${fits.value}px` : null, overflowY: "hidden" }
);
const showShade = computed(() => isTouch.value && hasOverflow.value);
```

Add `ref="gridEl"`, the clamp style, and shade class to the root:
```html
  <div
    ref="gridEl"
    class="card-grid calvin-plugin-grid calvin-plugin-scroll-shade calvin-plugin-scroll-shade--block"
    :class="{ 'card-grid--shaded': showShade }"
    :style="[gridStyle, clampStyle]"
  >
```

Add scoped styles so the shade only masks when active and cards snap to row starts:
```css
.card-grid:not(.card-grid--shaded) {
  -webkit-mask-image: none;
  mask-image: none;
}
.card-grid__card {
  scroll-snap-align: start;
}
```

- [ ] **Step 7: Run the full renderer suite (no regressions; `medium`/default path unchanged)**

Run: `npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS (all). jsdom has no layout, so `useFitClamp` yields `fits=0` / `hasOverflow=false` — the non-touch branch sets `maxBlockSize:null`, leaving the grid visually unchanged, so existing CardGrid tests still pass.

- [ ] **Step 8: Lint**

Run: `npx eslint src/components/plugins/renderers/CardGrid.vue`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/components/plugins/renderers/CardGrid.vue src/styles/main.css tests/unit/components/plugins/Renderers.spec.js
git add src/components/plugins/renderers/CardGrid.vue src/styles/main.css tests/unit/components/plugins/Renderers.spec.js
git commit -m "feat(plugins): card-grid honors card-size + fit-clamps rows with touch scroll (calvin-fub)"
```

---

## Task 5: Live verification (Playwright, docker dev stack)

**Files:** none (verification only). No commit unless a fix is needed.

Prereq: docker dev stack up — frontend `http://localhost:5174`, backend `http://localhost:8001`. Reuse the Part-A pattern to stand up a card-grid service: enable a `service`-type plugin whose `display_schema.kind` is `card-grid` (e.g. `mealie`), create an instance, repoint a dashboard region to it via `POST /api/config` (`dashboard_screens`), then **restore config + delete the instance + disable the plugin afterward**. If mealie needs credentials unavailable here, POST a synthetic card-grid service payload, or verify with any installed card-grid service.

- [ ] **Step 1:** Region with a card-grid service, several cards, long item names, in a **bounded** region (so it overflows). Confirm at `cardSize: medium` it matches pre-change (no regression).
- [ ] **Step 2:** Cycle the Card-size control X-Small→X-Large. Confirm columns/cards resize and long names stop clipping as size grows.
- [ ] **Step 3:** Non-touch (default `touchControls: auto` on a no-coarse-pointer browser): confirm **no partial row** — the grid clamps to whole rows; overflow rows are hidden, not clipped mid-card.
- [ ] **Step 4:** Force touch (`POST /api/config {"touchControls":"on"}`): confirm the grid **scrolls**, snaps to whole rows, and the **bottom fade** shows while more exists and clears at the end. Restore `touchControls` after.
- [ ] **Step 5:** Confirm weather-forecast is **unchanged** this PR (fast-follow scope).
- [ ] **Step 6:** Restore env: original `dashboard_screens` + `touchControlSize` + `touchControls`, delete the instance, disable the plugin. Clean up screenshots.

---

## Final gate (before opening the PR)

- [ ] `npx vitest run` — full suite green.
- [ ] `npx eslint src/ tests/` — clean.
- [ ] `git log --oneline` — four focused commits (Tasks 1-4).
- [ ] Open PR against `develop`; note weather-forecast + item-list fast-follow (calvin-fub).

---

## Self-Review Notes

- **Spec coverage:** `useFitClamp` (Task 3) ✓; scroll-shade (Task 4) ✓; per-region 5-step card size aligned to Dashboard size (Tasks 1-2) ✓; footprint = min-width + padding (Tasks 1, 4) ✓; touch-scroll vs non-touch fit (Task 4) ✓; orthogonality to Part A (Global Constraints, Task 4 note) ✓; weather/item-list deferred (Rollout, Task 5.5) ✓.
- **Drop-from-focus on non-touch:** satisfied structurally — card items carry no `tabindex`, so the `overflow:hidden` clamp removes them from view and they were never in the tab order. If card items gain focusability later, add `:tabindex="idx >= fitCount && !isTouch ? -1 : null"` using `fitCount` (already returned by `useFitClamp`).
- **jsdom caveat:** unit tests can't exercise real layout; the fit math is covered by the pure `computeFitBoundary` tests, and clamp/scroll/shade behavior is covered by the Playwright pass (Task 5). Stated in Task 4 Step 7.
- **Risk — observer loop:** `recompute` writes only to refs (not container size) and only on change (Task 3 Step 3); the clamp `max-block-size` is applied by CardGrid, and shrinking height can't grow content, so no feedback loop.
