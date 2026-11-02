# Regions editor: IconButton adoption + header de-crowd

**Date:** 2026-07-04
**Beads:** `calvin-4d2` (stage 5), depends on `calvin-b97` (IconButton primitive, now merged).
**Branch:** `feat/regions-editor-iconbutton` (off `develop`).

## Goal

Bring `frontend/src/components/settings/shared/DashboardRegionsEditor.vue`'s hand-rolled
glyph buttons onto the shared `ui/IconButton` primitive, de-crowd the screen-card header,
and remove the redundant "Activate" control. Purely a cohesion/consolidation pass — no new
behaviour, no changes to `IconButton` itself or other call sites.

## Context

`IconButton` (merged in PR #69) is the shared square/icon-button primitive:

- Props: `label` (required → `aria-label`), `variant` (`default`/`primary`/`ghost`/`danger`),
  `size` (`sm` = 1.75rem/28px, `md` = `--touch-target`/44px, `lg` = `--control-height`/48px),
  `shape` (`square` → `--radius-sm`, `circle` → 50%), `active`, `disabled`.
- Single `<button>` root, so `@click` and any `aria-*`/`title` **fall through natively**.
- All sizes are rem/token-based, so buttons **scale with "Settings UI size"** via the
  `.settings-scale` zoom the editor already sits inside. No fixed-size / touch-target
  decision is needed — `sm` is the baseline and the zoom carries it.

## Scope

**In:** `DashboardRegionsEditor.vue` only.
**Out:** the `IconButton` primitive, other call sites (separate tranches, e.g. `calvin-0wr`),
text action buttons, the component-picker dropdown trigger, drag tokens, resize handles.

## Design

### 1. Remove the "Activate" control

Screen switching + "which screen is live" is handled on the dashboard clock-bar dots
(`ScreenDots`), so the editor's per-screen `Activate`/`● Active` button is redundant.

- Delete the `.screen-activate` button markup and its `.screen-activate*` CSS.
- Delete the now-unused `isActiveScreen` and `activateScreen` (used only by that button).
- Keep the `activeScreenId` data field — still maintained by `addScreen`/`deleteScreen`
  and used to auto-expand the currently-live screen on open (a subtle implicit cue). No
  explicit active indicator is added to the editor.

### 2. Glyph buttons → `IconButton size="sm"` square

Preserve each button's existing `aria-label`, `@click`(`.stop` where present), `title`,
and `aria-expanded`, so behaviour and tests are unchanged.

| Button (glyph) | Current class | IconButton props |
|---|---|---|
| Screen collapse `▾/▸` | `.screen-collapse-toggle` | `variant="ghost"` `size="sm"` |
| Screen direction `▭▭/▯\|▯` | `.direction-toggle` | `variant="default"` `size="sm"` |
| Sub direction `▭▭/▯\|▯` | `.split-toggle` (glyph use) | `variant="default"` `size="sm"` |
| Screen delete `×` | `.screen-delete` | `variant="danger"` `size="sm"` |
| Region delete `×` | `.region-delete` | `variant="danger"` `size="sm"` |
| Sub delete `×` | `.region-delete` | `variant="danger"` `size="sm"` |

Collapse and direction toggles swap their glyph content between two states (they are not
IconButton `active` toggles); no `active` prop is used.

**Stay as text buttons (unchanged):** `+ Region`, `+ Sub`, `Split`/`Unsplit`. `IconButton`
excludes text buttons and no shared text-button primitive exists.

### 3. De-crowd the screen-card header

Split `.screen-card-header` into two flex groups:

- `.screen-header-identity` — `[collapse] [index] [name input]`, grows to fill.
- `.screen-header-actions` — `[+ Region] [direction] [× delete]`, pushed right
  (`margin-left: auto`), preceded by a subtle vertical divider (`border-left: 1px solid
  var(--line)`) with a consistent gap.

Uses existing spacing/radius tokens (`--space-*`, `--radius-*`); no new hardcoded px.

### 4. CSS cleanup

Delete the bespoke button CSS fully replaced by `IconButton`: `.screen-collapse-toggle`,
`.direction-toggle`, `.screen-delete`, `.region-delete`, `.screen-activate*`. Keep
`.split-toggle` (still used by the text `Split`/`Unsplit`) and the text-button styles.

## Testing

TDD, mirroring `tests/unit/components/DashboardDisplayTabs.spec.js`:

1. **`@click.stop` fallthrough** — write this first (the one real risk): a region-level
   delete `IconButton` must fire `removeRegion` AND not bubble a region-select click.
   Confirm `@click.stop` composes through `IconButton`'s single-root fallthrough.
2. **aria-label preservation** — existing finders (`[aria-label="Delete screen 1"]`,
   `[aria-label="Delete Region 2"]`, collapse/expand labels) still resolve to the rendered
   `IconButton` `<button>`; existing assertions keep passing.
3. **Activate removed** — assert no `Activate`/`is active` control renders; remove the
   old Activate assertions.
4. Full frontend suite green; lint/prettier clean.

Manual: live-verify in the running app at default Settings UI size and a larger preset
(buttons scale proportionally; header groups read cleanly; delete/direction/collapse work;
region-select still works when clicking a delete button does not select the region).

## Risks

- **`@click.stop` through `IconButton`** — primary risk; covered by test #1 first.
- **Double-binding `disabled`/`aria-label`** — `IconButton` declares these as props, so
  passing them routes to the prop (not fallthrough); no conflict. Glyph buttons here use
  `v-if` rather than `disabled`, so this is largely moot.

## Success criteria

- All editor glyph buttons render via `IconButton`; bespoke button CSS deleted.
- Activate control gone; `activeScreenId` still maintained; live screen auto-expands.
- Header reads as identity vs actions groups; scales with Settings UI size.
- Zero behaviour change beyond Activate removal; full suite + lint green; visually verified.
