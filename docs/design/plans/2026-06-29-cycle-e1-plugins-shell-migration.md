# Cycle E1 — Plugins settings category → new shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Plugins settings category and its 5 specialized editors onto the new shell (`SettingsSection` + new semantic tokens), behavior-preserving.

**Architecture:** Two change kinds, mirroring C2/C3 + calvin-hbp. (1) `PluginsCategory.vue` swaps its two `CollapsibleSection` wrappers for `SettingsSection` eyebrows and tokenizes its own inline pip-warning modal; `Settings.vue` gains a `plugins` entry in `SECTION_BY_CATEGORY_TAB`. (2) The 5 specialized editors get a pure token+surface restyle (CSS values only; no template/logic/props/emits change).

**Tech Stack:** Vue 3 `<script setup>`, scoped CSS, Vite, Pinia, Vitest. From `frontend/`: full suite `npx vitest run`; lint `npx eslint src`.

**Reference spec (authoritative):** `docs/design/2026-06-29-cycle-e1-plugins-shell-migration.md` — §3 token map, §4 surface conventions, §7 behavior preservation, §8 testing.

## Global Constraints

Every task implicitly includes these.

- **Branch:** `feat/design-settings-cycle-c`. Do **not** create a new branch. Do **not** `git push`.
- **Behavior-preserving:** no change to template structure, props, emits, refs, computed, handlers, store usage, or `v-model` wiring — **except** Task 1's `CollapsibleSection`→`SettingsSection` wrapper swap and `Settings.vue` map addition. Editors (Tasks 2–6) change CSS/token values and at most class names — never template logic.
- **Preserve:** `PluginFieldRenderer` / `instance_config_schema` config forms, `useConfigForm` auto-save, `settingsRegistry` search rows/keywords (no new rows). Existing specs stay green (`PluginManager.spec.js`, `PluginInstanceToggle.spec.js`).
- **No new tests** — nothing behavioral changes. Per-file verification = grep-clean (see below) + full `npx vitest run` green + `npx eslint src` 0/0.
- **Token map (spec §3) — apply to every chrome color:**

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

