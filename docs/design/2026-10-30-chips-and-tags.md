# Chips, tags and page tabs

Status: spec. Mockup: [mocks/chips/chips.html](mocks/chips/chips.html), PNGs `mocks/chips/png/t1.png`, `t2.png`.
Frontend only, no behaviour change.

## 1. What's wrong

There are about 20 hand-rolled chip/badge/pill styles. Together they use six radii (4px, `--radius-sm`, 11px, 12px,
20px, pill), font sizes from 0.62rem to 14px, and weights from 400 to 700:
- `event-detail__tag`, `api-keys__chip`, `tab-badge`, `sre-orient-badge`, `setting-scope-chip`;
- `.chip` in RegionInspector and in ScreenInspector;
- `instance-count-badge`, `pi-count`, `theme-badge-small`, `theme-selected-badge`, `pc-badge`;
- `plugin-type-badge-small`, `plugin-installed-badge`, `kbt-conflict-badge`, `cvo-default-chip`, `screen-card__badge`, …

Worst cases:
1. **Editor page tabs** (`.sre-tab`, mock T1 "before"):
   - a pill holding two lines ("Home" / "All screens");
   - an orange square dot on every tab that means nothing;
   - the active state is only a white fill with a shadow on a near-white background;
   - **+** is a dashed circle;
   - two lines in a rounded pill look cramped and wobble in height.
2. **Inspector headings as chips**: `Page settings` and `Region in "Home"` use a bold, letter-spaced, uppercase pill
   as the heading (`.chip.screen`, `.chip.region` with `--focus-glow`). A heading shouldn't look like a tag.
3. **Plugin type badges** (`plugin-type-badge-small.type-*`) use hard-coded Material colours (`#e3f2fd`/`#1976d2` …).
   They ignore the theme and break in Backlit. A type is not a status, so it shouldn't be coloured.
4. `color: white` / `font-weight: bold` literals (`tab-badge`, `theme-selected-badge`) instead of tokens.
5. **The mono uppercase eyebrow inside cards** ("PAGES SHOWN", "START PAGE" in the screen page) uses the same style as
   the section titles outside the cards, so the hierarchy flattens. 19 uppercase rules exist in settings alone.

## 2. One `Tag` component

`frontend/src/components/ui/Tag.vue`, a non-interactive label: `<span class="tag" :class="[tone, {count}]">`.

| Prop | Values | Default |
|---|---|---|
| `tone` | `neutral`, `ok`, `warn`, `err`, `focus` | `neutral` |
| `count` | boolean: tabular mono digits, min-width = height, centred | false |
| `icon` | an mdi path, 12px, before the text | none |

**Tokens first.** Add a tag block to `frontend/src/styles/theme.css` (shared by both themes; only the colour tokens
differ per theme):

```css
--tag-height: 1.25rem;            /* 20px */
--tag-pad-x: var(--space-xs);
--tag-gap: var(--space-2xs);
--tag-radius: var(--radius-sm);
--tag-fs: var(--fs-2xs);
--tag-weight: 500;
--tag-tint: 10%;                  /* tone background mix */
--tag-edge: 35%;                  /* tone border mix */
--tag-ink: 75%;                   /* tone text mix toward --ink */
```

`Tag.vue` uses **only** these and the existing colour tokens (`--ink-2`, `--line`, `--ok`, `--warn`, `--err`,
`--focus`, `--ink`, `--font-ui`, `--font-data`). It has no hex, rgb or px literals.

Base style (all tones):
- `display: inline-flex; align-items: center; gap: var(--tag-gap)`;
- `height: var(--tag-height); padding: 0 var(--tag-pad-x); border-radius: var(--tag-radius)`;
- `font: var(--tag-weight) var(--tag-fs)/1 var(--font-ui)`, no uppercase, no letter-spacing;
- `white-space: nowrap`.

Tones:
- **neutral**: `color: var(--ink-2)`, `border: 1px solid var(--line)`, `background: transparent`.
- **ok / warn / err / focus**:
  - `color: color-mix(in srgb, var(--{tone}) var(--tag-ink), var(--ink))` (keeps ≥ 4.5:1 on `--bg-1` in both themes);
  - `background: color-mix(in srgb, var(--{tone}) var(--tag-tint), transparent)`;
  - `border: 1px solid color-mix(in srgb, var(--{tone}) var(--tag-edge), var(--line))`.
- **count**: `font-family: var(--font-data)`, `font-variant-numeric: tabular-nums`, `min-width: var(--tag-height)`,
  `justify-content: center`, padding `0 var(--space-2xs)`.

**Mapping** (replace each with `<Tag>`; delete the old CSS):

