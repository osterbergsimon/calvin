# Themes audit (CLV-76)

Status: audit + decisions. **Owner decisions 2026-10-31: D1 yes, D2 yes, D3 yes, D4 yes (four built-ins; plugin themes per §4).**
The fixes fold into the doctrine migration PRs ([frontend doctrine](frontend-doctrine.md),
[frontend audit](audits/2026-10-31-frontend-audit.md)). Owner decisions are marked **D1–D4**.

## 1. How theming works today

- **Mode** (`themeMode`: Light · Dark · Follow device · On a schedule) toggles `.dark` on `<html>`. `theme.css`
  holds Calvin's own palette for both.
- **Theme** (`selectedThemeId`; picker shows **Calvin default** plus the built-ins Light, Dark, Ocean, Forest,
  Sunset from `backend/data/themes/builtin.json`). `applyCustomTheme()` writes the theme's `variables`, plus its
  `dark_mode` block when the mode is dark, onto `:root`.
- Every built-in sets the same **22 semantic colours** in both modes: `bg-0/1/2`, `ink/-2/-3`, `line`,
  `line-soft`, `focus`, `ok`, `warn`, `err`, their `-ink`/`-text` pairs, and `shadow`/`shadow-hover`.
  - Everything else is derived from those via `color-mix`: `--focus-glow`, `--switch-track-off`, `--tag-*` tints.
  - So the role tokens (`--text-*`, `--gap-*`, `--radius-*`) are theme-independent by design. Only colour varies.
