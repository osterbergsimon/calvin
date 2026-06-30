# Calvin — Touch + Visual Redesign

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Scope:** Cross-cutting visual/interaction language + Settings + main dashboard.
**Mocks:** [`docs/design/mocks/`](./mocks/) — see [Mock reference](#10-mock-reference).

---

## 1. Context

Calvin is a self-hosted **wall appliance**, not a webpage. Its interaction model is *modal + region-based*: the user switches modes (calendar / photos / web services / settings), cycles "screens," moves an **active-region** highlight between panels, then acts within the focused region (next/prev, expand/collapse, refresh, fullscreen). See [`useKeyboardActions.js`](../../frontend/src/composables/useKeyboardActions.js) for the full action vocabulary and [`stores/mode.js`](../../frontend/src/stores/mode.js) for modes.

It runs in two display contexts:

| Context | Size | Input |
|---|---|---|
| Touch unit | 15" touchscreen, wall-mounted | **Touch** (primary target of this work) |
| Display unit | 24" non-touch | **7-button cluster / keyboard** |

Phone/handheld reflow is a nice-to-have, not a requirement.

The current UI is generic Material (blue `#2196f3`, emoji icons, system font, cramped `0.5rem`-padding inputs, a sidebar + tab-strip + accordion stack in Settings). It is not touch-friendly and has no distinctive identity.

## 2. Goals & non-goals

**Goals**
1. Make the 15" touch unit **touch-native** — direct manipulation, every action reachable by finger, 44px+ targets.
2. Establish a **distinctive, themeable visual identity** for Calvin.
3. Rebuild the two surfaces the owner is least happy with: **Settings** and the **main dashboard**.

**Non-goals**
- **Do not change keyboard behavior.** The action vocabulary in `useKeyboardActions.js` and how the 7-button cluster drives it stay exactly as they are. Touch is a *parallel* layer onto the same actions.
- No mandatory phone layout (design should not actively break narrow widths, but small-screen polish is out of scope).
- No change to the plugin contract (`instance_config_schema`-driven forms, schema renderers, Pluggy hooks).

## 3. Thesis & signature

**Calvin is a lit control panel.** One region is in focus at a time; the focused region is *lit* (raised, brightened, with a soft glow in the theme's focus color) while everything else sits quietly dimmed.

**The signature element is the focus-light.** When focus moves, the light glides to the new panel. This is not decoration:

- It is **content-true** — it dramatizes Calvin's real focus-based navigation, which already exists in code (today as a 2px outline that fades after 2.5s; we are promoting it to the heart of the design).
- It solves a **wall-appliance problem** — from across a room you instantly see what's focused and what the next button press will affect.
- It is the **bridge between the two inputs.** The light is a shared cursor: a button press slides it on the 24"; a fingertip taps a panel and the light jumps there on the 15". One light, one action, two input grammars. This is how touch+keyboard parity becomes the aesthetic instead of a retrofit.

## 4. Identity is structural (because color *and* type are themeable)

Calvin already themes color ([`useTheme.js`](../../frontend/src/composables/useTheme.js) applies a theme's variable map via `root.style.setProperty('--key', value)` and toggles `.dark`/`.light` on `<html>`). We are extending themes to **also own type**. Therefore the identity cannot ride on a signature color or a signature font — it lives in the **bones**:

- the **focus-light** primitive,
- the **spatial rhythm** (spacing, radius, panel surfaces),
- the **touch-control language** (segmented controls, toggles, contextual panel controls),
- the **type *system*** — fixed *roles* and *scale* and *tabular-numeral discipline*, even when the *faces* swap.

### 4.1 Token system

Two layers, both applied as CSS custom properties on `<html>` (consistent with `useTheme.js`).

**Color tokens (semantic, themeable).** Extend the existing set in [`theme.css`](../../frontend/src/styles/theme.css). New/clarified semantic tokens used by the redesign:

```
--bg-0      page background
--bg-1      panel, resting
--bg-2      panel, raised / lit / control surface
--line      border
--line-soft inner divider
--ink       primary text
--ink-2     secondary text
--ink-3     muted / captions
--focus       the focus-light accent ("the lamp")
--focus-ink   text on a focus-filled surface
--focus-glow  rgba, for outer glow
--focus-edge  rgba, for the lit edge ring
--ok / --warn / --err  status
```

These map onto the existing `--bg-primary`/`--accent-primary`/etc. tokens; the migration aliases old → new so existing components keep working during rollout.

**Font-role tokens (themeable, with guardrails).**

```
--font-display   clock, large headings, wordmark
--font-ui        labels, body, controls
--font-data      tabular data: times, dates, counts, versions, temperatures
```

A "type theme" is just a variable map that sets these three keys (and is applied by the same `useTheme.js` path). **Guardrails** (enforced at theme-load / as a checklist for any shipped theme):

1. Every face **must cover Latin Extended-A** (å ä ö æ ø …). Calvin is used in Swedish; this is a hard requirement.
2. `--font-data` **must have tabular figures**, or clock/calendar columns jitter.
3. Faces are **self-hosted woff2, offline-first** — the Pi may run without network. No runtime CDN dependency.

### 4.2 Type themes

The default plus two alternates. All faces are OFL-licensed (self-hostable) and cover Latin Extended-A.

| Theme | Display | UI | Data | Character |
|---|---|---|---|---|
| **Instrument** *(default)* | IBM Plex Sans Condensed | IBM Plex Sans | IBM Plex Mono | Engineered, coherent superfamily; the Plex Mono clock reads like a departures board. Man–machine pedigree fits a finger+button device. |
| **Marquee** | Space Grotesk | Inter | JetBrains Mono | Geometric, fashioned, strongest personality. |
| **Station** | Schibsted Grotesk | Schibsted Grotesk | JetBrains Mono | Sturdy, warm, Scandinavian type house — domestic feel. |

See [`spec-type.png`](./mocks/spec-type.png) for the side-by-side specimen.

### 4.3 Type scale & usage

- **Clock** — `--font-display`, large, `font-variant-numeric: tabular-nums lining-nums`.
- **Headings / region titles / wordmark** — `--font-display`, weight 700, uppercase tracking on the wordmark only.
- **UI / labels / descriptions / body** — `--font-ui`.
- **All tabular data** — `--font-data` with tabular figures: event times, dates, day numbers, counts ("4 av 312"), versions, temperatures. This is the texture of the interface and the reason a mono role earns its place.

### 4.4 The focus-light primitive

A single reusable treatment applied to whichever element is focused:

- **Focused:** background steps to `--bg-2` with a subtle top sheen (`linear-gradient` of `--focus` at ~7%), `--focus-edge` border, layered box-shadow (`0 0 0 1px --focus-edge` + soft outer `--focus-glow`), `translateY(-2px)`.
- **Unfocused:** `opacity: .62; filter: saturate(.65) brightness(.86)` — quietly receded.
- **Transition:** `transform/box-shadow/opacity/filter` ~.35s on a gentle ease; **instant under `prefers-reduced-motion`**.

The same primitive lights the focused dashboard region *and* the active Settings category — that's what makes the two surfaces feel like one object.

### 4.5 Touch-control language

- **Minimum target 44px; default 46–48px.**
- **Segmented control** — for 2–3 mutually exclusive options (Landscape/Portrait, Mon/Sun). Selected segment is `--focus`-filled. Preferred over dropdowns for touch.
- **Toggle** — 56×32 track, `--focus` when on.
- **Select pill** — 48px, bordered, label + chevron, for longer option lists (Theme, Typeface).
- **Contextual panel control** (`cbtn`) — 46px rounded button living in a focused region's header; primary action `--focus`-filled.
- **Bar affordance** (`barbtn`) — 42px quiet button in the clock bar (settings gear).

## 5. Input model & touch ↔ keyboard parity

Keyboard is unchanged. Touch maps onto the same actions via direct manipulation + contextual controls + a few global affordances. **No fat persistent control bar** — that was an early idea, rejected because a soft seven-button remote imports the *keyboard* paradigm onto glass and is not touch-native.

| Action (existing) | Keyboard (unchanged) | Touch |
|---|---|---|
| Move focus between regions | `region_next/prev` | **Tap a region** → light moves there |
| Next / prev in region | `generic_next/prev` | **Swipe** within region, or ‹ › on focused panel header |
| Expand / open | `generic_expand_close` | **Tap the item** (event → detail, photo → fullscreen) |
| Collapse / close | `generic_expand_close` | Tap backdrop / close affordance |
| Refresh | `generic_refresh` | ↻ on focused panel header |
| Switch screen | `screen_next/prev` | **Swipe** on empty stage; screen **dots** in clock bar |
| Open settings | `mode_settings` | **Gear** in clock bar |

**Contextual controls live with the light.** The focused region's header carries its verbs (‹ › / refresh / open); move focus and they move with it. **They fade after inactivity and bloom back on touch** — reuse the existing inactivity machinery (`resetInactivityTimer` in `usePhotoFrameMode` / the kiosk UI-hide path), so the ambient screen stays calm content when no one is interacting.

**Per-context chrome:** touch affordances render on the 15" touch unit; on the 24" non-touch (and in kiosk) they stay hidden — keyboard only. Detection can key off pointer/touch capability and the existing kiosk/`shouldShowUI` config.

## 6. Surface — Dashboard

Reference: [`mock-nobar.png`](./mocks/mock-nobar.png).

- Clock/status bar restyled: wordmark + room label + **screen dots** (left), big tabular clock + date (center), weather + connection + **settings gear** (right).
- Stage of regions; the focused region is lit, others dimmed (focus-light primitive).
- Focused region header carries contextual controls; content supports direct manipulation (tap event, swipe photos).
- No bottom bar.

## 7. Surface — Settings

Reference: [`mock-settings.png`](./mocks/mock-settings.png).

- **Three nav layers → one and a half.** Today: sidebar + tab-strip + collapsible accordions. New: a **category rail** (the active category uses the focus-light primitive) + former tabs demoted to **eyebrow section labels** (`LAYOUT`, `APPEARANCE`) inside a single scroll.
- **Search promoted** to a first-class top bar.
- **Touch rows** ~72px: label + plain-language description on the left, control on the right.
- Controls per §4.5: segmented, toggles, select pills.
- **New surfaced controls:** *Theme* (color) and *Typeface* (type theme) selectors — the themeable architecture made visible.
- **Plugin contract preserved:** plugin instance forms still render from `instance_config_schema` via `PluginFieldRenderer`; this redesign restyles the field primitives, it does not change the schema-driven generation.

## 8. Decomposition (build order)

Three spec → plan → build cycles. **A** builds the vocabulary **B** and **C** both speak.

- **A — Foundation.** Token system (color + font-role) layered into `theme.css` + `useTheme.js`; the three type themes (self-hosted woff2); the focus-light primitive; the touch-control components (segmented / toggle / select pill / cbtn / barbtn); reduced-motion + focus-visible baseline. Deliverable: a small set of reusable primitives + theme tokens, no surface rewired yet.
- **B — Dashboard.** Apply the language; promote the active-region highlight to the focus-light; add touch (tap-to-focus, swipe, contextual header controls, inactivity fade); clock-bar affordances (dots, gear). Keyboard path untouched.
- **C — Settings.** Rebuild nav (rail + eyebrow panels), search, touch rows, restyled field primitives; preserve schema-driven plugin forms.

## 9. Quality floor & risks

**Quality floor:** responsive enough to not break narrow widths; visible keyboard focus (`:focus-visible`) preserved everywhere (the 24" is keyboard-driven); `prefers-reduced-motion` respected by the focus-light transition; theme contrast must stay legible at a distance.

**Risks / open questions**
- **Theme contrast guardrail.** Themeable color means a theme could make `--focus` illegible. Consider a minimum-contrast check or curated built-in themes only.
- **Font licensing/self-host.** *Resolved:* all chosen faces are SIL OFL-1.1, which is GPLv3-compatible (OFL covers only the font files). Vendored via `@fontsource/*` (npm, covered by the existing `license-checker` workflow); OFL texts ship in `frontend/src/assets/fonts/LICENSES/`; recorded in `LICENSE_COMPATIBILITY.md`. Keep the woff2 payload modest for the Pi (latin + latin-ext subsets only).
- **Token migration.** Existing components use `--bg-primary` etc. Alias old→new tokens so rollout is incremental, not a big-bang rename.
- **Type-theme persistence.** Decide where the selected type theme is stored (config key vs. theme-plugin selection) and how it composes with color themes in `useTheme.js`.
- **Touch detection.** Confirm a reliable signal to show/hide touch affordances (pointer media query + kiosk config) so the 24" stays clean.

## 10. Mock reference

All in [`docs/design/mocks/`](./mocks/). PNGs are renders; the matching `.html` files are the live, reproducible sources.

| File | Shows |
|---|---|
| `mock-instrument.png` | Dashboard, focus-light, **Instrument** type (default), Backlit color theme |
| `mock-marquee.png` / `mock-station.png` | Same dashboard in the alternate type themes |
| `mock-station-paper.png` | Dashboard in a **light** color theme — identity survives the swap |
| `spec-type.png` | Side-by-side type specimen (clock / heading / event rows / Nordic + data) |
| `mock-nobar.png` | **Final dashboard direction** — rail removed, contextual controls on the lit panel |
| `mock-settings.png` | **Settings direction** — rail + eyebrow panels, touch rows, segmented/toggle/pill, search |

> Mocks are illustrative: dashboard user content is Swedish (realistic calendar), Settings chrome is English (matches the shipped app). The amber `--focus` ("lamp") is the chosen default for the Backlit theme and is itself themeable.
