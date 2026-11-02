# UI sizing tokens — vocabulary & region-editor handoff

**Status:** contract agreed, implementation in progress (foundation lands in `theme.css` + `ui/` primitives).
**Audience:** the region-editor redesign (beads `calvin-bvw`) and anyone tokenizing component chrome.
**Related:** `calvin-bvw` (parked on this scale), `calvin-4d2` (regions-editor cohesion pass).

This doc is the **single source of truth for the sizing token names and their baselines.** Do not invent parallel token names — adopt the ones below verbatim.

---

## The decision

Calvin has a user-configurable **"Settings UI size"** (Settings → Dashboard → Appearance) that scales the **settings/config interface only** — text, every control, modals. The **live dashboard is deliberately untouched**: it keeps its own sizing (region touch controls via `touchControlSize`, clock bar via `clockBarFontSize`). A separate "Dashboard UI size" is a distinct future control.

- **Discrete presets** (SegmentedControl), even `0.15` steps: Extra-compact `0.70` · Compact `0.85` · Default `1.0` · Large `1.15` · Extra-large `1.3` (labelled XS · S · M · L · XL).
- **Mechanism:** `zoom: var(--ui-scale)` on the settings content root (`.settings-scale` in `Settings.vue`). `zoom` scales the whole settings subtree regardless of unit and is contained to it, so nothing leaks to the dashboard. `--ui-scale` is set on `<html>` at runtime by `useUiScale` and inherited down. Scale 1 is a no-op.
- Persisted as a string preset key `uiSize` via `/api/config`; the key→factor map lives in `frontend/src/styles/uiScale.js`.

### Where the tokens fit

The scaling is the settings zoom above — **not** a per-token multiplier. The `--fs-*` / `--space-*` / `--radius-*` / `--touch-target` tokens below are the shared **sizing vocabulary**: one named scale for the settings shell and the region editor (calvin-bvw), replacing scattered magic numbers.

**Every token's baseline equals the literal it replaces** (rem baselines are the prior px ÷ 16). So adopting a token in place of its matching literal is a **visual no-op** — a safe, screenshot-diffable mechanical swap — while giving everything one coherent scale that the settings zoom then drives.

---

## Token vocabulary

Declared once in `frontend/src/styles/theme.css` `:root` (theme-independent — **not** duplicated into `.dark`).

**Naming caution:** the existing `--text-*` and `--switch-*` tokens are **colors**. The sizing scale therefore uses `--fs-*` (font-size) and `--toggle-*` (switch geometry) to avoid any confusion. `--space-*`, `--radius-*`, `--touch-target`, `--control-height` are new.

### Control sizing (scaled)
| Token | Baseline | Use |
|---|---|---|
| `--touch-target` | `44px` | The ~47 repeated `min-height: 44px` touch minimums |
| `--control-height` | `48px` | Pill trigger height, text-input height |

### Toggle geometry (scaled)
| Token | Baseline |
|---|---|
| `--toggle-w` | `56px` |
| `--toggle-h` | `32px` |
| `--toggle-knob` | `26px` |
| `--toggle-inset` | `3px` |
| `--toggle-travel` | `calc(var(--toggle-w) - var(--toggle-knob) - 2*var(--toggle-inset))` → `24px` @1 |

### Spacing scale (scaled)
| Token | Baseline | Token | Baseline |
|---|---|---|---|
| `--space-3xs` | `0.25rem` | `--space-lg` | `0.75rem` |
| `--space-2xs` | `0.35rem` | `--space-xl` | `1rem` |
| `--space-xs` | `0.4rem` | `--space-2xl` | `1.25rem` |
| `--space-sm` | `0.5rem` | `--space-3xl` | `1.5rem` |
| `--space-md` | `0.6rem` | | |

### Type scale (scaled)
| Token | Baseline | Token | Baseline |
|---|---|---|---|
| `--fs-micro` | `0.72rem` | `--fs-base` | `1rem` |
| `--fs-2xs` | `0.75rem` | `--fs-lg` | `1.15rem` |
| `--fs-xs` | `0.8rem` | `--fs-xl` | `1.25rem` |
| `--fs-sm` | `0.85rem` | `--fs-control` | `14px` (control label) |
| `--fs-md` | `0.9rem` | `--fs-control-lg` | `15px` (pill / input) |