- **Surface conventions (spec §4):** nested cards/inputs/list-items use `--bg-2` + `--line`; buttons use the shell vocabulary (`min-height: 44px`, `--bg-2` ground, `--line` border, `border-color: var(--focus)` on hover, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`); primary/destructive fills use `--focus`/`--err`; inputs get `--focus` focus rings; labels `--font-ui`, numeric/ID/version values `--font-data`; respect `prefers-reduced-motion` (keep existing transitions, tokenize their colors only).
- **COLOR CLASSIFICATION (binding — resolves the spec §4 ambiguity):**
  - **Chrome → tokenize.** Scrims `rgba(0,0,0,α)` → `color-mix(in srgb, var(--ink) 55%, transparent)`. Shadows `rgba(0,0,0,α)` in `box-shadow` → `var(--shadow)`. Generic surfaces/text/borders → token map. **Status colors:** success/connected green (`#4caf50`, `#28a745`, `#388e3c` *in a status/success context*, + `rgba(40,167,69,α)` fills) → `--ok`; error/delete red (`#f44336`, `#dc3545`, `#c33`, `#fcc`, `#fee`, `rgba(220,53,69,α)`) → `--err`; warning amber (`#856404`, `#ffc107`, `#ffb300`, `rgba(255,193,7,α)`) → `--warn`; info cyan (`#0c5460`, `rgba(23,162,184,α)`) → `--ink-2` text on a `--bg-2`/`--line` surface. For α-fills of status colors use `color-mix(in srgb, var(--ok|warn|err) Nx%, transparent)` preserving the original opacity (e.g. `0.1`→`10%`, `0.3`→`30%`). For a hover-darken of a filled status button use `color-mix(in srgb, var(--err), black 12%)` (the `black` keyword is allowed — the grep flags only `#hex` and `rgb()/rgba()`). Text on a filled `--err`/`--focus` button may stay the `white` keyword.
  - **Data → preserve as-is (do NOT tokenize).** The **plugin-type identity palette**: the per-type badge color *pairs* (calendar=blue `#1976d2`/`#e3f2fd`, image/service=green `#388e3c`/`#e8f5e9`, backend/theme=purple `#7b1fa2`/`#f3e5f5` & `#6a1b9a`/`#e1bee7`, orange `#f57c00`/`#fff3e0`, and any sibling pairs). These convey plugin-type identity (categorical, like C3 calendar source colors) — flattening them to `--focus` is a UX regression. Theme preview swatches stay. **The grep gate permits these**, but each preserved hex MUST be listed and justified in the task report.
  - **The disambiguation that matters:** `#2196f3` / `#1976d2` appear BOTH as the generic UI accent (focus rings, primary buttons, active tab underline, links) AND as the calendar-*type* badge color. When the occurrence is generic UI accent → `--focus`. When it's part of a plugin-type badge pair → preserve. Read each occurrence in context; note borderline calls in the report.
- **Grep gate (per file):** after restyle, run the gate below; the only permitted remaining matches are preserved **data** colors (plugin-type palette / theme swatches), each justified in the report. Zero chrome legacy tokens, zero chrome hex/rgb. `--shadow`, the `black`/`white` keywords, and `color-mix(... var(--token) ...)` are all clean.
- **Staging:** `git add` **only** the explicit file(s) each task changes. NEVER `git add -A` / `git add .`. Untracked `.beads/` and `frontend/public/test-calendar.ics`, and the tracked-but-unrelated `.beads/issues.jsonl`, must never be staged.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -`).

**The grep command referenced throughout (run from `frontend/`):**
```bash
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' <file>
```

---

### Task 1: `PluginsCategory.vue` shell rebuild + pip-modal restyle + `Settings.vue` map

**Files:**
- Modify: `frontend/src/components/settings/categories/PluginsCategory.vue` (699 lines; 15 legacy tokens, 7 hex — all in the inline pip-warning modal + scrim)
- Modify: `frontend/src/views/Settings.vue` (add one entry to `SECTION_BY_CATEGORY_TAB`, ~line 226)

**Interfaces:**
- Consumes: `SettingsSection` (`frontend/src/components/settings/shell/SettingsSection.vue`) — props `{ id: String, title: String }`; renders `<section :id="`section-${id}`" class="settings-section">` with a `.settings-section__eyebrow` (the title) and a `.settings-section__panel` slot. Imported by migrated categories as `import SettingsSection from "@/components/settings/shell/SettingsSection.vue";`.
- Produces: section ids `plugins-install` and `plugins-installed` (consumed by the `Settings.vue` map and, later, `calvin-4zj`'s scroll-spy).

- [ ] **Step 1: Swap the two `CollapsibleSection` wrappers for `SettingsSection`**

In `PluginsCategory.vue` template, replace the opening/closing wrapper tags only — the `<PluginInstaller .../>` and `<PluginManager .../>` blocks between them (props/emits) are unchanged.

Replace line 4 `<CollapsibleSection title="Install New Plugin" icon="📦" :expanded="true">` with:
```html
    <SettingsSection id="plugins-install" title="Install">
```
Replace line 28 `</CollapsibleSection>` with `</SettingsSection>`.
Replace line 31 `<CollapsibleSection title="Installed Plugins" icon="🔌" :expanded="true">` with:
```html
    <SettingsSection id="plugins-installed" title="Installed Plugins">
```
Replace line 67 `</CollapsibleSection>` with `</SettingsSection>`.

- [ ] **Step 2: Swap the import**

In the `<script setup>` block, replace line 128:
```js
import CollapsibleSection from "../shared/CollapsibleSection.vue";
```
with:
```js
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
```
(`PluginInstaller`, `PluginManager`, `InstanceModal`, `ConfirmModal` imports stay.)

- [ ] **Step 3: Tokenize the `<style scoped>` block (the inline pip-warning modal + scrim)**

Apply these exact replacements in the `<style scoped>` block (lines 553–699). All are chrome.

- `.modal-overlay` `background: rgba(0, 0, 0, 0.5);` → `background: color-mix(in srgb, var(--ink) 55%, transparent);`
- `.modal-content` `background: var(--bg-primary);` → `background: var(--bg-1);` and `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);` → `box-shadow: 0 4px 20px var(--shadow);`
- `.modal-header` `border-bottom: 1px solid var(--border-color);` → `... var(--line);`
- `.modal-header h3` `color: var(--text-primary);` → `color: var(--ink);`
- `.btn-close-modal` `color: var(--text-secondary);` → `color: var(--ink-2);`
- `.btn-close-modal:hover` `background: var(--bg-secondary);` → `var(--bg-2);` and `color: var(--text-primary);` → `var(--ink);`
- `.modal-body p` `color: var(--text-primary);` → `var(--ink);`
- `.pip-package-list code` `background: var(--bg-tertiary);` → `var(--bg-2);`, `border: 1px solid var(--border-color);` → `var(--line);`, `color: var(--text-primary);` → `var(--ink);`
- `.pip-warning-text` (warning chrome): `color: #856404 !important;` → `color: var(--warn) !important;`; `background: rgba(255, 193, 7, 0.1);` → `background: color-mix(in srgb, var(--warn) 10%, transparent);`; `border: 1px solid rgba(255, 193, 7, 0.3);` → `border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);`
- `.modal-footer` `border-top: 1px solid var(--border-color);` → `var(--line);`
- `.btn-secondary` `background: var(--bg-secondary);` → `var(--bg-2);`, `color: var(--text-primary);` → `var(--ink);`, `border: 1px solid var(--border-color);` → `var(--line);`. Add `min-height: 44px;` to meet the touch floor.
- `.btn-secondary:hover` `background: var(--bg-tertiary);` → `var(--bg-2);` — change to `border-color: var(--focus);` hover instead (shell button vocab): set `.btn-secondary:hover { border-color: var(--focus); }` and drop the bg-tertiary fill.
- `.btn-danger` `background: #dc3545;` → `background: var(--err);` (keep `color: white;`), add `min-height: 44px;`
- `.btn-danger:hover` `background: #c82333;` → `background: color-mix(in srgb, var(--err), black 12%);`
- Add focus-visible to both buttons and the close button: `.btn-secondary:focus-visible, .btn-danger:focus-visible, .btn-close-modal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }`

