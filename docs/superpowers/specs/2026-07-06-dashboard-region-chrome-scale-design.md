# Dashboard region-chrome scale — design

**Date:** 2026-07-06
**Bead:** calvin-6ig
**Branch:** fix/dashboard-label-scale-and-scrollbars

## Problem

Calvin is a wall-mounted panel read across a room. The "Touch target size" setting
(`touchControlSize`) is really a *dashboard legibility / reach* knob: "make the
dashboard bigger" when you're further away or want larger touch targets.

Today that intent is only half-wired, and inconsistently:

- The **floating `RegionControls` cluster** (prev/next/refresh/fullscreen) scales
  with `touchControlSize` via `--icon-size`/`--icon-font` (36/42/50px).
- The **in-header controls** — CalendarView's `‹ / Month ▸ / › / ⤢` and
  WebServiceViewer's `‹ / › / ⤢ / ×` — are a mix of glyph `IconButton`s and text
  pills (`Today`, view-switch) at **fixed** sizes that ignore the setting.
- The **labels** are ad-hoc: the calendar month-label (`.calendar-header__label`,
  `1rem`, its own CSS) versus the service title (`.dashboard-panel__title`,
  `1.5rem`, DashboardPanel). Different components, different sizes.

Net effect: labels don't follow the setting, calendar and service labels differ in
size, and header controls don't scale. A first patch attempt (PR #83 + follow-ups)
made it worse — scaling the glyph buttons but not the text pills in the same row
caused misalignment, and setting the scale vars on a two-class selector
(`.mode-content.dashboard-view`) outranked the single-class touch-size rules,
pinning everything to medium (a CSS specificity inversion).

There is also a **nonsensical `×` "Close" button** on the service widget: on a
permanent wall panel there is no window to close (it silently returns to calendar
mode).

## Goal

Make `touchControlSize` one coherent scale that moves **all region chrome**
together — region labels, every header control (glyph + text pills), and the
floating cluster — so the whole dashboard grows/shrinks as one unit. The clock bar
is explicitly **out of scope** (it keeps its own dedicated font-size settings).

## Decisions (agreed in brainstorming)

1. **Unify all region chrome** under one scale (labels + header controls + floating
   cluster). Clock bar separate.
2. **Baseline: medium ≈ today.** The medium preset stays close to today's look;
   only the other presets deviate. (Labels *do* change from today because they get
   unified — see #4.)
3. **Five presets now:** `xsmall / small / medium / large / xlarge`. Keeps the
   existing `small/medium/large` values valid (no migration for current configs);
   adds `xsmall` + `xlarge`.
4. **Unified label size.** Calendar month-label and service title share one size
   token; medium ≈ 1.25rem. **Same size, different emphasis:** the calendar keeps
   its display face + heavier weight so live data still reads at a glance.
5. **Proportional scale** — rail-height : label : glyph are locked in ratio; a
   preset slides the whole ratio, so no preset can look mis-proportioned.
6. **The control rail:** every control in a region header snaps to **one shared
   row-height = the rail height (touch target)**. Alignment is structural, not
   hand-tuned. Header glyph buttons grow from today's 28px to the rail height
   (42px medium) — intentional; they become real touch targets matching the cluster.
7. **One source of truth:** the scale tokens are computed once and applied on the
   dashboard root as an inline `:style` (not class rules — sidesteps the specificity
   trap). The floating cluster drops its local sizing and inherits the same tokens.
8. **Remove the `×` "Close"** on the service widget + its now-orphaned handler.

## The scale

| Preset  | Rail height (touch target) | Label    | Glyph    |
|---------|----------------------------|----------|----------|
| X-Small | 30px                       | 1.0rem   | 0.85rem  |
| Small   | 36px                       | 1.1rem   | 0.95rem  |
| Medium  | 42px                       | 1.25rem  | 1.05rem  |
| Large   | 50px                       | 1.5rem   | 1.25rem  |
| X-Large | 58px                       | 1.7rem   | 1.4rem   |

Subtitle size derives from the label (≈ 0.66×) via its own token so it tracks the
same ratio.

## Architecture

### Single source: a scale module + inline vars

`frontend/src/styles/regionChromeScale.js` (new) — the one place the numbers live:

```js
export const REGION_CHROME_SCALE = {
  xsmall: { rail: "30px", label: "1.0rem",  sublabel: "0.7rem",  glyph: "0.85rem", content: "0.85rem" },
  small:  { rail: "36px", label: "1.1rem",  sublabel: "0.75rem", glyph: "0.95rem", content: "0.92rem" },
  medium: { rail: "42px", label: "1.25rem", sublabel: "0.85rem", glyph: "1.05rem", content: "1.0rem"  },
  large:  { rail: "50px", label: "1.5rem",  sublabel: "0.95rem", glyph: "1.25rem", content: "1.12rem" },
  xlarge: { rail: "58px", label: "1.7rem",  sublabel: "1.05rem", glyph: "1.4rem",  content: "1.25rem" },
};
export const REGION_CHROME_SIZES = Object.keys(REGION_CHROME_SCALE); // order = UI order
export const DEFAULT_REGION_CHROME_SIZE = "medium";

// CSS custom properties for a given size. Includes IconButton size="custom"
// compat vars (--icon-size / --icon-font) so glyph buttons need no other change.
// --region-content-fs is set now (ready for the phase-2 renderer adoption) but
// no built-in renderer consumes it yet in phase 1.
export function regionChromeVars(size) {
  const t = REGION_CHROME_SCALE[size] ?? REGION_CHROME_SCALE[DEFAULT_REGION_CHROME_SIZE];
  return {
    "--region-rail-h": t.rail,
    "--region-label-fs": t.label,
    "--region-sublabel-fs": t.sublabel,
    "--region-glyph-fs": t.glyph,
    "--region-content-fs": t.content, // reserved for phase 2 (renderer bodies)
    "--icon-size": t.rail,   // IconButton size="custom" box
    "--icon-font": t.glyph,  // IconButton size="custom" glyph
  };
}
```

Applied once on the dashboard root in `views/Dashboard.vue`:

```html
<div class="mode-content dashboard-view ..." :style="regionChromeVars(configStore.touchControlSize)">
```

Inline style beats any descendant class cascade → no specificity fights. All tokens
inherit down to every region header and to the floating cluster.

### Consumers

- **`DashboardPanel.vue`** — `.dashboard-panel__title` → `var(--region-label-fs)`;
  `.dashboard-panel__subtitle` → `var(--region-sublabel-fs)`. Fallbacks keep
  non-dashboard uses at today's sizes. (The portrait `clamp()` ceiling reads the
  var too.)
