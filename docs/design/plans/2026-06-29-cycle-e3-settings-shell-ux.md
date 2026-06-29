# Cycle E3 — Settings shell UX (sticky chrome + section indicator) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the settings chrome (top bar, search, category rail) stay fixed so only the options pane scrolls, and replace the invisible/redundant breadcrumb with a prominent live section indicator that updates across all categories.

**Architecture:** Two frontend slices. (1) `Settings.vue` layout CSS becomes a fixed-height app shell (`100dvh`, only `.settings-content` scrolls), with a small-viewport fallback to document scroll and a token cleanup. (2) `SettingsTopBar.vue` drops the 3-level breadcrumb for a single section-name label (falling back to category), and `Settings.vue` removes the now-unused crumb handler and un-gates the scroll-spy `IntersectionObserver` from dashboard-only to all migrated categories.

**Tech Stack:** Vue 3 `<script setup>`, scoped CSS, Vite, Pinia, Vitest.

**Reference spec (authoritative):** `docs/design/2026-06-29-cycle-e3-settings-shell-ux.md`.

## Global Constraints

- **Branch:** `feat/design-settings-cycle-c`. Do **not** create a branch. Do **not** `git push`.
- Frontend-only. Do NOT change `SettingsSection.vue` markup, `useConfigForm`, `settingsRegistry`, or any category-content component. The scroll-spy observer contract (`.settings-section` + `.settings-section__eyebrow`) is unchanged.
- New/changed CSS uses **new shell tokens only** (`--ink`, `--ink-2`, `--ink-3`, `--bg-0/1/2`, `--line`, `--line-soft`, `--focus`, `--err`, `--font-ui`, `--font-display`, `--shadow`); no legacy tokens (`--text-*`, `--bg-primary/secondary/tertiary`, `--border-color`, `--accent-primary`), no hardcoded hex/rgb (use `color-mix(in srgb, var(--token) N%, transparent)`).
- **Staging:** `git add` only the explicit file(s) each task changes. NEVER `git add -A`/`.`. Untracked `.beads/`, `frontend/public/test-calendar.ics`, and the tracked `.beads/issues.jsonl` must never be staged.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -`).
- **Gates:** `cd frontend && npx vitest run` green; `npx eslint src` 0/0. Grep gate (per changed file): `grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' <file>` → no output.

---

### Task 1: Sticky app-shell layout (`Settings.vue`)

**Files:**
- Modify: `frontend/src/views/Settings.vue` (the `<style scoped>` layout rules + token cleanup). No template/script change.

**Interfaces:** none changed — pure CSS. The DOM structure is unchanged: `.settings-page > SettingsTopBar + .settings-body`, where `.settings-body > .settings-search-wrapper + .settings-layout`, and `.settings-layout` is a `220px 1fr` grid of `CategoryRail` (renders `<nav class="category-rail">`) + `.settings-content`.

- [ ] **Step 1: Rework the layout rules**

In `Settings.vue`'s `<style scoped>`, replace the current rules with these. The current versions are:
```css
.settings-page {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}
.settings-body {
  flex: 1;
  padding: var(--space-5, 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1.5rem);
}
.settings-search-wrapper { max-width: 640px; }
.settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-5, 2rem);
  align-items: start;
}
.settings-content { min-width: 0; }
```
Replace with (note `--bg-primary`→`--bg-1`, `--text-primary`→`--ink`, and the app-shell overflow model):
```css
.settings-page {
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-1);
  color: var(--ink);
  display: flex;
  flex-direction: column;
}
.settings-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--space-5, 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1.5rem);
}
.settings-search-wrapper { max-width: 640px; }
.settings-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-5, 2rem);
  align-items: stretch;
}
.settings-content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
/* Rail scrolls independently only if it ever overflows; chrome stays put. */
.settings-layout :deep(.category-rail) {
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
}
```

- [ ] **Step 2: Tokenize the error banner**

Replace:
```css
.settings-banner-error {
  background: rgba(244, 67, 54, 0.15);
  color: var(--text-primary);
  border: 1px solid rgba(244, 67, 54, 0.4);
}
```
with:
```css
.settings-banner-error {
  background: color-mix(in srgb, var(--err) 15%, transparent);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
}
```

- [ ] **Step 3: Add small-viewport fallback to document scroll**

In the existing `@media (max-width: 768px)` block (which already sets `.settings-layout { grid-template-columns: 1fr; }`), add the document-scroll fallback so nothing is unreachable on small screens, and add a short-viewport guard. Append these rules:
```css
@media (max-width: 768px) {
  .settings-page { height: auto; min-height: 100dvh; overflow: visible; }
  .settings-body { overflow: visible; }
  .settings-layout { min-height: auto; }
  .settings-content { overflow-y: visible; min-height: auto; }
  .settings-layout :deep(.category-rail) { max-height: none; overflow-y: visible; }
}
@media (max-height: 600px) {
  .settings-page { height: auto; min-height: 100dvh; overflow: visible; }
  .settings-body { overflow: visible; }
  .settings-content { overflow-y: visible; }
}
```
(Keep the existing `@media (max-width: 768px)` `.settings-body { padding }` / `.settings-layout { grid-template-columns:1fr; gap }` rules — merge these into that block rather than duplicating the media query if simpler.)

