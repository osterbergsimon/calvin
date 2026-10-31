# Theme package format (theme_api 2)

A Calvin theme is a **palette family**, not a skin. It changes colours and
nothing else: layout, spacing, radii, typography and z-index stay the host's,
and light/dark remains the **mode** setting. A theme therefore ships one light
palette and one dark palette, and never fights "Follow device" or "On a
schedule".

The installer validates a package at install; the host validates every bundled
and installed theme again on every startup. Both use the same rules in
[`app/services/theme_contract.py`](https://github.com/osterbergsimon/calvin/blob/develop/backend/app/services/theme_contract.py).

## Layout

```
{theme_id}/
  theme.json       # required: manifest + both palettes
  preview.(png|jpg|webp)   # optional: picker image
```

`theme.json`:

```json
{
  "id": "midnight",
  "name": "Midnight",
  "version": "2.0.0",
  "theme_api": 2,
  "description": "Violet on night blue.",
  "variables": { "...light palette..." },
  "dark_mode": { "...dark palette..." }
}
```

`id` must be a lowercase slug (it names the directory under `themes/`).
`theme_api` is optional but recommended: a package without it is checked by the
same rules. A package declaring a newer `theme_api` than this Calvin supports is
rejected.

## Colours only

A theme may set **only** these keys. Any other key (`gap-4`, `radius-lg`,
`z-modal`, `font-ui`, or the retired `bg-primary` / `accent-primary` /
`calendar-*` / `text-*` names) is **ignored and logged**; it is never written to
the page.

| Group | Keys |
|---|---|
| Surfaces / ink | `bg-0`, `bg-1`, `bg-2`, `ink`, `ink-2`, `ink-3`, `line`, `line-soft` |
| Accent | `focus` |
| Status | `ok`, `warn`, `err` |
| Text on a tone | `focus-ink`, `focus-text`, `ok-ink`, `ok-text`, `warn-ink`, `warn-text`, `err-ink`, `err-text` |
| Elevation | `shadow`, `shadow-hover` |
| Calendar (optional) | `event-1` … `event-8` |

**Required in both modes (14 base colours):** `bg-0`, `bg-1`, `bg-2`, `ink`,
`ink-2`, `ink-3`, `line`, `line-soft`, `focus`, `ok`, `warn`, `err`, `shadow`,
`shadow-hover`.

**Derived if missing (8 pairs):** `focus/ok/warn/err` × `-ink` / `-text`. The
host derives them at install and stores them:

- `-ink` is `--ink` or `--bg-1`, whichever clears WCAG AA on the tone;
- `-text` is the tone mixed toward `--ink` until it clears AA on `--bg-1`.

Ship the pairs yourself if you prefer; they are checked the same way.

`event-1…8` fall back to Calvin's palette when omitted.

## Value syntax

`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` and `hsla()` only.
`var()`, `url()`, `calc()`, `expression()`, named keywords and any other value
shape are rejected — a theme cannot reach layout tokens or inject a resource.

## Checks

At **install** a package is rejected when:

- a base colour is missing (the error names the key and mode);
- a value does not parse as one of the allowed shapes;
- `ink` / `ink-2` / `ink-3` is below AA on `bg-1`;
- a `-text` pair is below AA on `bg-1`, or a `-ink` pair is below AA on its tone.

The message is user-facing, for example:
`Midnight can't be installed: it's missing bg-2 in dark mode.`

At **load** (every startup, bundled and installed themes) the same checks run.
A theme that now fails is **kept** but marked unselectable; if it was selected,
Calvin falls back to its own palette in the current mode and the picker shows the
theme disabled with "Needs an update to work with this Calvin."

The **status hue rule** is a warning for third-party themes, not a rejection:
`focus` ↔ `ok` / `err` ≥ 25°, `warn` ↔ `err` ≥ 25°, `focus` ↔ `warn` ≥ 12°
(the accent must never look like a warning). When a theme fails it still
installs and the picker adds "Status colours may be hard to tell apart in this
theme." Themes in the official catalog must pass every rule in that repository's
CI.

## Applying

`useTheme` writes the allowlisted keys of the palette for the current mode onto
`:root`, and removes them when Calvin is selected. It also re-checks the value
syntax as a last line of defence, so a hand-edited `theme.json` cannot inject a
`var()` or `url()`.
