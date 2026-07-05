# Service Region Cohesion + Token Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the four dashboard service-region components off legacy color/radius tokens and onto the redesign's semantic vocabulary + `ui/IconButton`, so a service region is visually indistinguishable from the calendar region.

**Architecture:** Pure frontend. Three files get token/radius swaps; `WebServiceViewer.vue` additionally migrates its five bespoke icon buttons to the existing `ui/IconButton` primitive. No backend, no store, no API changes.

**Tech Stack:** Vue 3 SFCs (scoped CSS), Vitest + @vue/test-utils, ESLint, Vite build, Playwright (visual verification).

## Global Constraints

- Redesign exposes a **single accent** = `--focus` (amber). There is no `--accent` token.
- Legacy → semantic map (verbatim): `--bg-primary`→`--bg-1`, `--bg-secondary`→`--bg-2`, `--bg-tertiary`→`--bg-0`, `--text-primary`→`--ink`, `--text-secondary`→`--ink-2`, `--text-tertiary`→`--ink-3`, `--border-color`→`--line`, `--accent-primary`→`--focus`, `--accent-secondary`→hover via `filter: brightness(1.08)`, `--accent-error`→`--err`.
- Hardcoded `4px`/`8px` control/surface radius → `var(--radius-sm)` (8px).
- `IconButton` API: `label` (required, becomes aria-label), `variant` (default|primary|ghost|danger), `size` (sm|md|lg|custom; default sm), `shape` (square|circle; default square), `active`, `disabled`. Single `<button>` root, so `title`/`data-*`/`@click` fall through. Import path `@/components/ui/IconButton.vue`.
- Done = no legacy `--bg-primary`/`--bg-secondary`/`--bg-tertiary`/`--text-primary`/`--text-secondary`/`--text-tertiary`/`--border-color`/`--accent-*` remain in the four files; tests/lint/build green.
- Commands run from `frontend/`.

---

### Task 1: ServiceViewer.vue — one-line token swap

**Files:**
- Modify: `frontend/src/components/service/ServiceViewer.vue:110`
- Test: `frontend/tests/unit/components/ServiceViewer.spec.js` (existing; no change expected)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Make the change**

In the `.unknown-service` rule, swap the legacy token:

```css
.unknown-service {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  color: var(--ink-2);
  gap: 0.5rem;
}
```

- [ ] **Step 2: Verify no legacy tokens remain in the file**

Run: `grep -nE "text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color|accent-" src/components/service/ServiceViewer.vue`
Expected: no output (exit 1).

- [ ] **Step 3: Run the existing spec**

Run: `npx vitest run tests/unit/components/ServiceViewer.spec.js`
Expected: PASS (unchanged behavior).

- [ ] **Step 4: Commit**

```bash
git add src/components/service/ServiceViewer.vue
git commit -m "refactor(service): migrate ServiceViewer unknown-state to semantic token (calvin-0wr)"
```

---

### Task 2: IframeViewer.vue — error-dialog token + radius migration

**Files:**
- Modify: `frontend/src/components/service/IframeViewer.vue` (style block, lines ~117-212)
- Test: `frontend/tests/unit/components/plugins/EmbedOverlay.spec.js` (existing; no change expected — asserts behavior, not tokens)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace the style block**

Replace the entire `<style scoped>` block with this token-migrated version (only colors/radius change; layout untouched):

```css
<style scoped>
.iframe-viewer {
  width: 100%;
  height: 100%;
  position: relative;
}

.service-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg-1);
}

.service-iframe.iframe-error {
  opacity: 0.3;
}

.iframe-error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-1);
  z-index: 10;
}

.error-content {
  text-align: center;
  padding: 2rem;
  max-width: 500px;
}

.error-content h3 {
  margin: 0 0 1rem 0;
  color: var(--err);
  font-size: 1.5rem;
}

.error-content p {
  margin: 0.5rem 0;
  color: var(--ink-2);
}

.service-url {
  font-family: monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: var(--ink);
  background: var(--bg-2);
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  margin: 1rem 0;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.btn-open-new,
.btn-retry {
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-open-new {
  background: var(--focus);
  color: var(--focus-ink);
  text-decoration: none;
  border: none;
}

.btn-open-new:hover {
  filter: brightness(1.08);
}

.btn-retry {
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
}

.btn-retry:hover {
  background: var(--bg-0);
}
</style>
```

