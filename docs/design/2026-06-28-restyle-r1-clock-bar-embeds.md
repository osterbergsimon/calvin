# Calvin — Embedded-editor restyle, R1: Clock bar embeds

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Part of:** Touch + Visual Redesign — bead `calvin-hbp` (restyle the editors embedded as-is during C1–C3).
**Builds on:** C1 shell + tokens, C2/C3 category migrations. Branch `feat/design-settings-cycle-c`.

---

## 1. Scope & decomposition

`calvin-hbp` covers eight bespoke editors embedded as-is across C1–C3, still wearing legacy dark styling inside the new white shell. They are **custom widgets, not row-able settings** (sliders, tile lists, a weekly grid, a remap grid, drag-order lists, CRUD-with-modals), so the restyle is **token + surface/layout** depth — make each editor *belong* in the shell while keeping its structure and behavior — **not** a rebuild into `SettingRow`s.

`calvin-hbp` decomposes into per-category slices, each its own spec → plan → execute cycle:

- **R1 (this spec):** Clock bar — `ClockBarFontSizePicker`, `ClockBarItemsTab`.
- **R2:** Device — `DisplayScheduleGrid`, `KeyboardTab` (action set frozen; UI restyle only).
- **R3:** Content — `CalendarSourcesTab` (+21 hex), `ImagesTab`, `ServicesTab`.
- **R4:** Maintenance — `UpdatesTab`.

This spec's §3 (token mapping) and §4 (surface conventions) are the **shared core** R2–R4 reuse verbatim.

**Non-goals:** No behavior change, no structural rebuild, no row-conversion. No change to `useConfigForm`, `settingsRegistry`, or the keyboard action set. Visual-only.

## 2. R1 targets

- `frontend/src/components/settings/shared/ClockBarFontSizePicker.vue` (351 lines; 14 legacy tokens, 0 hex) — time/date/padding sliders with a live clock preview; used twice (horizontal + vertical) in `ClockBarSettings`.
- `frontend/src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue` (285 lines; 16 legacy tokens, 0 hex) — status-bar plugin-tile list with show/hide toggles.

## 3. Token mapping (canonical — reused by R2–R4)

Replace every legacy token with its new semantic equivalent:

| Legacy | New | Use |
|---|---|---|
| `--text-primary` | `--ink` | primary text |
| `--text-secondary` | `--ink-2` | secondary/muted text, labels |
| `--text-tertiary` | `--ink-3` | faint text, hints |
| `--bg-primary` | `--bg-1` | the editor's own panel/base surface |
| `--bg-secondary` | `--bg-2` | nested cards, inset rows, inputs |
| `--bg-tertiary` | `--bg-2` | hover/active fills (or `--bg-1` on a `--bg-2` ground) |
| `--border-color` | `--line` | borders, dividers (use `--line-soft` for subtle inner separators) |
| `--accent-primary` | `--focus` | accents, active states, focus rings |
| `--shadow` | `--shadow` | unchanged (token exists in the new theme) |
| any hardcoded hex | nearest semantic token | status colors → `--ok`/`--warn`/`--err`; surfaces → `--bg-*`; text → `--ink*` |

After the swap, **no** legacy token (`--accent-primary`, `--text-*`, `--bg-primary/secondary/tertiary`, `--border-color`) and **no** hardcoded hex/rgb may remain in the restyled file.

## 4. Surface & layout conventions (canonical — reused by R2–R4)

The editor renders inside a shell `SettingsSection` panel (`--bg-1`, `--line` border, 16px radius). To belong there:

- The editor's outermost wrapper should be transparent or `--bg-1` (blend with the panel) — avoid a competing nested panel border unless it genuinely groups sub-content.
- Nested cards / list items / inputs use `--bg-2` fills with `--line` (or `--line-soft`) borders, matching `SettingRow`/control surfaces.
- Buttons adopt the shell button vocabulary already used in C2/C3: `min-height: 44px`, `--bg-2` ground, `--line` border, `border-color: var(--focus)` on hover, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. Primary/destructive actions may fill `--focus`/`--err`.
- Inputs (text/number/select/time/range): `--bg-2` ground, `--line` border, `--ink` text, `--focus` focus ring; ≥44px touch height where practical.
- Typography uses the role tokens — `--font-ui` for labels/controls, `--font-data` for numeric/monospace values.
- Respect `prefers-reduced-motion` for any transition added; keep existing transitions but token-ize their colors.
- Spacing: align to the shell rhythm (the section panel already provides padding); prefer the existing gap/spacing values, only adjusting where legacy spacing visibly clashes.

## 5. Behavior preservation

Pure restyle: **no** change to props, emits, refs, handlers, computed logic, or template structure beyond what styling requires (e.g. swapping a class, not a v-model). `ClockBarFontSizePicker` keeps emitting `update:timeSize`/`update:dateSize`/`update:padding` and its live preview; `ClockBarItemsTab` keeps its tile show/hide behavior and store wiring. The clock preview must still render correctly against the new tokens.

## 6. Testing

- Existing specs for both components (if any) must stay green; the full suite + `eslint src` (0/0) must pass — the diff is style-only, so behavior tests are unaffected.
- No new behavior tests (nothing behavioral changed). If a component has no existing spec, none is added for a pure restyle.
- **On-device** is the real gate: open Settings → Clock Bar; confirm the horizontal + vertical sizing pickers (sliders, value chips, live preview) and the Bar Items list now match the shell (light surfaces, `--focus` accents, no dark legacy blocks), and that sizing still updates the preview and bar-items toggles still work.

## 7. Deferred

R2 (Device), R3 (Content), R4 (Maintenance) follow as their own cycles, reusing §3 + §4. `calvin-hbp` stays open until all four land; close it after R4.