| Old | New |
|---|---|
| `setting-scope-chip` (This screen) | `Tag` neutral |
| `pc-badge`, `plugin-type-badge-small.type-*` (plugin kind) | `Tag` neutral, plain kind words. **No per-type colours** |
| `plugin-installed-badge` | `Tag` ok **Installed**; `.plugin-update-available` → `Tag` warn **Update** |
| `api-keys__chip` / `--host` | `Tag` neutral / `Tag` err with ⚠ icon |
| `instance-count-badge`, `pi-count`, `tab-badge` | `Tag count` (active tab: tone focus) |
| `kbt-conflict-badge` | `Tag count tone="warn"` |
| `theme-badge-small` | `Tag` neutral |
| `event-detail__tag` | `Tag` neutral (it stays mono only if it's an id; otherwise UI font) |
| `sre-orient-badge` | `Tag` neutral |
| `screen-card__badge` (warn text) | `Tag` warn |

**Not tags** (interactive; they keep their components): `ChipMultiSelect` toggle chips, `SegmentedControl`, filter
rows, `SelectPill`. `theme-selected-badge` (✓ on a theme card) stays a round check, using `--focus`/`--focus-ink`
tokens instead of `white`. `ConnectionStatus` and the settings top-bar save pill stay pills: they're status
*indicators* with their own specs.

### 2.1 Token rule for the touched components

Every component this spec touches (the tag call sites, `.sre-tab*`, the inspector headings, `ThemeSelector`,
`PluginInstaller`, `PluginCard`, `TabNavigation`, `KeyBindingTile`, `CalendarViewOptions`) leaves with:
- no hex/rgb/hsl colour literals and no `white`/`black` (use `--focus-ink`, `--ink`, `--bg-*`);
- no `font-weight: bold` (use 600) and no raw `font-size` in px/rem (use `--fs-*`);
- radii only from `--radius-*` (or `--tag-radius`), spacing from `--space-*`.

Tab sizes use tokens too: add `--tab-height: 2.75rem` (= `--touch-target`) and `--tab-indicator: 2px`.

## 3. Editor page tabs (mock T1)

Underline tabs, one line each:
- The row is 44px tall, with `border-bottom: 1px solid var(--line)` across the context strip. Tabs scroll
  horizontally when they overflow, with fade masks at the ends.
- A tab is a `<button role="tab">`: padding 0 12px, height 44px, no background, no border, no radius.
  - **Name**: `--fs-sm`, 500, `--ink-2`.
  - **Where it shows**, on the same line after 8px: `--fs-xs`, 400, `--ink-3`. Text is **Kitchen, Hallway** or
    **All screens**, or **Not shown** in `--warn`-mixed ink. Truncated with an ellipsis at 16ch; the full text is in
    `title` and in the accessible name: "Home, shown on Kitchen and Hallway".
  - Hover: name `--ink`.
  - **Active**: name `--ink`, 600; a 2px `--focus` bar on the bottom edge (inset 0 12px); `aria-selected="true"`.
  - Dimmed (not on the previewed screen, #156 §3.4): 50% opacity, unchanged.
- The orange square dot is removed.
- **+ Page**: a ghost text button at the end of the row: `mdiPlus` 16px + **Page**, `--ink-2`, height 44. Not a
  dashed circle. `aria-label="Add page"`.
- On phone (CLV-47 Phone class), the screens text drops; the name stays.

## 4. Inspector headings (mock T1)

Replace the chip-heading with a real heading:
- Page selected: `<h3>` **Page** (`--fs-md`, 600, `--ink`), then on the same line `--fs-sm` `--ink-3` **· Home**.
- Region selected: `<h3>` **Region** + **· in Home**.
- Clock bar selected: **Clock bar** + **· on Home**.

The `.chip.screen` / `.chip.region` CSS is deleted.

## 5. Eyebrows

The mono uppercase eyebrow (`--font-data`, uppercase, letter-spaced) is **only** for section titles *outside*
cards (the `SettingsSection` title, the editor's stage tag). Inside a card, sub-labels use the normal field-label
style (`--fs-sm`, 600, `--ink`, sentence case): for example **Pages shown**, **Start page** on the screen page, and
**Shows**, **Calendar** in the region inspector. Audit the 19 `text-transform: uppercase` rules under
`components/settings`, keep only section titles and the stage tag, and convert the rest.

## 6. Tests (vitest)

- `Tag`: renders each tone's class, count sets mono and min-width, icon renders, no uppercase style.
- Token lint (a vitest that reads the touched `.vue` files): no hex/rgb/hsl colour literals, no `white`/`black`, no
  `font-weight: bold`, and no px/rem `font-size` in their `<style>` blocks. `Tag.vue` uses only `var(--tag-*)` and
  colour tokens.
- Page tabs: one line; active has `aria-selected` and the underline class; the screens text truncates with the full
  text in `title`; no `.sre-tab-dot`; **+ Page** has its label; the phone class hides the screens text.
- Inspector heading text per selection (Page · Home / Region · in Home / Clock bar · on Home).
- Screen page sub-labels are not uppercase.
