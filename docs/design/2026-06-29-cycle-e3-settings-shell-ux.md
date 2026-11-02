# Calvin — Cycle E3: Settings shell UX (sticky chrome + topbar section indicator)

**Status:** Design approved. Awaiting implementation planning.
**Date:** 2026-06-29
**Bead:** `calvin-4zj`.
**Builds on:** Cycle 1 shell migration + E1/E2. Branch `feat/design-settings-cycle-c`.

---

## 1. Goal & scope

Two related fixes to the **settings shell chrome** (not category content), addressing user-reported issues:

1. **Sticky chrome** — the whole settings page currently scrolls as one document, so the top bar, search, and category rail scroll away. Make the chrome stay put so **only the options pane scrolls** — an app-shell layout suited to the wall display.
2. **Topbar location indicator** — the existing breadcrumb (`Settings › Category › Section`) is tiny, low-contrast text jammed against the `CAL·VIN` wordmark (invisible on a wall display), and its section-level crumb scroll-spy is hardcoded to the dashboard category only, so it never updates on the migrated categories. Since sticky chrome keeps the `CategoryRail` (which already highlights the active category) always visible, the `Settings › Category` levels are redundant. Replace the breadcrumb with a single **prominent, live section indicator**, and un-gate the scroll-spy so it works on every category.

**Non-goals:** No category-content changes; no new settings; no change to `useConfigForm`, `settingsRegistry` search, or `SettingsSection`'s markup (the observer already keys off its `.settings-section__eyebrow`). Frontend-only.

## 2. Part 1 — Sticky app-shell layout

Files: `frontend/src/views/Settings.vue` (layout `<style>` + a small token cleanup).

Current: `.settings-page { min-height: 100vh; }` and the window scrolls everything. Target: a fixed-height app shell where only the content pane scrolls.

- `.settings-page` → `height: 100dvh; overflow: hidden;` (keep `display: flex; flex-direction: column;`).
- `SettingsTopBar` (first child) stays a fixed-height band — it does not scroll because the page itself does not.
- `.settings-body` → `flex: 1; min-height: 0; overflow: hidden;` (so it fills the remaining height and constrains its children). Keep its padding.
- The `.settings-search-wrapper` stays a fixed row at the top of the body.
- `.settings-layout` → `flex: 1; min-height: 0;` (still a `220px 1fr` grid, `align-items: start`).
- `.settings-content` → `overflow-y: auto;` (the ONLY scroll container) plus `min-height: 0`. The `220px` `CategoryRail` column stays fixed; add `overflow-y: auto; max-height: 100%` on the rail column only so a future long rail scrolls independently rather than overflowing.
- **Scroll-spy compatibility:** the `IntersectionObserver` in `Settings.vue` uses the viewport as root. Because `.settings-content` fills the viewport, scrolling it still moves sections through the viewport, so the observer keeps firing correctly — no observer/root change needed.
- **Responsive:** at `max-width: 768px` the layout already collapses to one column. On short/narrow viewports, allow the page to fall back to normal document scrolling (`.settings-page { height: auto; min-height: 100dvh; overflow: visible; }` inside the breakpoint, with `.settings-content { overflow: visible; }`) so nothing becomes unreachable on small screens.
- **Token cleanup (fold in while here):** `.settings-page` uses `--bg-primary`/`--text-primary` and `.settings-banner-error` uses hardcoded `rgba(244,67,54,…)`. Tokenize: `--bg-primary→--bg-1`, `--text-primary→--ink`; the error banner → `--err` via `color-mix(in srgb, var(--err) N%, transparent)` for bg/border and `--ink`/`--err` for text. No other legacy tokens may remain in `Settings.vue`'s `<style>`.

## 3. Part 2 — Topbar section indicator + scroll-spy un-gate

Files: `frontend/src/components/settings/shell/SettingsTopBar.vue`, `frontend/src/views/Settings.vue`.