- [ ] **Step 2: Verify no legacy tokens remain in the file**

Run: `grep -nE "text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color|accent-|border-radius: 4px" src/components/service/IframeViewer.vue`
Expected: no output (exit 1).

- [ ] **Step 3: Run the EmbedOverlay spec (IframeViewer's live consumer)**

Run: `npx vitest run tests/unit/components/plugins/EmbedOverlay.spec.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/service/IframeViewer.vue
git commit -m "refactor(service): migrate IframeViewer error dialog to semantic tokens (calvin-0wr)"
```

---

### Task 3: WebServiceViewer.vue — IconButton migration + token/radius swaps

This task changes DOM structure (bespoke `<button class="dashboard-panel__icon-button">` and `.btn-close-fullscreen` → `<IconButton>`), so its unit tests change first (TDD).

**Files:**
- Modify: `frontend/src/components/WebServiceViewer.vue` (template lines 4-14, 53-84; script import; style lines 321/328-329/290 + delete `.btn-close-fullscreen` button rules)
- Test: `frontend/tests/unit/components/WebServiceViewer.spec.js:112,119,129`

**Interfaces:**
- Consumes: `IconButton` from `@/components/ui/IconButton.vue` (label required; title/data-*/@click fall through).
- Produces: nothing consumed downstream. After migration, all service icon buttons render `<button class="icon-btn ...">` instead of `.dashboard-panel__icon-button`; the fullscreen-close button ALSO becomes `.icon-btn` (kept identifiable via `class="btn-close-fullscreen"` which falls through onto the IconButton root).

- [ ] **Step 1: Update the failing tests**

The three navigation/action buttons in the actions slot become `.icon-btn`, and the fullscreen-close overlay button also becomes `.icon-btn`. Scope the nav-count assertions to the ServiceViewer stub (`.service-viewer-stub`, which renders the `#actions` slot) so they count only the action buttons, not the overlay close.

In `tests/unit/components/WebServiceViewer.spec.js`, line 112:

```javascript
    expect(wrapper.find(".service-viewer-stub").findAll(".icon-btn")).toHaveLength(2);
```

Line 119:

```javascript
    expect(wrapper.find(".service-viewer-stub").findAll(".icon-btn")).toHaveLength(2);
```

Line 129 stays as-is (`title="Enter Fullscreen"` still falls through onto the IconButton root):

```javascript
    await wrapper.get('[title="Enter Fullscreen"]').trigger("click");
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx vitest run tests/unit/components/WebServiceViewer.spec.js`
Expected: FAIL — `.icon-btn` not found (component still renders `.dashboard-panel__icon-button`), lengths 0 ≠ 2.

- [ ] **Step 3: Migrate the fullscreen-close overlay (template lines 4-14)**

Replace the overlay block with an IconButton, keeping `.btn-close-fullscreen` as the float-chrome hook:

```html
    <!-- Fullscreen Close Button (only in fullscreen mode) -->
    <div v-if="isFullscreen" class="fullscreen-close-overlay">
      <IconButton
        class="btn-close-fullscreen"
        size="lg"
        shape="circle"
        data-action="exit-fullscreen"
        label="Exit fullscreen"
        title="Close Fullscreen (ESC)"
        @click.stop="handleCloseFullscreen"
      >
        ×
      </IconButton>
    </div>
```

- [ ] **Step 4: Migrate the four action buttons (template lines 53-84)**

Replace the four `<button class="dashboard-panel__icon-button">` elements in the `#actions` slot:

```html
            <IconButton
              v-if="!isTouch && canNavigateServices && services.length > 1"
              label="Previous Service"
              title="Previous Service"
              @click="previousService"
            >
              ‹
            </IconButton>
            <IconButton
              v-if="!isTouch && canNavigateServices && services.length > 1"
              label="Next Service"
              title="Next Service"
              @click="nextService"
            >
              ›
            </IconButton>
            <IconButton
              v-if="!isTouch && !isFullscreen"
              label="Enter Fullscreen"
              title="Enter Fullscreen"
              @click.stop="handleToggleFullscreen"
            >
              ⤢
            </IconButton>
            <IconButton
              v-if="!isFullscreen"
              label="Close"
              title="Close"
              @click.stop="handleClose"
            >
              ×
            </IconButton>
```

- [ ] **Step 5: Add the import**

In `<script setup>`, after the existing `DashboardPanel` import (line ~96), add:

```javascript
import IconButton from "@/components/ui/IconButton.vue";
```

- [ ] **Step 6: Migrate style tokens + radius, and reduce `.btn-close-fullscreen` to float chrome**

In the `<style scoped>` block:

`.web-service-viewer` — `border-radius: 8px` → `var(--radius-sm)`:

```css
.web-service-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border-radius: var(--radius-sm);
  overflow: visible; /* let the focused panel glow bloom out */
}
```

`.loading-state, .no-services` — `--text-tertiary` → `--ink-3`:

```css
.loading-state,
.no-services {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ink-3);
  gap: 1rem;
}
```

`.spinner` — `--border-color` → `--line`, `--accent-primary` → `--focus`:

```css
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--line);
  border-top: 4px solid var(--focus);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

Replace the whole `.btn-close-fullscreen` rule set (chrome now comes from IconButton lg/circle/default; keep only the floating-overlay affordance — shadow, hover scale, and `pointer-events: auto` since the overlay is `pointer-events: none`):

```css
.btn-close-fullscreen {
  pointer-events: auto;
  box-shadow: 0 4px 12px var(--shadow);
}

.btn-close-fullscreen:hover {
  transform: scale(1.1);
}
```

- [ ] **Step 7: Run the spec to verify it passes**

Run: `npx vitest run tests/unit/components/WebServiceViewer.spec.js`
Expected: PASS (all assertions, including the two scoped `.icon-btn` length-2 checks and the `title="Enter Fullscreen"` click).

- [ ] **Step 8: Verify no legacy tokens remain in the file**

Run: `grep -nE "text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color|accent-|dashboard-panel__icon-button" src/components/WebServiceViewer.vue`
Expected: no output (exit 1).

- [ ] **Step 9: Commit**

```bash
git add src/components/WebServiceViewer.vue tests/unit/components/WebServiceViewer.spec.js
git commit -m "refactor(service): migrate WebServiceViewer icon buttons to IconButton + semantic tokens (calvin-0wr)"
```

---

### Task 4: Full verification — suite, lint, build, visual parity

**Files:** none modified (verification only).

**Interfaces:** consumes the three prior tasks.

- [ ] **Step 1: Global legacy-token guard across all four files**

Run:
```bash
grep -rnE "text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color|accent-primary|accent-secondary|accent-error|dashboard-panel__icon-button" \
  src/components/WebServiceViewer.vue \
  src/components/service/IframeViewer.vue \
  src/components/service/ServiceViewer.vue \
  src/components/dashboard/ServiceRegionViewOptions.vue
```
Expected: no output (exit 1). (ServiceRegionViewOptions was already clean — this confirms it.)

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: PASS (all specs; ~937+ tests green).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean, no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: vite build succeeds, no errors.

- [ ] **Step 5: Visual parity check (Playwright)**

Launch the app, open the dashboard with a focused calendar region beside a focused service region, and screenshot. Then trigger the iframe error state (an embedded service that refuses framing) and screenshot the dialog.
Expected: service-region control sizing/radius/color matches the calendar region; iframe error dialog shows amber (`--focus`) primary button, `--err` heading, `--bg-1` backdrop. Attach screenshots to bead calvin-0wr.

- [ ] **Step 6: No commit** (verification only — all code already committed in Tasks 1-3).
```
