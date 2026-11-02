# Design: shared `ui/IconButton` primitive

**Status:** design approved; implementation pending (primitive only — no call-site migration this round).
**Bead:** `calvin-b97`. **Related:** `calvin-0wr` (service regions adopt it), `calvin-nxs` (one-off header-button fix this supersedes).
**Depends on:** the sizing-token vocabulary in `docs/design/2026-07-04-ui-sizing-tokens.md`.

## Context

The frontend has **no shared button component**. A catalog of the app found ~8 families of hand-rolled square/icon buttons spanning `28 / 32 / 44 / 46 / 48 / 64px`, square and circle, with `default / primary / ghost / danger / toggled / disabled` variants and inconsistent a11y (some `aria-label`, some `title` only). This duplication is the root cause of visible mismatches (e.g. the calendar-vs-service header buttons, `calvin-nxs`) and of the service-region drift (`calvin-0wr`).

`ui/IconButton.vue` gives these one composable primitive built on the existing sizing-token vocabulary, so buttons stop drifting and new/changed code has one obvious thing to reach for. It follows the established `ui/` primitive pattern (`ToggleSwitch`, `SegmentedControl`, `SelectPill`, `NumberStepper`).

## Scope

**In:** build and unit-test `frontend/src/components/ui/IconButton.vue` with the full API below. **Migrate zero call sites this round** — existing buttons adopt `IconButton` opportunistically via `calvin-0wr` and follow-up tranches. This keeps the change small and verifiable without live visual QA.

**Out:** the pill triggers (`SelectPill` / `ThemePicker` — composite text+swatch+chevron), the `hot-corner` (bespoke, setting-driven gradient), `ChipMultiSelect` chips, and text action buttons (`.btn-primary`/`.btn-secondary`/`.btn-danger`, `.settings-topbar__done`). These are not icon buttons.

## API

Single `<button type="button">` root, so every `aria-*` attribute (e.g. `aria-expanded`, `aria-haspopup`, `aria-pressed`) and `@click` **falls through natively** — no prop plumbing for those.

```vue
<IconButton
  label="Close"          <!-- required → aria-label -->
  variant="default"      <!-- default | primary | ghost | danger  (default: default) -->
  size="sm"              <!-- sm | md | lg                          (default: sm) -->
  shape="square"         <!-- square | circle                       (default: square) -->
  :active="false"        <!-- lit/toggled state                     (default: false) -->
  :disabled="false"      <!--                                        (default: false) -->
  @click="onClick"
>
  <svg …/>               <!-- glyph / icon slot (required content) -->
</IconButton>
```

**Props**

| prop | type | default | notes |
|---|---|---|---|
| `label` | String (required) | — | becomes `aria-label`; standardizes the a11y inconsistency |
| `variant` | String | `"default"` | one of `default`/`primary`/`ghost`/`danger`; validated |
| `size` | String | `"sm"` | one of `sm`/`md`/`lg`; validated |
| `shape` | String | `"square"` | one of `square`/`circle`; validated |
| `active` | Boolean | `false` | lit/toggled modifier (e.g. tune-active, `--on`) |
| `disabled` | Boolean | `false` | reflected to the native `disabled` attribute |

`@click` is the native button click via fallthrough; no explicit `emits` needed. Disabled buttons emit no click (native behavior).

**Size → tokens**

| size | box | font-size |
|---|---|---|
| `sm` | `min-width/height: 1.75rem` (28px) | `1.05rem` |
| `md` | `min-width/height: var(--touch-target)` (44px) | `var(--fs-xl)` (1.25rem) |
| `lg` | `min-width/height: var(--control-height)` (48px) | `1.5rem` |

**Shape:** `square` → `border-radius: var(--radius-sm)` (8px); `circle` → `border-radius: 50%`.

**Variant → token map**

| variant | rest | hover |
|---|---|---|
| `default` | bg `--bg-2`, border `--line`, color `--ink` | border `--focus-edge` |
| `primary` | bg `--focus`, color `--focus-ink`, border `--focus` | `filter: brightness(1.08)` |
| `ghost` | transparent bg, transparent border, color `--ink-2` | bg `--bg-2`, color `--ink` |
| `danger` | bg `--bg-2`, border `--line`, color `--err` | border `--err` |
| `active` (modifier) | overlays color `--focus` + border `--focus-edge` | — |

**Behavior**
- Base: `inline-flex`, centered, `cursor: pointer`, `font-family: var(--font-ui)`, `1px solid` border (color per variant), `transition: background/border-color/color .2s`.
- `:focus-visible` → `outline: 2px solid var(--focus); outline-offset: 2px`.
- `disabled` → `opacity: .5; cursor: not-allowed; pointer-events: none`.
- `@media (prefers-reduced-motion: reduce)` → `transition: none`.
- Token-based sizing means it inherits the Settings-UI-size zoom automatically.

## Deferred (noted, not built)

The `touchControlSize`-driven cluster (`RegionControls` `.cbtn`, Family D) uses sizes `36/42/50px` that don't map to `sm/md/lg`. When Family D migrates (a follow-up tranche), add a CSS-var size escape-hatch (e.g. consumer sets `style="--icon-size: …; --icon-font: …"` and a `size="custom"` reads them). Not built now (YAGNI).

## Testing (TDD)

`frontend/tests/unit/components/ui/IconButton.spec.js` (mirror existing `ui/*.spec.js`):
1. renders a `<button>` with `aria-label` = `label`.
2. applies the correct variant / size / shape / active / disabled classes for given props.
3. forwards `@click`; a disabled instance sets the `disabled` attribute and fires no click.
4. renders default-slot content.
5. `aria-expanded` (and other `aria-*`) passed by a consumer fall through to the `<button>`.

## Success criteria

- `IconButton.vue` exists, exercises every variant/size/shape/state via the token vocabulary, and passes its unit tests; lint/build green.
- No call sites changed this round; the primitive is ready for `calvin-0wr` and follow-ups to adopt.
