# Calvin frontend doctrine

Status: doctrine (owner request 2026-10-31). It applies to every frontend PR, and design specs cite it instead of
re-deciding basics. Extends [2026-07-04-ui-sizing-tokens.md](2026-07-04-ui-sizing-tokens.md) (sizing mechanism,
settings zoom) and the copy rules in [2026-10-30-settings-copy-audit.md](2026-10-30-settings-copy-audit.md) §5.

## 0. Why

Things look different everywhere because:
- **There is no shared Button.** There are 61 hand-rolled button classes in 33 files (`security-btn`, `maint-btn`,
  `backup-btn`, `admin-btn`, `pc-btn`, `btn-install`, `kiosk-software__btn`, …). Specs say ".btn", which doesn't
  exist, so each builder invents one.
- **The token scales encode the old chaos.** They were created 1:1 from existing literals, so we have:
  - 13 font sizes (`--fs-3xs` 0.6 … `--fs-3xl` 1.7, plus `--fs-control` 0.875 and `--fs-control-lg` 0.9375);
  - 9 spacing steps (0.35, 0.4, 0.5, 0.6, 0.75 rem…);
  - 7 radii (6, 8, 10, 11, 12, 16px, pill).

  "Uses a token" no longer means "consistent".
- **Layout has no rules.** Settings panels have no padding, so children inset themselves (fixed for three
  components in #202), and there are 258 raw-rem paddings.

The token lint (CLV-64) stops raw colours. This doctrine stops everything else drifting.

## 1. Principles

1. **Roles, not sizes.** Components use *semantic role tokens* (`--text-label`, `--gap-inline`,
   `--radius-control`). Raw scales are primitives for `theme.css` only.
2. **One component per job.** If a control exists in `components/ui/`, use it. Feature components lay things out;
   they never restyle controls.
3. **Layout comes from primitives**: Panel, Row, ListRow, Stack. They own insets, dividers and rhythm, so a
   feature never sets padding on a child.
4. **Orange means "act here" or "selected".** Nothing else is orange.
5. **Every rule is checked by a test**, not by memory.

## 2. Tokens: three layers

All tokens are declared in `frontend/src/styles/theme.css`. Only theme.css may contain literal values.

**Primitives** (theme.css only): palettes per theme, and the existing `--fs-*`, `--space-*` and `--radius-*` scales.
Components stop referencing these (§7 migration).

**Semantic roles** (what components use):

| Family | Token | Value | Use |
|---|---|---|---|
| Type | `--text-dense` | `--fs-3xs` | calendar grid chrome only |
| | `--text-caption` | `--fs-2xs` (0.75) | tags, counts, timestamps, hints under fields |
| | `--text-meta` | `--fs-xs` (0.8) | row descriptions, secondary lines |
| | `--text-body` | `--fs-md` (0.9) | body text, control text (buttons, inputs, selects) |
| | `--text-label` | `--fs-base` (1) | row labels, list-row names |
| | `--text-title` | `--fs-lg` (1.15) | panel and dialog titles, inspector headings |
| | `--text-display` | `--fs-3xl` (1.7) | clock, lock-screen title |
| Weight | `--weight-body` / `--weight-strong` / `--weight-title` | 400 / 500 / 600 | nothing else (no 550, 650, 700, bold) |
| Space (4px grid) | `--gap-1` … `--gap-8` | 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2rem (`--gap-1`,`2`,`3`,`4`,`5`,`6`,`8`) | primitives of the roles below |
| | `--gap-tight` | `--gap-1` | icon ↔ text inside a control |
| | `--gap-inline` | `--gap-2` | between controls in a row |
| | `--gap-stack` | `--gap-3` | between stacked items in a group |
| | `--gap-group` | `--gap-4` | between groups in a panel |
| | `--gap-section` | `--gap-8` | between sections (eyebrow + panel) |
| | `--panel-pad-x` / `--panel-pad-y` | `--gap-5` / `--gap-3` | every panel child's inset (exists since #202) |
| Radius | `--radius-control` | 8px | buttons, inputs, selects, tags, list-row inner controls |
| | `--radius-card` | 12px | list rows, inner cards, popovers, sheets |
| | `--radius-panel` | 16px | settings panels, dialogs, the dashboard card chrome |
| | `--radius-round` | 999px | toggles, dots, pill indicators (status pill, connection pill) |
| Colour | `--bg-0/1/2`, `--line`, `--line-soft`, `--ink`, `--ink-2`, `--ink-3` | existing | surfaces, borders, text |
| | `--focus`, `--focus-ink`, `--focus-text`, `--focus-glow`, `--focus-edge` | existing | action and selection only (§5) |
| | `--ok`, `--warn`, `--err` (+ the `--tag-*` mix rule) | existing | status only |
| Elevation | `--elev-1` (raised: menus, popovers), `--elev-2` (dialogs, sheets) | `0 6px 18px -8px var(--shadow-hover)` / `0 18px 50px -16px var(--shadow-hover)` | nothing else casts shadows |
| Motion | `--dur-fast` 120ms, `--dur` 200ms, `--ease` `cubic-bezier(.2,.7,.2,1)` | | all transitions; zero under `prefers-reduced-motion` |
| Layers | `--z-raised` 10, `--z-sticky` 100, `--z-dialog` 1000, `--z-popover` 1050 (popovers teleport to body, so they must clear an open dialog), `--z-osk` 1100, `--z-toast` 1200 | | no other z-index values |

**Component tokens** are allowed when a component has geometry of its own. They're prefixed with the component
name and built from roles, e.g. `--tag-*`, `--toggle-*`, `--tab-height`, `--osk-height`, `--touch-target`,
`--control-height`.

Rules:
- The type roles are the whole vocabulary. If a design needs a size that isn't a role, the design changes, not the
  scale.
- `--fs-control` and `--fs-control-lg` fold into `--text-body`; `--fs-micro` into `--text-caption`; `--fs-sm` into
  `--text-body` or `--text-meta` (choose by role); `--fs-xl`/`--fs-2xl` into `--text-title`.
- Radii snap: 6→8 (`control`), 10/11→12 (`card`). The visual change is deliberate and small.

## 3. Components: one per job

`components/ui/` is the only place controls are styled.

| Job | Use | Never |
|---|---|---|
| Any button with text | **`Button.vue` (new)**: `variant` = `primary` (orange, one per view region), `secondary` (default: `--bg-2`, 1px `--line`), `ghost` (no border, `--ink-2`), `danger` (`--err` text; filled only inside a destructive confirm); `size` = `md` (`--control-height`) or `sm` (`--touch-target`); optional `icon` | a styled `<button class="foo-btn">` |
| Icon-only button | `IconButton.vue` | an emoji or letter in a styled button |
| Text link that acts | `Button variant="link"` (underline, `--ink`; `--focus-text` on hover) | `link-btn` copies |
| On/off | `ToggleSwitch` | checkbox styled as a toggle |
| One of 2–4 | `SegmentedControl` | tab-like custom groups, filter pills |
| One of many | `SelectPill` | native `<select>` |
| Many of many | `ChipMultiSelect` | checkbox rows for chips |
| Number | `NumberStepper`, `RangeSlider` | `<input type="number">` |
| Text / secret | `TextField` (new, from `PasswordField`'s shell), `PasswordField` | bare `<input>` with local styles |
| Label / status | `Tag` | badges, chips, pills |
| Settings section | `SettingsSection` (Panel) | a bordered div |
| Setting | `SettingRow` | label/description markup by hand |
| Item in a list (source, screen, key, plugin) | **`ListRow.vue` (new)**, extracted from `SourceList`: lead (dot/thumb/icon), body (name `--text-label` + meta lines), trailing actions group | per-feature cards |
| Empty | `EmptyState` | an ad-hoc centred paragraph |
| Confirm / dialog | `ConfirmModal`, `DialogScrim`; `Dialog` with `size` = `sm` / `md` (default) / **`full`** (edge-to-edge, for the pages editor; same focus trap, Escape and OSK rules) | custom overlays, hand-built full-screen shells |
| Navigation between views of the same thing (editor pages, catalog kinds) | **`Tabs.vue` (new)**: ARIA `tablist`, one line per tab (label + optional `--ink-3` meta), 2px `--focus` underline on the active tab, arrow keys move, scrolls horizontally with edge fades | local tablists, filter pills used as tabs. Choosing a *value* (Light/Dark, Month/Week) stays `SegmentedControl` |
| Small floating surface anchored to a control (⋯ menus, pickers, the connection explainer) | **`Popover.vue` (new)**: anchored, flips at viewport edges, Escape/outside tap closes, focus returns, `--elev-1`, `--radius-card`, `--z-popover`; **`Menu.vue`** on top of it for action lists (items ≥ `--touch-target`, danger item last) | per-feature popovers (SourceList ⋯, ThemePicker, ActionPicker, RegionViewOptions, ConnectionStatus) |
| Colour | **`ColourField.vue` (new)**: the theme's `--event-1…8` swatches first (radio group), then **Custom…** opening the native picker; shows the chosen swatch + name, never a raw hex field by default | a bare `<input type="color">` + hex text box |

### 3.1 Building blocks for settings (the "new setting looks out of place" fix)

A new setting must look like every other setting, because it's **built from the same blocks, with no CSS of its
own**. The blocks:

| Block | What it is | Props that cover the variations |
|---|---|---|
| `SettingsSection` | eyebrow + panel; owns inset, dividers, rhythm | `title`, `id`, `#action` slot (one secondary Button) |
| `SettingRow` | label · description · control | `label`, `description` (or `#description`), `stacked`, `#label-extra` (a `Tag`) |
| `SettingGroup` (new) | a sub-heading inside a panel (`--text-label`, sentence case) + its rows; replaces uppercase in-card labels | `title` |
| `ListRow` / `SourceList` | items with lead · body · actions | `lead`, `name`, `meta[]`, `#actions` |
| `ScopeLine` (new, from `KioskScope`) | "Same as Default" / "Changed here · Reset to default" | `overridden`, `@reset` |
| `InlineNote` (new) | the one-line note/hint/error under a row (`--text-meta`; tone `neutral`/`warn`/`err`) | `tone`, `#action` |
| `EmptyState`, `Button`, `Tag` and the `ui/` controls | see the table above | |

Rules:
1. **A settings category or tab component has no `<style>` block**, or only layout for a genuinely new arrangement,
   which then becomes a block. `controlLint` and a new `settingsNoStyle` check (allowlist, shrinking) enforce it.
2. **A new variation becomes a prop on the block**, not a local class. If a spec needs something the blocks can't
   express, the spec says so and the block grows, with a gallery entry (below).
3. **Plugin settings already work this way** (schema → `PluginFieldRenderer`). Host settings now follow the same
   discipline.

**Gallery.** `frontend/ui-gallery.html` (dev-only entry, like `renderer-gallery.html`) renders every block and `ui/`
control in every state:
- default, hover, focus, selected, disabled, error, loading, empty;
- at 1280 and 390, in light and Backlit, with the theme switcher on top.

It's the reference a builder copies from and the page a reviewer opens. A Playwright snapshot of the gallery in CI
makes any visual change to a block show up as a diff, so drift becomes visible in review instead of on the wall.

## 4. Layout rules

1. **Panel inset:** every direct child of a panel insets with `--panel-pad-x` / `--panel-pad-y`. A child that needs
   to bleed to the edge (a full-width list divider) does so explicitly, and only for its border.
2. **Dividers:** `1px solid var(--line-soft)` **between** panel children, never before the first or after the last.
   Panel owns this (`.settings-section__panel > * + * { border-top }`). Children don't draw their own outer
   dividers. This replaces ad-hoc rules like `.where-shows + .setting-row`.
3. **Row anatomy** (`SettingRow`): label (`--text-label`, `--weight-strong`) over description (`--text-meta`,
   `--ink-2`), control on the right, `--gap-group` between them. It stacks under 600px or with `:stacked`.
   Descriptions are one sentence (copy rules).
4. **ListRow anatomy:** lead · body · actions. The actions group never wraps internally. Under 600px the whole group
   moves under the body as one right-aligned line. (Today the ⋯ wraps alone; see #202.)
5. **Section rhythm:** eyebrow title (`--font-data`, uppercase, letter-spaced, `--ink-3`) outside the panel,
   `--gap-2` above the panel, `--gap-section` between sections. **Eyebrows are only for section titles**; inside a
   panel, sub-labels are `--text-label` sentence case.
6. **One primary per region:** at most one `primary` Button per panel/dialog. "Add …" in a list header is
   `secondary` unless the list is empty, where the EmptyState's button is primary.
7. **Touch:** every interactive element is ≥ `--touch-target` in both directions (use padding, not visual size).
8. **Widths:** phone (< 600) one column with a 16px page gutter; kiosk/desktop as designed. No horizontal page
   scroll ever (the e2e phone audit enforces this).

## 5. Colour and state

| State | Treatment (all controls, via `ui/`) |
|---|---|
| Hover | surface `--bg-2` → `color-mix(--ink 4%, --bg-2)`; text unchanged |
| Focus-visible | `outline: 2px solid var(--focus); outline-offset: 2px`. Never removed, never colour-only |
| Selected / on | `color-mix(in srgb, var(--focus) 16%, var(--bg-2))` fill + `--focus` border, or a filled `--focus` with `--focus-ink` text for segmented/toggle |
| Primary action | `--focus` fill, `--focus-ink` text |
| Disabled | `opacity: .5`, `cursor: not-allowed`, no hover change |
| Loading | label becomes the verb + "…" ("Saving…"), control disabled; no spinners in rows |
| Error | `--err` text line under the control (`--text-meta`), plus `aria-invalid`; never a red box |
| Status | `Tag` tones only (`ok`/`warn`/`err`) |

- **Orange (`--focus`)** is for primary actions, selection and focus only. Never use it for decoration,
  headings, dots that mean nothing, or links (links use `--ink` + underline).
- **Status colours** never decorate. A plugin type, a category or a page is never coloured.
- **No blue.** Calvin's palette has none, so a browser-default blue (checkbox, link) is a bug. Use
  `accent-color: var(--focus)`.
- Every view is checked in the 5 themes × light/dark (CLV-64 contrast test). Text pairs must hit AA.

## 6. Writing

Follow the copy rules (settings audit §5) and the no-developer-words table (#193): sentence case, one-sentence
descriptions, units on controls, plain words (screen, page, source, plugin, Calvin).

## 7. Enforcement

Tests (vitest, `tests/unit/styles/`):
1. `tokenLint` (exists): no literal colours, sizes or radii outside theme.css.
2. **`roleLint` (new)**: components may not reference `--fs-*`, `--space-*` or `--radius-{xs,sm,md,lg,xl,2xl}`
   primitives, only roles. Allowlist shrinks per migration phase; it starts with today's files and must only shrink.
3. **`controlLint` (new)**: in `<style>` blocks outside `components/ui/`, a selector that targets a `button`,
   `input`, `select` or a class containing `btn|button` may not set `background`, `border`, `border-radius`,
   `font-size`, `font-weight`, `color` or `padding`. Layout properties (margin, gap, grid, flex, width) are fine.
   Same shrinking allowlist.
4. `panelInset` (exists, #202), generalised: every component rendered as a direct panel child uses the inset tokens.
5. Weights: only `--weight-*` (no numeric font-weight outside theme.css).

Review: every UI PR attaches screenshots from the mocked e2e harness (`tests/e2e/phone/fixtures/api-mock.js`, no
backend) at 1280 and 390, light and one dark theme. The design lead reviews against this doc.

## 8. Migration

1. **Roles in, no visual change.** Add the role tokens as aliases of today's primitives (radius snaps excepted) and
   add the lints with full allowlists. One PR, mechanical.
2. **The blocks and the gallery.** Build `Button`, `TextField`, `ListRow`, `SettingGroup`, `ScopeLine`, `InlineNote`, `Popover`/`Menu`, `ColourField`, `Tabs`, the `Dialog` `full` size and
   `ui-gallery.html` first. Then replace the 61 button classes and remove settings `<style>` blocks file by file. The
   largest are Security (15 `security-btn`), Plugins (`btn-install`, `pc-btn`), System (`maint-btn`,
   `backup-btn`, `update-btn`) and Screens (`kiosk-software__btn`). Each file leaves the `controlLint` allowlist
   when done. Panel-owned dividers land here too.
3. **Roles everywhere.** Swap primitives for roles per category (Content, Dashboard, Screens, Plugins, System,
   Security, then the dashboard). Each leaves the `roleLint` allowlist. Delete the unused primitives at the end.

Open question for the owner: the toggle knob in the "on" state is `--focus-ink` (near-black in light themes) since
CLV-64. That's correct for contrast, but it reads heavy next to every other control. Keep it, or use a white knob
with a darker track?