- [ ] **Step 4: Verify grep-clean + lint + suite**

Run (from `frontend/`):
```bash
grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/views/Settings.vue
```
Expected: no output.
Run: `npx vitest run` → full suite passes (unchanged count — CSS-only, no test touches this layout).
Run: `npx eslint src/views/Settings.vue` → 0 problems.

This task is **CSS-only**; its real gate is on-device (Task 3). No new unit test (there is no layout/scroll unit test to write meaningfully in jsdom — jsdom does not lay out or scroll).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/Settings.vue
git commit -F - <<'EOF'
feat(settings): sticky app-shell layout — only the options pane scrolls (E3 Task 1)

.settings-page is a fixed 100dvh flex column; top bar, search, and rail stay
put while only .settings-content scrolls. Small/short viewports fall back to
document scroll. Tokenize the page + error-banner legacy remnants.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Topbar section indicator + scroll-spy un-gate

**Files:**
- Modify: `frontend/src/components/settings/shell/SettingsTopBar.vue` (replace breadcrumb nav with a section indicator; drop `crumb` emit)
- Modify: `frontend/src/views/Settings.vue` (drop `@crumb` binding + `onCrumb`; un-gate `setupSectionObserver`)
- Test: `frontend/tests/unit/components/settings/SettingsTopBar.spec.js` (rewrite the two breadcrumb cases)

**Interfaces:**
- `SettingsTopBar` props unchanged: `categoryLabel` (String, required), `sectionLabel` (String, default ""), `saveState` (String, required). Emits: `done` only (remove `crumb`).
- The indicator's displayed text = `sectionLabel` when non-empty, else `categoryLabel`.

- [ ] **Step 1: Rewrite the SettingsTopBar tests (RED)**

Replace the two breadcrumb tests in `frontend/tests/unit/components/settings/SettingsTopBar.spec.js` (keep the `emits done` test as-is). New file body:
```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";

describe("SettingsTopBar", () => {
  it("shows the active section as the location indicator", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", sectionLabel: "Appearance", saveState: "saved" },
    });
    const indicator = w.get(".settings-topbar__location");
    expect(indicator.text()).toBe("Appearance");
    // breadcrumb crumbs are gone
    expect(w.findAll(".topbar__crumb").length).toBe(0);
  });

  it("falls back to the category label when no section is active", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", sectionLabel: "", saveState: "idle" },
    });
    expect(w.get(".settings-topbar__location").text()).toBe("Display");
  });

  it("emits done", async () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", saveState: "idle" },
    });
    await w.get('[data-action="done"]').trigger("click");
    expect(w.emitted("done")).toHaveLength(1);
  });
});
```
Run: `cd frontend && npx vitest run tests/unit/components/settings/SettingsTopBar.spec.js`
Expected: FAIL (no `.settings-topbar__location` element yet; `.topbar__crumb` still present).

- [ ] **Step 2: Replace the breadcrumb with the section indicator (SettingsTopBar.vue)**

In the template, replace the entire breadcrumb nav block:
```html
      <nav class="settings-topbar__breadcrumb" aria-label="Settings navigation">
        <button class="topbar__crumb" type="button" @click="$emit('crumb', 'settings')">Settings</button>
        <span class="settings-topbar__sep" aria-hidden="true">›</span>
        <button class="topbar__crumb" type="button" @click="$emit('crumb', 'category')">{{ categoryLabel }}</button>
        <template v-if="sectionLabel">
          <span class="settings-topbar__sep" aria-hidden="true">›</span>
          <button class="topbar__crumb" type="button" @click="$emit('crumb', 'section')">{{ sectionLabel }}</button>
        </template>
      </nav>
```
with a single non-interactive indicator:
```html
      <span class="settings-topbar__location" aria-live="polite">{{ locationLabel }}</span>
```
(The actual current markup may differ in whitespace/line-wrapping — match by structure: it is the `<nav class="settings-topbar__breadcrumb">…</nav>` inside `.settings-topbar__left`, after the wordmark `<span>`. Replace the whole `<nav>`.)

- [ ] **Step 3: Update the SettingsTopBar script**

- Add a `locationLabel` computed:
```js
const locationLabel = computed(() => props.sectionLabel || props.categoryLabel);
```
(`computed` is already imported.)
- Change `defineEmits(["done", "crumb"]);` to `defineEmits(["done"]);`.

- [ ] **Step 4: Update SettingsTopBar styles**

Remove the `.settings-topbar__breadcrumb`, `.topbar__crumb` (all its variants incl. `:hover`, `:last-of-type`, `:focus-visible`), and `.settings-topbar__sep` rules. Add the indicator style — prominent, separated from the wordmark, shell tokens:
```css
.settings-topbar__location {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink);
  padding-left: 16px;
  border-left: 1px solid var(--line);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```