- [ ] **Step 4: Add the `plugins` entry to `Settings.vue` `SECTION_BY_CATEGORY_TAB`**

In `frontend/src/views/Settings.vue`, inside the `SECTION_BY_CATEGORY_TAB` object (after the `maintenance: {...}` block, ~line 242, before the closing `};`), add:
```js
  plugins: {
    install: "plugins-install",
    installed: "plugins-installed",
  },
```
`MIGRATED_CATEGORIES` derives from `Object.keys(SECTION_BY_CATEGORY_TAB)`, so `plugins` joins it automatically. No other `Settings.vue` change (the breadcrumb scroll-spy un-gate is `calvin-4zj`, NOT here).

- [ ] **Step 5: Verify grep-clean**

Run (from `frontend/`):
```bash
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/categories/PluginsCategory.vue
```
Expected: no output (PluginsCategory has no data colors — all 7 hex were chrome).

- [ ] **Step 6: Verify suite + lint**

Run: `npx vitest run` → full suite passes (same count as before).
Run: `npx eslint src/components/settings/categories/PluginsCategory.vue src/views/Settings.vue` → 0 problems.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/settings/categories/PluginsCategory.vue frontend/src/views/Settings.vue
git commit -F - <<'EOF'
feat(settings): migrate Plugins category to SettingsSection shell (E1 Task 1)

Swap CollapsibleSection wrappers for SettingsSection (plugins-install /
plugins-installed), tokenize the inline pip-warning modal, and register
plugins in SECTION_BY_CATEGORY_TAB so it is a migrated category.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Restyle `PluginInstaller.vue`

**Files:**
- Modify: `frontend/src/components/settings/specialized/PluginInstaller.vue` (1177 lines; 36 legacy tokens, 45 hex — the heaviest)

**Interfaces:** unchanged. Props (`repo-url`, `branch`, `enumerating`, `installing`, `available-plugins`, `error`, `success`, `requires-restart`, `branch-switched`, `actual-branch`, `dev-mode`) and emits (`update:repoUrl`, `update:branch`, `zip-select`, `list-plugins`, `install`, `install-selected`, `install-local`, `install-selected-local`, `force-update`, `restart`) are not touched.

- [ ] **Step 1: Read the file; apply the token map to all 36 legacy tokens**