### SettingsTopBar.vue
- Remove the breadcrumb `<nav class="settings-topbar__breadcrumb">` with its three `topbar__crumb` buttons and `settings-topbar__sep` separators, and the `@crumb` emit.
- Add a single **section indicator** element in its place: a non-interactive label showing the current location. Its text is `sectionLabel` when set, else the `categoryLabel` (never blank). Style it prominently and clearly separated from the wordmark: `--ink` color (not `--ink-2`), `--font-ui`, ~`1rem`/`500` weight, with visible separation from the wordmark (e.g. a gap + a `--line` divider or sufficient left margin). Keep the existing right side (save-state pill + `Done`) unchanged.
- Props: keep `categoryLabel`, `sectionLabel`, `saveState`. Drop the `crumb` emit (keep `done`).

### Settings.vue
- Drop the `@crumb="onCrumb"` binding on `<SettingsTopBar>` and remove the now-unused `onCrumb` handler (and any helper it alone used). Keep `:category-label`, `:section-label`, `:save-state`, `@done`.
- **Un-gate the scroll-spy:** in `setupSectionObserver`, replace the `if (activeCategory.value !== "dashboard")` early-return with `if (!MIGRATED_CATEGORIES.has(activeCategory.value))`; and in the `watch(activeCategory, …)`, set up the observer for any migrated category (not only `dashboard`) and tear it down otherwise. The rAF-retry, observer options (`threshold: 0.1`, `rootMargin: "0px 0px -70% 0px"`), and eyebrow-text extraction are unchanged.
- Net effect: the topbar section indicator updates live as you scroll, on every migrated category (Dashboard, Clock-bar, Content, Device, Maintenance, Plugins).

## 4. Behavior & compatibility

- The location indicator is informational only (no navigation); removing the crumb click-to-scroll is intentional (the rail handles category navigation; sections are reached by scrolling). Verify no other code depends on the `crumb` emit before removing it.
- Save-state pill and `Done` behavior unchanged.
- `SettingsSection` markup unchanged; the observer contract (`.settings-section`, `.settings-section__eyebrow`) is unchanged.

## 5. Testing

**Frontend (vitest):**
- Scroll-spy un-gate: a test that, for a non-dashboard migrated category, the observer is set up and `sectionLabel` is populated from a section's eyebrow (mock `IntersectionObserver` as needed, mirroring any existing Settings.vue test harness). At minimum, assert `setupSectionObserver` no longer early-returns for a non-dashboard migrated category (e.g. `content`).
- `SettingsTopBar`: renders the section indicator with `sectionLabel` when provided, and falls back to `categoryLabel` when `sectionLabel` is empty; the breadcrumb crumb buttons / `@crumb` emit are gone; the save pill and `Done` still render/emit.

**Gates:** full `npx vitest run` green; `npx eslint src` 0/0; grep — no legacy tokens/hex in `Settings.vue` or `SettingsTopBar.vue` after the change.

**On-device (the real gate for sticky):** open Settings on the wall-resolution viewport — the top bar, search, and category rail stay fixed while only the options pane scrolls; the topbar shows the current section name and it updates as you scroll through sections on a migrated category (e.g. Plugins: "Install" → "Installed plugins"); switching categories updates it; at the 768px breakpoint and on a short viewport the page remains fully scrollable/reachable. Light + dark theme both render.

## 6. Decomposition (for the plan)

1. **Sticky app-shell layout** — `Settings.vue` layout `<style>` rework + token cleanup. On-device-gated.
2. **Topbar section indicator + scroll-spy un-gate** — `SettingsTopBar.vue` (replace breadcrumb with indicator) + `Settings.vue` (drop `onCrumb`, un-gate observer) + vitest.

## 7. Deferred / related

- The new P3 follow-up to align the ZIP-upload install path with no-restart behavior (from E2) is separate.
- Dead dashboard cleanup (`calvin-jat`), regions editor (`calvin-4k8`), C1 polish (`calvin-1te`), calendar fullscreen (`calvin-00s`) — unrelated, own beads.
