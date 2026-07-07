# Global fit-scroll for schema renderers (`useFitScroll`) — calvin-vmo

**Date:** 2026-07-07
**Issue:** calvin-vmo (P3) — Apply `useFitClamp` to weather-forecast + item-list renderers (calvin-fub fast-follow)
**Follows:** the card-grid fit-clamp work (calvin-fub Part B, PR #85) and the `hasPointer` capability (calvin-ohq, merged develop `7bafcdb`).

## Problem

The weather-forecast **forecast strip** (`.weather-forecast-renderer__items`) is a
horizontal day grid with `overflow-x: auto`: it plain-scrolls and, on a
keyboard-only kiosk, can strand partially-visible day columns with no way to
reach them. The card-grid already solved this class of problem on the **Y** axis
(clamp to whole rows when you can't scroll; scroll+snap+fade when you can), but
its wiring lives **inline** in `CardGrid.vue` and isn't reusable. `item-list`
has no fit handling at all.

We want one **global** mechanism — not a copy of the wiring per renderer — that
gives any schema renderer the same behavior along either axis.

## Behavior (the goal, in the user's words)

"Work like the mealie cards, but on X: let me scroll if I have touch or a
scrollwheel; clamp nicely if I'm keyboard-only."

So the scroll-vs-clamp decision keys on **`hasPointer`** (mouse *or* touch),
**not** `isTouch`:

- **`hasPointer` true** (touch or mouse/scrollwheel) → the container scrolls along
  the axis, snaps to whole tracks, and shows a soft edge-fade when there's more.
- **`hasPointer` false** (keyboard-only kiosk) → the container is clamped to the
  last whole track that fits; the remainder is hidden (nothing to scroll, nothing
  stranded — tracks aren't focusable).

**Shipped-behavior change (intended):** CardGrid currently keys this on `isTouch`,
so a **mouse desktop clamps** (overflow hidden, no scroll). Refactoring CardGrid
onto the shared composable moves it to `hasPointer`, so **mouse-desktop card grids
now scroll** instead of hiding overflow. This is deliberate — it matches "scroll
if I have a scrollwheel" and makes all three renderers consistent with the
calvin-ohq pointer model.

## Design

### Layering (unchanged core + new presentation layer)

- `computeFitBoundary` (pure) and `useFitClamp` (measurement) — **unchanged**.
  Already axis-agnostic (`axis: "inline"` = X, `"block"` = Y) and unit-tested.
- **New `useFitScroll(containerRef, opts)`** — the presentation layer over
  `useFitClamp`. It owns the pointer decision, the style/class outputs, and the
  async-data recompute. Renderers consume only this.

### `useFitScroll` API

```
useFitScroll(containerRef, {
  axis,          // "block" (Y) | "inline" (X)
  itemSelector,  // e.g. ".card-grid__card" / ".weather-forecast-renderer__item"
  data,          // getter () => props.data — drives recompute on async load
  viewport = "parent",
}) → { clampStyle, shadeClass, showShade, recompute }
```

Internals:
- `const { hasPointer } = useTouchCapability()`.
- `const { fits, hasOverflow, recompute } = useFitClamp(containerRef, { axis, itemSelector, viewport })`.
- `watch(data, () => nextTick(recompute), { deep: true })` when `data` is provided.

Outputs (axis-mapped: `inline` → X/`overflowX`/`maxInlineSize`/`scrollSnapType:"x proximity"`; `block` → Y):
- `clampStyle` — `hasPointer` → `{ overflow<X|Y>: "auto", scrollSnapType: "<x|y> proximity" }`;
  else → `{ max<Inline|Block>Size: fits ? fits+"px" : null, overflow<X|Y>: "hidden" }`.
- `shadeClass` — **additive** (no double-negative):
  `["calvin-plugin-scroll-shade", { "calvin-plugin-scroll-shade--<block|inline>": showShade.value }]`.
- `showShade` — `hasPointer.value && hasOverflow.value` (fade shows only when
  scrollable *and* there's more).
- `recompute` — for manual re-measure.

`useFitClamp`'s currently-unused `isTouch` param is dropped (cleanup — the pointer
decision now lives in `useFitScroll`).

### Per-renderer adoption

Each renderer adds, on its scrolling container: `ref`, `:class="shadeClass"`,
`:style="clampStyle"`, and **one layout rule** so items keep their natural size
along the axis (this stays per-renderer because it is layout-specific — a grid
uses `grid-auto-*`, a flex list uses `flex-shrink`):

- **CardGrid (refactor):** replace the inline `isTouch` / `clampStyle` /
  `showShade` / `watch(data)` block **and** the `card-grid--shaded` toggle +
  scoped `.card-grid:not(--shaded){mask:none}` CSS with
  `useFitScroll({ axis:"block", itemSelector:".card-grid__card", data:()=>props.data })`.
  Keep `gridAutoRows:"max-content"` in `gridStyle`. Net behavior change is only the
  `isTouch`→`hasPointer` trigger (above); the existing `grid-auto-rows` regression
  test still passes.
- **WeatherForecast:** apply `useFitScroll({ axis:"inline", itemSelector:".weather-forecast-renderer__item", data:()=>props.data })`
  to `.weather-forecast-renderer__items`. Give the strip natural column widths so
  it overflows horizontally rather than shrinking columns to fit (the X-axis
  "don't squish": `grid-auto-columns: minmax(90px, max-content)` — exact min tuned
  live). `useFitScroll` then clamps to whole columns (keyboard-only) or
  scroll+snap+inline-shade (pointer).
- **ItemList:** apply `useFitScroll({ axis:"block", ... , data:()=>props.data })`
  to its list container; ensure its rows are `flex-shrink: 0` so the list overflows
  and clamps instead of compressing rows.

### Testing

- **`useFitScroll` unit test** (`tests/unit/composables/`): mock `useTouchCapability`
  to drive `hasPointer` true/false; assert `clampStyle` shape for each axis ×
  pointer state (pointer → `overflow*:auto` + `scrollSnapType`; keyboard-only →
  `max*Size` + `overflow*:hidden`), and `shadeClass` includes the correct
  directional `--<block|inline>` modifier only when `showShade`. Use real Vue
  `ref()` in the mock (a plain `{value}` object won't unwrap — learned in
  calvin-ohq).
- **Per-renderer regression tests** (`tests/unit/components/plugins/Renderers.spec.js`):
  assert each container carries the base shade class and the clamp-style keys, and
  that the layout "don't squish" rule is present (e.g. weather strip inline style
  includes `grid-auto-columns` with `max-content`) — mirroring the existing
  card-grid `grid-auto-rows: max-content` regression test. Actual pixel clamping is
  not jsdom-testable.
- **Live verification (docker/Playwright):** the real proof.
  - **Weather strip:** keyboard-only (`touchControls=off`) → whole-column clamp, no
    partial day, no scroll; mouse/touch → horizontal scroll + snap + right-edge
    fade; the current-conditions block above stays put.
  - **CardGrid:** keyboard-only → whole-row clamp (unchanged from today); mouse **and**
    touch → vertical scroll + snap + bottom fade (mouse is the intended change).
  - **ItemList:** keyboard-only clamp; pointer scroll+shade.

## Out of scope

- The clamp algorithm (`computeFitBoundary` / `useFitClamp`) — done and tested.
- Touch/pointer detection (`useTouchCapability` / `hasPointer`) — shipped in
  calvin-ohq.
- Any renderer beyond card-grid, weather-forecast, item-list.
- Column-count / responsive redesign of the weather strip beyond the minimal
  natural-width rule needed for clamping.

## Files

| Action | File |
|---|---|
| Add | `frontend/src/composables/useFitScroll.js` |
| Add | `frontend/tests/unit/composables/useFitScroll.spec.js` |
| Edit | `frontend/src/composables/useFitClamp.js` (drop unused `isTouch` param) |
| Edit | `frontend/src/components/plugins/renderers/CardGrid.vue` (refactor onto `useFitScroll`) |
| Edit | `frontend/src/components/plugins/renderers/WeatherForecast.vue` (adopt + strip natural width) |
| Edit | `frontend/src/components/plugins/renderers/ItemList.vue` (adopt + row `flex-shrink:0`) |
| Edit | `frontend/tests/unit/components/plugins/Renderers.spec.js` (regression assertions) |