Read `PluginInstaller.vue`. In `<style scoped>` (and any inline `:style`), replace every legacy token per the Global token map (`--accent-primary`→`--focus` ×9, `--bg-secondary`→`--bg-2` ×6, `--bg-tertiary`→`--bg-2` ×3, `--border-color`→`--line` ×7, `--text-primary`→`--ink` ×6, `--text-secondary`→`--ink-2` ×5). Apply the surface conventions to the install-method tabs (Zip/GitHub), the URL/branch inputs, the "Choose Zip File" / list / install buttons (≥44px, `--bg-2`/`--line`, `--focus` hover/ring; the primary blue CTA fills `--focus`), and the available-plugins list rows (`--bg-2` cards, `--line` borders).

- [ ] **Step 2: Classify and convert the 45 hex per the Color Classification rule**

Apply the binding classification. Concretely for this file:
- **Chrome → token:** `rgba(0,0,0,0.2)` (line 774, shadow) → `--shadow`; the generic-accent blues `#2196f3` (760), `#1976d2` (772, 984 — verify each: focus/active-accent context → `--focus`), `#fff` (761, button text on accent → keep `white` keyword or `var(--bg-1)`), `#5a6268`/`#6c757d` (724/736, secondary-button greys) → `--ink-2`/`--bg-2` per role, `#000` (1030) → review (likely a shadow/scrim → `--shadow` or `color-mix`).
- **Status → token:** success greens `#28a745` (1018,1103), `#388e3c` (994 — verify badge vs success) and `rgba(40,167,69,*)` (953,954,1017,1019,1100,1101) → `--ok` / `color-mix(... var(--ok) N% ...)`; error `#dc3545` (1093), `rgba(220,53,69,*)` (1090,1091) → `--err`; warning `#856404` (1024,1130,1136), `#ffc107` (1029), `#ffb300` (1034), `rgba(255,193,7,*)` (1023,1025,1118,1119) → `--warn`; info cyan `#0c5460` (848), `rgba(23,162,184,*)` (844,845,1110) → `--ink-2` on `--bg-2`/`--line`.
- **Data → preserve (justify in report):** the plugin-type identity badge pairs — `#1976d2`/`#e3f2fd` (983/984 area), `#7b1fa2`/`#f3e5f5` (988/989), `#388e3c`/`#e8f5e9` (993/994), `#f57c00`/`#fff3e0` (998/999), `#6a1b9a`/`#e1bee7` (1003/1004), `#e67e22` (714,718,719 — dev-mode/type accent: preserve if it's a type/identity hue, else `--warn`; decide in context and note it). 
- `rgba(var(--accent-primary-rgb, 33, 150, 243), …)` (875): replace with `color-mix(in srgb, var(--focus) N%, transparent)` at the same opacity (drops the legacy `--accent-primary-rgb` fallback).

Lines 988–1004 are clearly the type-badge palette (text+light-bg pairs) → preserve. Lines in the 1017–1136 range are status banners → tokenize. When an occurrence is genuinely ambiguous, prefer preserving identity hues and tokenizing anything that signals state; record the call in the report.

- [ ] **Step 3: Grep gate**

```bash
cd frontend
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/specialized/PluginInstaller.vue
```
Expected: only preserved type-palette hex remain; zero legacy tokens, zero chrome hex/rgb. List every remaining line in the report with its justification.

- [ ] **Step 4: Suite + lint**

`npx vitest run` → green. `npx eslint src/components/settings/specialized/PluginInstaller.vue` → 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/specialized/PluginInstaller.vue
git commit -F - <<'EOF'
style(settings): restyle PluginInstaller to new shell tokens (E1 Task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Restyle `InstanceModal.vue`

**Files:**
- Modify: `frontend/src/components/settings/specialized/InstanceModal.vue` (782 lines; 20 legacy tokens, 19 unique hex)

**Interfaces:** unchanged — props `show`/`plugin`/`instance`, emits `close`/`save`. Renders `PluginFieldRenderer`-driven config forms from `instance_config_schema` — **do not touch the form logic, only its CSS.**

- [ ] **Step 1: Token map**

Read the file. Replace the 20 legacy tokens per the map (`--accent-primary`→`--focus` ×4, `--bg-primary`→`--bg-1` ×1, `--bg-secondary`→`--bg-2` ×3, `--bg-tertiary`→`--bg-2` ×1, `--border-color`→`--line` ×4, `--text-primary`→`--ink` ×5, `--text-secondary`→`--ink-2` ×2). Apply surface conventions to the modal shell, header, body, footer, and the form inputs/buttons (≥44px, `--focus` rings; Save fills `--focus`, Cancel is a `--bg-2`/`--line` button).

- [ ] **Step 2: Classify and convert the hex**

- **Chrome → token:** scrim `rgba(0,0,0,0.5)` (596) → `color-mix(in srgb, var(--ink) 55%, transparent)`; generic accent `#2196f3` (multiple: 94,183,280,311,323,540,570 — these are the modal's primary accent/focus/active states) → `--focus`; `#1976d2` (733,773, accent hover) → `color-mix(in srgb, var(--focus), black 12%)`; `rgba(33,150,243,0.2)` (680, accent glow) → `color-mix(in srgb, var(--focus) 20%, transparent)`.
- **Status → token:** validation/success `#4caf50` (309), `#3c3`/`#efe`/`#cfc` (701,702,703 success message text/bg) → `--ok` + `color-mix`; error `#f44336` (310), `#c33`/`#fcc`/`#fee` (692,693,694 error message) → `--err` + `color-mix`; warning `#ff9800` (313)/`#ffeb3b` (312) → `--warn` *if* status context.
- **Data → preserve (justify):** the field-type / plugin-type identity icon palette at lines 309–321 (`#4caf50`,`#f44336`,`#ff9800`,`#ffeb3b`,`#9c27b0`,`#e91e63`,`#00bcd4`,`#009688`,`#3f51b5`,`#795548`,`#9e9e9e`) — this is a per-field-type or per-type swatch set. **Decide per context:** if these color icons/badges by data type (string/number/bool/etc.) or plugin type, preserve them as the identity palette and justify; if any single one is a one-off status indicator, tokenize that one. Read lines 305–325 carefully and record the classification in the report.

- [ ] **Step 3: Grep gate** — same command on `InstanceModal.vue`; only justified data palette remains.

- [ ] **Step 4: Suite + lint** — `npx vitest run` green; `npx eslint src/components/settings/specialized/InstanceModal.vue` 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/specialized/InstanceModal.vue
git commit -F - <<'EOF'
style(settings): restyle InstanceModal to new shell tokens (E1 Task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Restyle `PluginCard.vue`

**Files:**
- Modify: `frontend/src/components/settings/specialized/PluginCard.vue` (523 lines; 12 legacy tokens, 14 unique hex)

**Interfaces:** unchanged — one plugin row (header/toggle/expand, config area, action buttons, instance list slot). Do not touch its props/emits/expand logic.

- [ ] **Step 1: Token map** — replace the 12 legacy tokens (`--accent-primary`→`--focus` ×4, `--bg-secondary`→`--bg-2` ×1, `--border-color`→`--line` ×4, `--text-primary`→`--ink` ×1, `--text-secondary`→`--ink-2` ×2). Card surface `--bg-2`/`--line`; action buttons shell vocab (≥44px, `--focus` ring); uninstall/delete → `--err`.

- [ ] **Step 2: Classify and convert the 14 hex**

- **Status → token:** enabled/success `#4caf50` (367) → `--ok`; disabled/warning `#ff9800` (375) → `--warn`; delete/error `#f44336` (371,443,448) + `rgba(244,67,54,0.1)` (447) → `--err` + `color-mix(... var(--err) 10% ...)`; `#ccc` (471, disabled/muted) → `--ink-3` or `--line` per role.
- **Data → preserve (justify):** the plugin-type badge palette `#1976d2`/`#e3f2fd` (386/387), `#7b1fa2`/`#f3e5f5` (391/392), `#388e3c`/`#e8f5e9` (396/397), `#f57c00`/`#fff3e0` (401/402), `#6a1b9a`/`#e1bee7` (406/407) — same per-type identity palette as PluginInstaller; preserve and justify.

- [ ] **Step 3: Grep gate** — same command on `PluginCard.vue`; only the type palette remains.

- [ ] **Step 4: Suite + lint** — `npx vitest run` green; `npx eslint src/components/settings/specialized/PluginCard.vue` 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/specialized/PluginCard.vue
git commit -F - <<'EOF'
style(settings): restyle PluginCard to new shell tokens (E1 Task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Restyle `PluginInstances.vue`

**Files:**
- Modify: `frontend/src/components/settings/specialized/PluginInstances.vue` (362 lines; 16 legacy tokens, 4 unique hex)

**Interfaces:** unchanged — instance list with add/edit/delete/toggle/reorder. Do not touch the drag-reorder mechanics or emits.

- [ ] **Step 1: Token map** — replace the 16 legacy tokens (`--accent-primary`→`--focus` ×4, `--bg-secondary`→`--bg-2` ×1, `--bg-tertiary`→`--bg-2` ×2, `--border-color`→`--line` ×3, `--text-primary`→`--ink` ×2, `--text-secondary`→`--ink-2` ×3, `--text-tertiary`→`--ink-3` ×1). Instance rows are `--bg-2`/`--line` cards; add/edit/toggle buttons shell vocab (≥44px, `--focus`); delete → `--err`.

- [ ] **Step 2: Classify and convert the 4 hex (all chrome/status here)**

- enabled/success `#4caf50` (259) → `--ok`; delete/error `#f44336` (263,348,353) + `rgba(244,67,54,0.1)` (352) → `--err` + `color-mix(... var(--err) 10% ...)`; `#ccc` (308, muted/empty) → `--ink-3`.
- No plugin-type palette in this file → grep gate should return **zero** matches.

- [ ] **Step 3: Grep gate** — same command on `PluginInstances.vue`; expected **no output**.

- [ ] **Step 4: Suite + lint** — `npx vitest run` green; `npx eslint src/components/settings/specialized/PluginInstances.vue` 0 problems.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/specialized/PluginInstances.vue
git commit -F - <<'EOF'
style(settings): restyle PluginInstances to new shell tokens (E1 Task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Restyle `PluginManager.vue`

**Files:**
- Modify: `frontend/src/components/settings/specialized/PluginManager.vue` (314 lines; 5 legacy tokens, 0 hex)

**Interfaces:** unchanged — installed-plugins list + plugin-type tabs (Calendar/Image/Service/Backend/Theme) + theme-info hint. Do not touch the tab-change emit or list rendering.

- [ ] **Step 1: Token map** — replace the 5 legacy tokens (`--accent-primary`→`--focus` ×1, `--bg-primary`→`--bg-1` ×1, `--bg-secondary`→`--bg-2` ×1, `--border-color`→`--line` ×1, `--text-secondary`→`--ink-2` ×1). The active plugin-type tab underline/accent uses `--focus`; tabs get `:focus-visible` rings and ≥44px touch height; the theme-info hint uses `--ink-2`/`--bg-2`.

- [ ] **Step 2: Grep gate** — same command on `PluginManager.vue`; expected **no output** (0 hex, all tokens swapped).

- [ ] **Step 3: Suite + lint** — `npx vitest run` green; `npx eslint src/components/settings/specialized/PluginManager.vue` 0 problems.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/specialized/PluginManager.vue
git commit -F - <<'EOF'
style(settings): restyle PluginManager to new shell tokens (E1 Task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: On-device verification (manual, controller/user)

Not a code task. Against the running stack (frontend `:5174`), open Settings → Plugins (`/settings?setting=plugins`):

- Both sections (**Install**, **Installed Plugins**) render as light shell (`--bg-1` panels, `--line` borders, `--focus` amber accents) with no dark legacy blocks.
- The install-method tabs, URL/branch inputs, and Choose-Zip / install buttons are light; the available-plugins list reads as shell cards.
- The Installed list: plugin-type tabs work with a `--focus` active underline; **plugin-type badges keep their distinct identity colors** (calendar blue, image green, etc. — NOT all amber); status (enabled=green, disabled/warn, error/delete=red) reads via `--ok`/`--warn`/`--err`.
- Open a plugin's config (PluginFieldRenderer form) and the instance modal — both render light and still **save**; toggle/expand/test/uninstall and the pip-warning modal still work.
- Toggle light/dark theme — tokens resolve in both.

---

## Notes for the executor

- Tasks 2–6 are independent (different files); do them in order, each its own commit. Task 1 first (establishes the shell + import the editors render into).
- This is style-only (plus Task 1's wrapper swap). If `npx vitest run` shows a **new** failure after a token/hex swap, something structural changed by mistake — revert that edit; the diff must be CSS/style values (and Task 1's wrapper/import/map) only.
- The single highest-risk judgment is **plugin-type identity palette vs status color**. When unsure, preserve identity hues and tokenize state signals, and record every preserved hex (with its line + reason) in the task report so the reviewer can confirm against on-device.
- `--shadow`, `color-mix(... var(--token) ...)`, and the `black`/`white` keywords are all grep-clean and allowed.
