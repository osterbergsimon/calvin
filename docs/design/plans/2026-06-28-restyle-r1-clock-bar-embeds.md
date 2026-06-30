# Embedded-editor restyle R1 (Clock bar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the two Clock-bar embedded editors (`ClockBarFontSizePicker`, `ClockBarItemsTab`) into the new shell vocabulary — new semantic tokens + shell surfaces — preserving all behavior.

**Architecture:** Pure visual restyle. In each file's `<style>` (and any inline style/class hooks), replace every legacy token with its new semantic equivalent (§ token map below) and align surfaces/buttons/inputs to the shell conventions. No template logic, props, emits, refs, or handlers change.

**Tech Stack:** Vue 3 `<script setup>`, scoped CSS, Vitest. From `frontend/`: full suite `npx vitest run`; lint `npx eslint src`.

## Global Constraints

- Reference spec: `docs/design/2026-06-28-restyle-r1-clock-bar-embeds.md` (§3 token map, §4 surface conventions — authoritative).
- **Behavior-preserving:** do not change template structure, props, emits, refs, computed, handlers, or `v-model` wiring. Only styling (CSS values, class-level style, and at most class-name swaps) changes.
- Keyboard vocabulary FROZEN: do not touch `useKeyboardActions.js` (not involved here anyway).
- After restyle, **zero** legacy tokens and **zero** hardcoded hex/rgb may remain in the file.
- No new tests (nothing behavioral changes). Verification per task = grep-clean + full suite green + lint clean.
- Stage **only** the one file each task changes. Never `git add -A` (untracked `.beads/` and `frontend/public/test-calendar.ics` must never be committed).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -`).
- Do NOT `git push`.

**Token map (apply everywhere the legacy token appears — CSS values, var() refs):**

| Legacy | New |
|---|---|
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--text-tertiary` | `--ink-3` |
| `--bg-primary` | `--bg-1` |
| `--bg-secondary` | `--bg-2` |
| `--bg-tertiary` | `--bg-2` |
| `--border-color` | `--line` |
| `--accent-primary` | `--focus` |
| `--shadow` | `--shadow` (unchanged) |
| hardcoded hex/rgb | nearest semantic token (status → `--ok`/`--warn`/`--err`; surface → `--bg-*`; text → `--ink*`) |

**Surface conventions (from spec §4):** nested cards/inputs/list-items use `--bg-2` + `--line`; buttons use the C2/C3 shell vocabulary (`min-height: 44px`, `--bg-2` ground, `--line` border, `border-color: var(--focus)` on hover, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`); inputs/sliders get `--focus` focus rings; labels `--font-ui`, numeric values `--font-data`; the editor's outer wrapper blends with the `--bg-1` section panel (no competing nested panel border unless it genuinely groups). Keep existing spacing/transitions; only token-ize their colors and fix spacing that visibly clashes.

---

### Task 1: Restyle `ClockBarFontSizePicker.vue`

**Files:**
- Modify: `frontend/src/components/settings/shared/ClockBarFontSizePicker.vue` (351 lines; 14 legacy tokens, 0 hex)

**Interfaces:** unchanged — props `timeSize`/`dateSize`/`layout`/`padding`/`showDate`/`isVertical`/`showPreview`/`max`; emits `update:timeSize`/`update:dateSize`/`update:padding`. Do not alter them.

- [ ] **Step 1: Read the file and locate styling**

Read `frontend/src/components/settings/shared/ClockBarFontSizePicker.vue`. Note its `<style>` block and any inline `:style`/class usages that reference legacy tokens. The 14 legacy tokens are: `--accent-primary` (×3), `--bg-primary` (×3), `--bg-secondary` (×2), `--border-color` (×2), `--text-primary` (×2), `--text-secondary` (×2).

- [ ] **Step 2: Apply the token map + surface conventions**

In the `<style>` (and any inline style), replace each legacy token per the map above. Then apply the surface conventions: the slider/value chips and any control surfaces use `--bg-2` + `--line`; the range inputs and value fields get a `--focus` focus ring and `:focus-visible` outline; the live-preview frame border uses `--line` and its background `--bg-1`/`--bg-2` as appropriate so the preview reads as an inset; labels `--font-ui`, the numeric px values `--font-data`. Do NOT touch the template logic, the preview component bindings, or the emit handlers. Keep existing layout/spacing except where a legacy value visibly clashes with the shell.

- [ ] **Step 3: Verify no legacy tokens / hex remain**

Run:
```bash
cd frontend
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/shared/ClockBarFontSizePicker.vue
```
Expected: no output (zero matches). `--shadow` is allowed and won't match.

- [ ] **Step 4: Verify behavior intact — suite + lint**

Run: `npx vitest run` (from `frontend/`)
Expected: full suite passes (same count as before — the change is style-only; no spec should break).
Run: `npx eslint src/components/settings/shared/ClockBarFontSizePicker.vue`
Expected: 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/shared/ClockBarFontSizePicker.vue
git commit -F - <<'EOF'
style(settings): restyle ClockBarFontSizePicker to new shell tokens (R1 Task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Restyle `ClockBarItemsTab.vue`

**Files:**
- Modify: `frontend/src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue` (285 lines; 16 legacy tokens, 0 hex)

**Interfaces:** unchanged — self-managed component (no props/emits); keeps its store wiring and tile show/hide behavior.

- [ ] **Step 1: Read the file and locate styling**

Read `frontend/src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue`. Note its `<style>` and any inline styles. The 16 legacy tokens are: `--text-primary` (×4), `--text-secondary` (×4), `--border-color` (×3), `--accent-primary` (×2), `--bg-secondary` (×2), `--bg-primary` (×1).

- [ ] **Step 2: Apply the token map + surface conventions**

Replace each legacy token per the map. Apply conventions: each tile/list row is a `--bg-2` card with a `--line` border; the show/hide toggle/active state uses `--focus`; row labels `--font-ui` (`--ink` primary, `--ink-2` secondary); any empty-state/help text `--ink-3`; interactive controls get `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }` and ≥44px touch height where practical. Do NOT change the template, the store usage, or the tile toggle handlers. Preserve existing layout/spacing except where legacy values clash.

- [ ] **Step 3: Verify no legacy tokens / hex remain**

Run:
```bash
cd frontend
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue
```
Expected: no output.

- [ ] **Step 4: Verify behavior intact — suite + lint**

Run: `npx vitest run` (from `frontend/`)
Expected: full suite passes.
Run: `npx eslint src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue`
Expected: 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/tabs/clock-bar/ClockBarItemsTab.vue
git commit -F - <<'EOF'
style(settings): restyle ClockBarItemsTab to new shell tokens (R1 Task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: On-device verification (manual, controller/user)

Not a code task. Against a running stack: open Settings → Clock Bar.
- BAR LAYOUT: the horizontal + vertical **sizing pickers** (sliders, value chips, live clock preview) now use light shell surfaces (`--bg-2` cards, `--line` borders, `--focus` accents) — no dark legacy blocks — and sizing still updates the live preview.
- BAR ITEMS: the tile list reads as shell cards; show/hide toggles still work.
- Toggle light/dark theme to confirm both render correctly (tokens resolve in both).

---

## Notes for the executor

- Tasks 1 and 2 are independent (different files); do them in order, each its own commit.
- This is style-only. If `npx vitest run` shows any *new* failure after a token swap, something structural was changed by mistake — revert that edit; the diff must be CSS/style values only.
- `rgba(...)`/`rgb(...)` count as hardcoded color — replace with a token (or a token-derived value); the grep flags them.
- `--shadow` is a valid new token — keep it.