(The `.settings-topbar__left` already provides `gap: 16px`; the `padding-left` + `border-left` give a clear divider from the `CAL·VIN` wordmark.)

- [ ] **Step 5: Drop the crumb handler + un-gate the observer (Settings.vue)**

(a) Remove the `@crumb="onCrumb"` line from the `<SettingsTopBar … />` tag (keep `:category-label`, `:section-label`, `:save-state`, `@done`).

(b) Delete the `onCrumb` handler:
```js
const onCrumb = which => {
  if (which === "section") {
    const label = sectionLabel.value;
    if (label) {
      const el = [...document.querySelectorAll(".settings-section__eyebrow")]
        .find(e => e.textContent.trim() === label);
      el?.closest(".settings-section")?.scrollIntoView({ behavior: "smooth" });
    }
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};
```
(It is referenced only by the `@crumb` binding you just removed.)

(c) In `setupSectionObserver`, change the dashboard-only early-return:
```js
  if (activeCategory.value !== "dashboard") {
    sectionLabel.value = "";
    return;
  }
```
to:
```js
  if (!MIGRATED_CATEGORIES.has(activeCategory.value)) {
    sectionLabel.value = "";
    return;
  }
```

(d) In the `watch(activeCategory, …)`, change the dashboard branch:
```js
watch(activeCategory, async () => {
  sectionLabel.value = "";
  if (activeCategory.value === "dashboard") {
    await nextTick();
    setupSectionObserver();
  } else {
    teardownSectionObserver();
  }
});
```
to:
```js
watch(activeCategory, async () => {
  sectionLabel.value = "";
  if (MIGRATED_CATEGORIES.has(activeCategory.value)) {
    await nextTick();
    setupSectionObserver();
  } else {
    teardownSectionObserver();
  }
});
```
`MIGRATED_CATEGORIES` is declared later in the file but is referenced only inside these callbacks (which run after mount), so the forward reference is safe. Leave the observer options (`threshold: 0.1`, `rootMargin: "0px 0px -70% 0px"`), the rAF retry, and the eyebrow-text extraction unchanged. Also update the section's comment `// ── Scroll-spy breadcrumb (dashboard only) ──` to drop "(dashboard only)".

- [ ] **Step 6: Run the tests (GREEN) + suite + lint + grep**

Run: `cd frontend && npx vitest run tests/unit/components/settings/SettingsTopBar.spec.js` → 3 passed.
Run: `npx vitest run` → full suite passes (same count; the rewritten file replaces like-for-like).
Run: `npx eslint src/components/settings/shell/SettingsTopBar.vue src/views/Settings.vue` → 0 problems.
Run the grep gate on both `src/components/settings/shell/SettingsTopBar.vue` and `src/views/Settings.vue` → no output.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/settings/shell/SettingsTopBar.vue frontend/src/views/Settings.vue frontend/tests/unit/components/settings/SettingsTopBar.spec.js
git commit -F - <<'EOF'
feat(settings): live section indicator + scroll-spy for all categories (E3 Task 2)

Replace the redundant, low-contrast Settings>Category>Section breadcrumb with a
single prominent section indicator (falls back to category), and un-gate the
scroll-spy IntersectionObserver from dashboard-only to all migrated categories
so it updates live everywhere. Drop the now-unused crumb handler.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: On-device verification (manual, controller/user)

Not a code task. Against the running stack (frontend `:5174`), open Settings at the wall-resolution viewport:
- The top bar, search box, and category rail stay **fixed**; only the options pane scrolls.
- The top bar shows the **current section name** (e.g. on Plugins: "Install", then "Installed plugins" as you scroll), clearly visible and separated from the `CAL·VIN` wordmark; switching categories updates it; before scrolling into a section it shows the category name.
- Confirm it updates on multiple migrated categories (Content, Device, Maintenance), not just dashboard.
- Resize to ≤768px wide and to a short height (<600px): the page falls back to normal scrolling and nothing is cut off/unreachable.
- Toggle light/dark theme — the indicator and chrome render correctly in both.

---

## Notes for the executor

- Task 1 is CSS-only and cannot be meaningfully unit-tested in jsdom (no layout/scroll engine); its gate is grep+lint+suite-still-green plus the on-device check in Task 3. This is intentional, not a missing test.
- Task 2's behavioral surface that IS unit-testable — the topbar indicator + fallback + removed crumbs — is covered by the rewritten `SettingsTopBar.spec.js`. The observer un-gate is a two-line conditional swap (dashboard → `MIGRATED_CATEGORIES`) with no clean unit seam in the heavy `Settings.vue` view; it is verified by review (the conditional reads from `MIGRATED_CATEGORIES`) and by the on-device check that the indicator updates on a non-dashboard category. Do not add a brittle full-`Settings.vue` mount harness for it (YAGNI).
- Do the tasks in order, each its own commit. If `npx vitest run` shows a NEW failure beyond the rewritten SettingsTopBar cases, something structural changed by mistake — investigate; the only intended behavior change is breadcrumb→indicator and the observer un-gate.