- **`CalendarView.vue`** — `.calendar-header__label` → `var(--region-label-fs)`
  (keeps display face + weight). The three header glyph `IconButton`s → `size="custom"`.
  The text pills `.calendar-header__view-switch` and `.calendar-header__today` →
  `height: var(--region-rail-h)`; the `CalendarViewOptions`/`RegionViewOptions`
  trigger → also the rail height. Everything in the row shares one height.
- **`WebServiceViewer.vue`** — the three header glyph `IconButton`s → `size="custom"`.
  **Remove** the `×` Close `IconButton` and the now-unused `handleClose` (keep
  `close()`, still used by fullscreen exit).
- **`RegionControls.vue`** (the floating cluster) — delete the local
  `.region-controls--{small,medium,large}` `--icon-size`/`--icon-font` rules and the
  `sizeClass`; it now inherits the same `--icon-size`/`--icon-font` from the
  dashboard root. One source of truth.

### Config + settings (5 presets)

- **`stores/config.js`** — `touchControlSize` default stays `"medium"`. Add a
  guard/normalizer so an unknown value falls back to `medium`.
- **`stores/configRegistry.js`** — `touchControlSize` entry: extend allowed values
  to the five sizes (keys unchanged).
- **Backend** — wherever the config enum is validated for `touchControlSize` (or
  `touch_control_size`), extend to the five values. If it is a free string today,
  no backend change is needed; confirm during implementation.
- **`settings/categories/DisplaySettings.vue`** — swap the 3-segment
  `SegmentedControl` for a `SelectPill` with five options: X-Small / Small / Medium
  / Large / X-Large. Update the row description to say it scales the whole dashboard
  (labels + controls), not just the buttons. (Rename of the setting label to
  "Dashboard size" is noted as a *future* nicety, not in this change.)

## Reconciliation with committed PR #83

This branch already has commit `dbbec3f` (PR #83, later merge-reverted-in-tree):
themed scrollbars (`base.css`), the unlock-banner clip fix
(`.dashboard-view--unlocked` bottom padding), a first-pass DashboardPanel title var,
the `.dashboard-view--touch-*` classes, and `DashboardLabelScale.spec.js`.

- **Keep:** themed scrollbars, unlock-banner clip fix. They are correct and
  independent.
- **Replace:** the `.dashboard-view--touch-*` class-based token approach → the
  inline `:style` single-source approach (fixes the specificity inversion).
- **Update:** `DashboardLabelScale.spec.js` to assert the new mechanism.

## Testing

- **Unit:** `regionChromeScale.js` — `regionChromeVars(size)` returns the right vars
  for each of the five sizes and falls back to medium for unknown input.
- **Unit:** Dashboard applies the inline vars from `configStore.touchControlSize`
  (extend/replace `DashboardLabelScale.spec.js`).
- **Unit:** config normalizer accepts the five values, rejects/falls-back others.
- **Visual (Playwright, live dev server):** across all five presets and at least two
  region widths, confirm (a) calendar + service labels are equal size and scale,
  (b) all header controls share one row height and stay aligned, (c) the floating
  cluster matches the header buttons, (d) no `×` on the service widget.

## Risks

- **Header overflow at large/xlarge on a narrow region:** six ~50–58px controls in
  one row may overflow. Mitigation decided after seeing it live — options: allow the
  control row to wrap, tighten the gap, or hide the lowest-priority control (`Today`)
  at the biggest presets. The label already ellipsizes. Verify with Playwright and
  handle before finishing.
- **Backend enum:** if `touchControlSize` is validated as a 3-value enum server-side,
  the two new values must be added or writes will 422. Confirm early.

## Phase 2 (follow-up, separate spec/plan)

Scale **plugin body content** so the whole dashboard grows as one unit, not just the
chrome. Reuses this same scale module — `regionChromeVars` already emits
`--region-content-fs` on the dashboard root, so phase 2 is purely renderer adoption:

- The built-in schema renderers (`card-grid`, `item-list`, `metric-dashboard`,
  `weather-forecast`, `status`, `image-with-caption`) set their body/base
  `font-size` from `var(--region-content-fs, 1rem)` and use `em`-relative sizing
  internally so everything tracks proportionally.
- **Hard limits (documented, not solved):** `iframe` plugins are sandboxed external
  pages we cannot restyle; `web-component` plugins ship their own CSS and would have
  to opt in via their `.data` payload. Phase 2 covers built-in renderers only.

Kept as a separate phase so phase 1 (chrome) can be verified end-to-end first and
each PR stays reviewable. The token landing in phase 1 means no rework — renderers
just start reading a var that already exists.

## Out of scope

- Clock bar sizing (separate settings).
- Renaming the setting to "Dashboard size" (future).
- Scaling `iframe` / `web-component` plugin internals (not reachable).
- Any photo-region chrome beyond what shares DashboardPanel/RegionControls.