- **calvin-0ue problem 1 (themes didn't tint the shell) is resolved**: all five set the surface tokens since the
  semantic migration and CLV-64. The CLV-64 contrast test covers 5 themes × 2 modes for text pairs.

## 2. Findings

### 2.1 Light and Dark are not themes (calvin-0ue problem 2, still open)

| Theme | In light mode | In dark mode | Problem |
|---|---|---|---|
| **Light** | identical to Calvin default | identical to Calvin default's dark | a duplicate of "Calvin default" |
| **Dark** | **dark palette** while the mode says Light | dark palette | contradicts the "Light or dark" setting; **On a schedule** and **Follow device** silently stop working |

So the picker offers 6 entries where there are really 4 palettes (Calvin, Ocean, Forest, Sunset), and two of the
entries fight the mode setting.

### 2.2 Status colours collide with the accent (all themes)

Hue of `focus` (the accent) against the status colours:

| Theme · mode | focus | warn | ok | err | Collision |
|---|---|---|---|---|---|
| Calvin · light | 33° | 39° | 153° | 6° | warn ≈ focus (6° apart) |
| **Calvin · dark** | `#f3b052` | **`#f3b052`** | 155° | 5° | **warn is the accent colour exactly** |
| Ocean · light / dark | 201° / 199° | 38° / 42° | 174° / 168° | 0° / 4° | ok vs focus 27–31° apart (teal vs blue): borderline |
| Forest · light / dark | 95° / 88° | 39° / 42° | 123° / 123° | 3° / 5° | ok ≈ focus (28–35° apart, both green) |
| **Sunset · light / dark** | 27° / 32° | 35° / 42° | 113° / 88° | 14° / 14° | **focus, warn and err all orange-red** |

Effect: a `warn` Tag ("Update"), an `err` line and a selected control look alike. That breaks the doctrine rule
"orange = act here or selected". Contrast passes, so CLV-64 didn't catch it: this is a hue problem, not a contrast
problem.

### 2.3 Colours outside the theme system

Colour tokens with literal values that no theme sets (`theme.css`):

| Tokens | Verdict |
|---|---|
| `--region-calendar #4caf50`, `--region-photos #2196f3`, `--region-service #ff9800` (page-editor region fills) | **Fix.** Material green/blue/orange, the same in every theme. Blue breaks the palette, orange collides with focus, and colour-coding kinds breaks the doctrine ("a category is never coloured") |
| default calendar colour `#2196f3` in the add form | **Fix.** Material blue; ignores the theme |
| `--device-*` (editor device bezel), `--scrim-*`, `--on-scrim`, `--qr-surface`, `--mask-opaque`, `--on-event-ink*` | Fine: a device bezel is dark, a QR plate is white and a scrim is black in every theme |

### 2.4 Unfinished-looking

- **Sunset light**: everything is peach (`bg-0 #ffe2d0`, `bg-1 #fff1e7`), so cards barely separate from the page
  (bg-0 vs bg-1 ΔL small). With §2.2 it reads as one orange wash.
- **Theme picker**: a list of names with one swatch. You can't see what a theme does in your current mode, and
  "Calvin default" vs "Light" looks like a bug.
- Ocean/Forest/Sunset otherwise look complete in both modes (after #197/#206: toggles, tags and buttons all derive
  from the 22 tokens).

## 3. Recommendations

**D1. Drop Light and Dark as themes** (recommended). A theme is a palette family; light or dark is the mode.
- The picker lists **Calvin** (renamed from "Calvin default"), **Ocean**, **Forest**, **Sunset**.
- Migration on load: `selectedTheme: "light"` → `null`; `selectedTheme: "dark"` → `null` and `themeMode: "dark"`, so
  nobody's screen changes.
- Remove both from `builtin.json`. Plugin themes follow the same model (§4).
- Alternative (not recommended): picking Dark sets the mode to Dark. That keeps two controls for one thing, and
  the mode would change behind the user's back.

**D2. Keep status hues apart from the accent** (recommended). Rule for every theme, enforced by extending the CLV-64
contrast test:
- hue distance ≥ 25° between `focus` and each of `ok` and `err`;
- ≥ 25° between `warn` and `err`;
- ≥ 12° between `focus` and `warn`. Warm accents can't get further from an amber warning without it turning olive, so
  warn is also never shown without its ⚠ icon and word.

Proposed values (checked: hue Δ and ≥ 3:1 against the surface for the colour itself; the `-ink`/`-text` pairs are
recomputed for AA by the same script CLV-64 used):

| Theme · mode | Change |
|---|---|
| Calvin · light | `warn` → `#b38f00` (48°, Δ15° from focus) |
| Calvin · dark | `warn` → `#ffd84d` (47°, Δ12°; it was identical to focus) |
| Forest · both | `ok` → teal-green `#1f8a6e` / `#5fd3b0` (≈ 163°, Δ69–74°) |
| Sunset · both | `err` → crimson `#b0203f` / `#ff6b81` (≈ 349°, Δ40°); `warn` → `#9a7400` / `#ffdb4d` (Δ16–18°) |
| Ocean · both | `ok` → `#2e8b57` / `#66d19e` (≈ 148°, Δ48–55°) |

Plus: status is never colour alone. Tags already carry the word; `InlineNote` gets the ⚠/✕/✓ icon.

**D3. Neutral regions in the page editor** (recommended). Region fills use `--bg-2` with a 1px `--line` border, an
`mdi` kind icon and the label. The selected region uses `--focus`. Delete `--region-*`. Kinds stay recognisable by
icon and label, in every theme.

**D4. Theme set: keep four for 0.1.0** (recommended). No new themes now. Later candidates:
- **Night**: very low luminance, warm, for bedrooms and hallways at night. It would be a mode-like schedule target
  rather than a palette.
- **High contrast** (accessibility).

Both are 0.2+.

Also, with no decision needed:
- **Calendar colours**: an `--event-1…8` palette per theme (curated so `--on-event-ink` is AA on each). New calendars
  take the next unused one, and the colour field offers these 8 swatches first and a custom colour second. This
  replaces the `#2196f3` default.
- **Sunset light surfaces**: `bg-0` a step darker (`#f6d6c2`), so panels separate from the page (ΔL ≥ the Calvin
  theme's).
- **Theme picker**: each option shows a mini preview (page, panel, a primary button, a tag) in the *current* mode,
  plus "Light and dark" under the name. It lives with Appearance in the Dashboard category migration PR.

## 4. Plugin themes (e.g. calvin-plugins `midnight-theme`)

**Today:** `validate_theme_variables` accepts any object, and `applyCustomTheme()` writes every key verbatim as
`--<key>` on `:root`. So a theme can:
- override layout tokens (`--gap-*`, `--z-*`, `--touch-target`);
- inject `url()`/`var()` values;
- ship only half a palette, leaving the other half on Calvin's colours.

`midnight-theme` 1.1.0 shows all three problems:
- it sets 15 of the 22 colours and 17 legacy keys (`accent-*`, `bg-primary`, `calendar-*`, `text-*`, `border-color`,
  `indicator-*`) that the shell no longer reads;
- it sets dark colours in **both** `variables` and `dark_mode`, which is the "Dark ignores the mode" problem from §2.1.

**The model (theme contract 2):** a theme is a palette family, exactly like a built-in:
1. **Colours only.** A theme may set only the colour allowlist: the 22 semantic colours plus the optional
   `event-1`…`event-8`. Any other key (role, size, spacing, radius, z-index, font, legacy names) is **ignored with a
   warning** at install and never written to the page.
2. **Both modes.** `variables` is the light palette and `dark_mode` the dark one. Both are required, so picking a theme
   never fights the light/dark setting (D1).
3. **Required vs derived.**
   - The 14 base colours are **required in both modes**: `bg-0/1/2`, `ink/-2/-3`, `line`, `line-soft`, `focus`, `ok`,
     `warn`, `err`, `shadow`, `shadow-hover`.
   - The 8 pairs are **derived if missing**: `focus/ok/warn/err` × `-ink`/`-text`.
     - `-ink` = `--ink` or `--bg-1`, whichever passes AA on the tone.
     - `-text` = the tone mixed toward `--ink` until it passes AA on `--bg-1`.
     - The same algorithm CLV-64 used, ported to the backend so derived values are stored at install.
   - `event-1…8` fall back to Calvin's palette.
4. **Values:** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, `hsl()/hsla()` only. No `var()`, `url()`, keywords or
   expressions.
5. **Checks at install and at load** (every startup, for installed and bundled themes):
   - missing base colour, bad value, or a text pair below AA (`ink`/`ink-2`/`ink-3` on `bg-1`; `-text` on `bg-1`;
     `-ink` on its tone) → **rejected at install**, with the missing or failing keys named:
     **"Midnight can't be installed: it's missing bg-2 in dark mode."**;
   - an already-installed theme that fails at load is kept but **not selectable**. If it was selected, Calvin falls
     back to the Calvin theme in the current mode, and the picker shows it disabled with **"Needs an update to work
     with this Calvin."**;
   - the hue-distance rule (D2) is a **warning, not a rejection**, for third-party themes: install succeeds and the
     picker shows **"Status colours may be hard to tell apart in this theme."** under its name.
   - Catalog themes (calvin-plugins) must pass **all** rules in that repo's CI (`test_validate_plugins.py`).
6. **Versioning:** `theme.json` gains `"theme_api": 2`. A theme without it is checked by the same rules (most old
   themes fail on legacy keys only, which are now just ignored).

**What `midnight-theme` needs (calvin-plugins PR, version 2.0.0):**
- add `"theme_api": 2`; remove the 17 legacy keys;
- keep the dark palette in `dark_mode` (focus `#8b5cf6` 263°, ok `#3fb950`, warn `#fbbf24`, err `#f87171`: all pass the
  D2 distances);
- **add a real light palette in `variables`** (contrast and hue checked against `bg-1`):

| Token | Light value | | Token | Light value |
|---|---|---|---|---|
| `bg-0` | `#eceaf6` | | `focus` | `#6d28d9` (6.6:1) |
| `bg-1` | `#f7f6fc` | | `ok` | `#15803d` (4.7:1) |
| `bg-2` | `#ffffff` | | `warn` | `#a16207` (4.6:1, Δ35° from err) |
| `ink` | `#1b1630` (16:1) | | `err` | `#b91c1c` (6.0:1) |
| `ink-2` | `#4b4566` (8.3:1) | | `line` | `#d9d5ea` |
| `ink-3` | `#6e6889` (4.9:1) | | `line-soft` | `#e7e4f2` |
| `shadow` / `shadow-hover` | `rgba(27,22,48,.10)` / `rgba(27,22,48,.16)` | | | |

- derived pairs: let the host derive them (or ship them; either passes);
- update its README: "Midnight: violet on night blue in dark mode, violet on pale lavender in light mode."

## 5. Where the fixes land

| Fix | PR |
|---|---|
| D2 status hues + Sunset surfaces + hue-distance test + `--event-*` tokens | Phase 1 tokens PR (theme.css + `builtin.json`), one PR |
| D1 drop Light/Dark + migration + picker preview | Dashboard category migration PR (`useTheme.js`, `ThemePicker`) |
| D3 neutral regions | Page editor migration PR |
| Calendar colour palette in the add form | Content category migration PR |
| §4 plugin theme contract: backend allowlist + validation + derivation + load check; `applyCustomTheme` writes allowlisted keys only; picker disabled state | Phase 1 tokens PR (backend + `useTheme.js`), with its own tests |
| `midnight-theme` 2.0.0 | calvin-plugins PR, after the host accepts `theme_api: 2` |

## 6. Tests

- Hue-distance assertions (§D2 thresholds) in the CLV-64 contrast spec for 4 themes × 2 modes.
- `useTheme` migration: `light` → null with the mode unchanged; `dark` → null and the mode set to dark; runs once.
- The picker lists exactly Calvin, Ocean, Forest, Sunset (plus installed plugin themes).
- No `--region-*` tokens or `#2196f3` left (token lint).
- `--event-*`: each passes AA against `--on-event-ink` in every theme × mode.
- Theme contract (backend): a non-colour key is ignored and logged; a `url()`/`var()` value is rejected; a missing base
  colour is rejected with the key named; missing pairs are derived and pass AA; a load-time failure marks the theme
  unselectable and falls back to Calvin; a hue-distance failure warns but installs.
- `applyCustomTheme` never writes a non-allowlisted property (unit test with a theme setting `--gap-4`).