### Radius scale (scaled, except pill)
| Token | Baseline | Token | Baseline |
|---|---|---|---|
| `--radius-xs` | `6px` | `--radius-xl` | `12px` |
| `--radius-sm` | `8px` | `--radius-2xl` | `16px` |
| `--radius-md` | `10px` | `--radius-pill` | `999px` **(FIXED)** |
| `--radius-lg` | `11px` | | |

### What stays FIXED (do not tokenize / do not scale)
- `--radius-pill: 999px` — a pill is a pill at any size (already clamps to half-height).
- **1px borders / hairlines** — scaling to `1.3px` produces blurry sub-pixel lines.
- **2px focus outlines + `2px` offsets** — an accessibility constant; keep consistent across sizes.
- **Box-shadow blur/spread** — aesthetic, leave literal.
- **`ch`-based widths** (`2.5ch`, `3.5ch`) and **`border-radius: 50%`** — already self-proportional to their font.

**Bespoke internal values** that don't land on a scale (e.g. `padding: 10px 18px`, `gap: 7px`): don't mint a one-off token — wrap the literal inline as `calc(10px * var(--ui-scale))`. This preserves the exact baseline and still scales.

---

## Region-editor adoption (calvin-bvw)

### What you get for FREE — no edits
`DashboardRegionsEditor.vue` composes the shared primitives `SelectPill`, `ToggleSwitch`, `SegmentedControl`, `NumberStepper`. Once those primitives consume the tokens (foundation work, done by us), **every control inside the editor scales automatically with zero edits to the editor file.** That is precisely why the editor was parked on this scale.

### What YOU own — the editor's container chrome
The editor's own `<style>` block still hardcodes the wrapper radii, gaps/paddings, and font sizes listed in `calvin-bvw`. During the redesign, replace those literals with the tokens using this **1:1 map** (mechanical find-replace, zero visual change at Default):

| Editor literal | Token |
|---|---|
| `6px` radius | `--radius-xs` |
| `8px` radius | `--radius-sm` |
| `10px` radius | `--radius-md` |
| `11px` radius | `--radius-lg` |
| `12px` radius | `--radius-xl` |
| `999px` radius | `--radius-pill` |
| `0.35rem` spacing | `--space-2xs` |
| `0.4rem` spacing | `--space-xs` |
| `0.5rem` spacing | `--space-sm` |
| `0.6rem` spacing | `--space-md` |
| `0.75rem` spacing | `--space-lg` |
| `0.75rem` font | `--fs-2xs` |
| `0.8rem` font | `--fs-xs` |
| `0.85rem` font | `--fs-sm` |
| `0.9rem` font | `--fs-md` |
| `1rem` font | `--fs-base` |

**Example** — a region wrapper today:
```css
.preview-region { border-radius: 8px; padding: 0.5rem 0.6rem; gap: 0.4rem; font-size: 0.85rem; }
```
becomes:
```css
.preview-region {
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  gap: var(--space-xs);
  font-size: var(--fs-sm);
}
```
No behavioural change at Default; the whole panel now scales with the user's UI-size preference.

### Design guidance for the redesign
- **Aim for the compact feel of `RegionViewOptions.vue`** (the dashboard "tune" popover): `1.75rem` triggers, `0.4rem` gaps, `8–10px` radii, rem-based. That is the reference "feel" the user likes.
- Do **not** re-introduce hardcoded px for anything on the scale above — reach for a token so the editor honors UI-size.
- The `--region-calendar/-photos/-service` accent colors and `--focus-ink` on-accent text are already in place; keep using them (no raw hex).

---

## Out of scope (this iteration)
- **Live-dashboard region-control cluster** (`RegionControls.vue`) stays on its separate `touchControlSize` config and does **not** consume these tokens — it must remain independent for now. (Opting it in later is trivial once these tokens exist, but is a deliberate future decision, not part of this work.)
