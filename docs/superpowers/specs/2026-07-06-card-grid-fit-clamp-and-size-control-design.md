# Card-grid fit-clamp + per-region card size — design

**Status:** approved design, pre-implementation
**Issue:** calvin-fub (Part B) — follow-on to calvin-6ig / PR #83 (chrome scale) and
PR #84 (content scale, Part A)
**Date:** 2026-07-06

## Problem

Two user-reported symptoms, one root cause:

1. **Mealie card-grid clips.** Long recipe names (e.g. "Korean Noodle Bowl with
   Tofu") get cut off mid-item. The full text is in the DOM.
2. **Weather forecast (yr) cuts off a partial day** at the edge of the scroller.

Root cause is **partial-item overflow**, not a card bug. The region host
(`.dashboard-panel__body`: `flex:1; min-height:0; overflow:hidden`) gives the
renderer a bounded height and clips whatever spills. `CardGrid.vue` itself has
**no fixed row height** — the grid is `height:100%; align-content:start`, so extra
rows just overflow the panel and get chopped. The weather forecast row
(`grid-auto-flow:column; overflow-x:auto`) scrolls on touch but has no whole-day
clamp and no keyboard story.

The same problem appears on two axes:

| Renderer | Layout | Overflow axis | Unit to clamp |
|---|---|---|---|
| `card-grid` | 2D `auto-fit` grid | vertical | whole **row** |
| `weather-forecast` | 1D column strip | horizontal | whole **day** |
| `item-list` | 1D column list | vertical | whole **row** |

So it is a **global** concern, worth one shared mechanism — not a per-plugin fix.

## Goals

- Never show a partially-clipped item. Show only the whole items/rows that fit.
- **Non-touch (keyboard / Pi kiosk):** fit-without-scroll — clamp to what fits, no
  hidden-but-reachable content, no scroll the keyboard can't drive.
- **Touch:** scroll to reveal the rest, with a visible affordance that more exists.
- Give the user a **card-size** lever (per region) so they can trade card footprint
  against how many fit — directly addressing the mealie clipping.
- Keep it reusable: card-grid first this PR, weather-forecast + item-list next.

## Non-goals

- Changing plugin **data** (the renderer still receives everything; we clamp
  *display*, not the payload).
- iframe / web-component renderers (out of reach, as in Part A).
- Text scaling — that is Part A (`--region-content-fs`), orthogonal to footprint.
- A keyboard scroll-into-view mode. We chose fit-without-scroll on non-touch, so
  the keyboard never needs to drive a scroll.

## Design

### 1. `useFitClamp` composable (the global primitive)

`frontend/src/composables/useFitClamp.js`

```
useFitClamp(containerRef, { axis, itemSelector, isTouch }) -> { fits, hasOverflow }
```

**Build on `@vueuse/core`** (already a dependency, `^10.7.0`; this is its first use
in the repo, so keep it idiomatic and self-contained):

- `useResizeObserver(containerRef, recompute)` for container/content-size changes —
  no hand-rolled `ResizeObserver` lifecycle or teardown.
- `useScroll(scrollEl)` for the touch path: its `arrivedState` drives whether the
  edge affordance shows (fade hidden once scrolled to the end).
- Touch is passed in as `isTouch` (option) so the composable stays pure/testable;
  the caller supplies it from Calvin's existing `useTouchCapability` — no second
  source of truth.
- `useFitClamp` stays a thin measurement layer: vueuse handles the observing/scroll
  plumbing; the composable owns only the track-grouping math and the two outputs.

- Observes the container via `useResizeObserver` and recomputes on content change.
- Measures item/track boundaries along `axis` (`"block"` = vertical rows,
  `"inline"` = horizontal items). For the 2D grid it groups children by their
  cross-axis start offset into **rows/tracks**, then walks tracks accumulating
  size until the next track would exceed the container.
- Emits:
  - `fits` — the block/inline size of the last fully-fitting track boundary.
  - `hasOverflow` — whether any item/track was left out.
- **Behavior wiring (in the renderer, driven by the composable):**
  - **Non-touch:** set `max-block-size: fits` (or `max-inline-size` for horizontal)
    on the scroll element + `overflow:hidden`. Partial track never renders.
    Clamped-away items are not focusable (keyboard nav cycles only what shows).
  - **Touch:** `overflow-*:auto` + `scroll-snap-type` with snap points at track
    starts, so a swipe lands on whole items. Show the edge affordance when
    `hasOverflow`.

Pure measurement + a couple of reactive outputs; no renderer-specific logic lives
in the composable. Each renderer passes its own `itemSelector` and `axis`.

### 2. Edge affordance (touch only)

A CSS-only fade/shade on the scrollable edge (bottom for vertical, right for
horizontal), shown only when `hasOverflow && isTouch`. A shared
`.calvin-plugin-scroll-shade` utility in `main.css` (mask-image / gradient) so
every renderer gets the same affordance. No arrows — the fade reads as "more below/
beside" and matches the quiet aesthetic.

### 3. Per-region card-size control

Reuses the existing per-region view mechanism end-to-end — no new surface.

- **UI:** add a second row to `ServiceRegionViewOptions.vue` — a "Card size" control
  next to the existing "Link behavior" row, shown under the same
  `focused && isLinkCapable` condition (card-grid / item-list). It uses the **same
  5-step scale as the global "Dashboard size" setting** so the two align:
  `xsmall / small / medium / large / xlarge` → labels `X-Small / Small / Medium /
  Large / X-Large` (identical to `DisplaySettings.vue`'s Dashboard-size `SelectPill`).
  In the narrow tune popover the five options may stack/wrap (or reuse the compact
  `.svo-seg` style at five items) — a layout detail for the plan; the **scale keys
  and labels match Dashboard size exactly**.
- **Persistence:** `configStore.updateRegionView(regionId, { cardSize })` — the
  generic per-region `view` patch already used for `linkAction`
  (`utils/layout.js:setRegionView`). Absent = default (`medium`).
- **Plumbing:** the region's `view` object already flows to `WebServiceViewer`
  (that is how `linkAction` reaches the renderer today). Derive `cardSize` from
  `view` and pass it to the card-grid the same way `linkAction` is passed, or set a
  `--card-min` / `--card-pad` CSS var on the region so `CardGrid` reads it with a
  sensible default. CSS-var is preferred: zero prop threading, and a plain default
  keeps card-grid unchanged when no region drives it.

**Size scale (footprint + internal padding), 5 steps aligned with Dashboard size.**
Mirrors `regionChromeScale.js`: a parallel `frontend/src/styles/cardSizeScale.js`
module exporting the scale, `DEFAULT_CARD_SIZE = "medium"`, and
`cardSizeVars(size)` → `{ "--card-min", "--card-pad" }` (same shape/pattern as
`regionChromeVars`). `medium` equals today's card-grid default (`auto-fit-220`,
`1rem` padding) so it is a no-op — exactly how Dashboard-size `medium` leaves chrome
unchanged.

| size | `--card-min` | `--card-pad` |
|---|---|---|
| xsmall | 160px | 0.6rem |
| small | 190px | 0.8rem |
| medium (default) | 220px | 1rem |
| large | 260px | 1.2rem |
| xlarge | 300px | 1.4rem |

`CardGrid`'s `gridStyle` already supports `auto-fit-<min>`; the size control
overrides the effective min-width via `--card-min` (fallback = the schema's own
`layout.columns`, so a plugin that pins columns still wins). Padding rides a
`--card-pad` var on `.card-grid__card`. Bigger cards ⇒ fewer columns ⇒ each card
gets more room ⇒ long names fit; combined with fit-clamp, the grid then shows only
the whole rows that fit.

## Interaction with Part A (content scale)

Orthogonal levers, no double-scaling:

- **Part A / Dashboard size** scales **text** (`--region-content-fs`, em internals).
- **Part B / Card size** scales **footprint** (column min-width + padding).

A card can be text-large (Dashboard size) and footprint-small (Card size)
independently. The fit-clamp measures the *rendered* result of both, so it stays
correct whichever the user changes.

## Testing

- **Unit — `useFitClamp`:** given a mocked container + items of known sizes, asserts
  `fits` lands on the correct whole-track boundary and `hasOverflow` flips. Cover
  vertical (rows) and horizontal (items), and the exact-fit (no overflow) case.
- **Unit — `ServiceRegionViewOptions`:** the Card-size segmented control calls
  `updateRegionView(regionId, { cardSize })` with the right value; reflects current
  `view.cardSize`; default when absent.
- **Unit — `CardGrid`:** honors `--card-min` / `--card-pad`; falls back to the
  schema's `layout.columns` when no region var is set.
- **Visual (Playwright, live):** with a card-grid service in a bounded region,
  across S/M/L and at least two region heights: (a) no partial row ever shows on
  non-touch; (b) touch shows the scroll shade and snaps to whole rows; (c) long
  names stop clipping as size increases; (d) weather-forecast unaffected this PR.

## Rollout

- **This PR:** `useFitClamp` + `.calvin-plugin-scroll-shade` + card-grid wiring +
  card-size control. Proves the primitive end-to-end on the 2D case.
- **Fast follow (separate PR, same calvin-fub):** apply `useFitClamp` to
  `weather-forecast` (horizontal, whole days) and `item-list` (vertical). No new
  primitive — just wiring + each renderer's `itemSelector`/`axis`.

## Risks

- **2D row grouping:** grouping `auto-fit` children into rows by offset must be
  robust to sub-pixel rounding and `gap`. Mitigate with an epsilon on the cross-axis
  offset comparison; unit-test the grouping.
- **Measure/observe loops:** `ResizeObserver` writing styles that resize the
  container can loop. Clamp writes to a single `max-*-size` var and guard against
  re-triggering (write only when the computed value changes).
- **Empty / single-item:** `hasOverflow=false`, `fits=natural` — no clamp, no shade.
- **Keyboard reachability on non-touch:** clamped-away cards must be removed from the
  focus order so arrow-nav doesn't jump to an invisible card. Verify in the visual
  pass.
