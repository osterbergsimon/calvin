# Regions editor IconButton adoption + header de-crowd — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `DashboardRegionsEditor.vue`'s hand-rolled glyph buttons to the shared `ui/IconButton` primitive, remove the redundant "Activate" control, and de-crowd the screen-card header — with zero behaviour change beyond Activate removal.

**Architecture:** Single-file refactor of `frontend/src/components/settings/shared/DashboardRegionsEditor.vue` plus its spec. Each glyph `<button>` becomes `<IconButton size="sm">` preserving its `aria-label`, `@click`(`.stop`), `title`, and `aria-expanded`. Behaviour-preserving migrations are guarded by the existing spec (aria-label finders); the Activate removal is TDD'd. Header is regrouped into identity vs actions with token-based CSS.

**Tech Stack:** Vue 3 (`<script setup>`), Vitest + `@vue/test-utils`, existing `ui/IconButton.vue`, sizing tokens in `theme.css`.

## Global Constraints

- Editor file: `frontend/src/components/settings/shared/DashboardRegionsEditor.vue`. Spec: `frontend/tests/unit/components/DashboardDisplayTabs.spec.js`.
- `IconButton` API: `label` (required → `aria-label`), `variant` `default|primary|ghost|danger`, `size` `sm|md|lg` (use `sm`), `shape` `square` (default). Single-root `<button>` — `@click`/`aria-*`/`title` fall through natively.
- Use `size="sm"` on every migrated button (baseline 28px; scales via the `.settings-scale` Settings-UI-size zoom).
- Preserve every existing `aria-label` string verbatim (existing tests + a11y depend on them).
- Preserve `@click.stop` where the current button has it (region/sub-level buttons).
- Use sizing tokens for any new CSS (`--space-*`, `--radius-*`, `--line`); no new hardcoded px.
- Run `cd frontend` for all `npx`/`npm` commands. Verify green after each task: `npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`.
- Keep `.split-toggle` CSS and the text buttons (`+ Region`, `+ Sub`, `Split`/`Unsplit`) unchanged.

---

### Task 1: Migrate region + sub delete `×` to IconButton (de-risk `@click.stop` fallthrough)

**Files:**
- Modify: `frontend/src/components/settings/shared/DashboardRegionsEditor.vue` (import ~L565; top-region delete ~L226-234; sub delete ~L267-275; `.region-delete` CSS block ~L1284)
- Test: `frontend/tests/unit/components/DashboardDisplayTabs.spec.js`

**Interfaces:**
- Consumes: `IconButton` from `@/components/ui/IconButton.vue`.
- Produces: region/sub delete buttons rendered as `<button class="icon-btn icon-btn--danger icon-btn--sm ...">` with unchanged `aria-label` and `@click.stop` behaviour.

- [ ] **Step 1: Write the failing test** — add to `DashboardDisplayTabs.spec.js` inside the existing `describe`:

```js
it("renders region delete as a danger IconButton", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  const del = wrapper.find('[aria-label="Delete Region 2"]');
  expect(del.exists()).toBe(true);
  expect(del.classes()).toContain("icon-btn");
  expect(del.classes()).toContain("icon-btn--danger");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "danger IconButton"`
Expected: FAIL (element has class `region-delete`, not `icon-btn`).

- [ ] **Step 3: Add the IconButton import** after the `ToggleSwitch` import (~L565):

```js
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import IconButton from "@/components/ui/IconButton.vue";
```

- [ ] **Step 4: Replace the top-region delete button** (currently `class="region-delete"`, the `removeRegion` one) with:

```vue
<IconButton
  v-if="screen.layout.regions.length > 1"
  :label="`Delete ${regionLabel(previewIndex)}`"
  variant="danger"
  size="sm"
  @click.stop="removeRegion(screenIndex, previewIndex)"
>
  ×
</IconButton>
```

- [ ] **Step 5: Replace the sub-region delete button** (currently `class="region-delete"`, the `removeSub` one) with:

```vue
<IconButton
  v-if="region.split.regions.length > 1"
  :label="`Delete ${regionLabel(previewIndex)} sub ${subIndex + 1}`"
  variant="danger"
  size="sm"
  @click.stop="removeSub(screenIndex, previewIndex, subIndex)"
>
  ×
</IconButton>
```

- [ ] **Step 6: Delete the now-unused `.region-delete` CSS block** (the `.region-delete { … }` rule and its `.region-delete:hover, .region-delete:focus { … }` rule, ~L1284).

- [ ] **Step 7: Run the new test AND the existing removal test** (the fallthrough guard)

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "IconButton" && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "removes a region"`
Expected: PASS both. (The "removes a region" test clicks `[aria-label="Delete Region 2"]`; its passing confirms `@click.stop` composes through IconButton.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "refactor(settings): region/sub delete -> IconButton in regions editor (calvin-4d2)"
```

---

### Task 2: Migrate screen + sub direction toggles to IconButton

**Files:**
- Modify: editor — screen direction button (`class="direction-toggle"`, ~L62-70); sub-direction button (`class="split-toggle"` glyph, ~L195-204); `.direction-toggle` CSS block (~L1300).
- Test: `DashboardDisplayTabs.spec.js`

**Interfaces:**
- Consumes: `IconButton` (Task 1).
- Produces: both direction toggles rendered as `icon-btn icon-btn--default`, glyph content and `toggle*Direction` handlers unchanged.

- [ ] **Step 1: Write the failing test:**

```js
it("renders the screen direction toggle as a default IconButton", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  const dir = wrapper.find('[aria-label="Toggle screen 1 layout direction"]');
  expect(dir.exists()).toBe(true);
  expect(dir.classes()).toContain("icon-btn");
  expect(dir.classes()).toContain("icon-btn--default");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "direction toggle as a default"`
Expected: FAIL (class `direction-toggle`).

- [ ] **Step 3: Replace the screen direction button** with:

```vue
<IconButton
  :label="`Toggle screen ${screenIndex + 1} layout direction`"
  variant="default"
  size="sm"
  :title="`Direction: ${directionLabel(layoutDirectionFor(screen.layout))}`"
  @click="toggleLayoutDirection(screenIndex)"
>
  {{ layoutDirectionFor(screen.layout) === "column" ? "▭▭" : "▯|▯" }}
</IconButton>
```

- [ ] **Step 4: Replace the sub-direction button** (the `.split-toggle` with `toggleSubDirection`) with:

```vue
<IconButton
  v-if="region.split"
  :label="`Toggle ${regionLabel(previewIndex)} split direction`"
  variant="default"
  size="sm"
  :title="`Sub direction: ${directionLabel(splitDirectionFor(screen.layout, region))}`"
  @click.stop="toggleSubDirection(screenIndex, previewIndex)"
>
  {{ splitDirectionFor(screen.layout, region) === "column" ? "▭▭" : "▯|▯" }}
</IconButton>
```

Note: the OTHER `.split-toggle` button (the text `Split`/`Unsplit`, `toggleSplit`) stays unchanged.

- [ ] **Step 5: Delete the `.direction-toggle` CSS block** (`.direction-toggle { … }` and `.direction-toggle:hover, .direction-toggle:focus { … }`, ~L1300). Leave `.split-toggle` CSS intact.

- [ ] **Step 6: Run test + existing direction test**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "refactor(settings): direction toggles -> IconButton in regions editor (calvin-4d2)"
```

---

### Task 3: Migrate collapse toggle `▾/▸` to IconButton (ghost)

**Files:**
- Modify: editor — collapse button (`class="screen-collapse-toggle"`, ~L10-22); `.screen-collapse-toggle` CSS block (~L1220).
- Test: `DashboardDisplayTabs.spec.js`

**Interfaces:**
- Produces: collapse control rendered as `icon-btn icon-btn--ghost`, preserving `aria-expanded` and expand/collapse toggling.

- [ ] **Step 1: Write the failing test:**

```js
it("renders the collapse toggle as a ghost IconButton with aria-expanded", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  const btn = wrapper.find('[aria-label="Expand screen 1"], [aria-label="Collapse screen 1"]');
  expect(btn.exists()).toBe(true);
  expect(btn.classes()).toContain("icon-btn");
  expect(btn.classes()).toContain("icon-btn--ghost");
  expect(btn.attributes("aria-expanded")).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "collapse toggle as a ghost"`
Expected: FAIL (class `screen-collapse-toggle`).

- [ ] **Step 3: Replace the collapse button** with:

```vue
<IconButton
  variant="ghost"
  size="sm"
  :aria-expanded="expandedScreens.has(screen.id)"
  :label="
    expandedScreens.has(screen.id)
      ? `Collapse screen ${screenIndex + 1}`
      : `Expand screen ${screenIndex + 1}`
  "
  @click="toggleScreenExpanded(screen.id)"
>
  {{ expandedScreens.has(screen.id) ? "▾" : "▸" }}
</IconButton>
```

- [ ] **Step 4: Delete the `.screen-collapse-toggle` CSS block** (`.screen-collapse-toggle { … }` and its `:hover, :focus` rule, ~L1220).

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "refactor(settings): collapse toggle -> IconButton in regions editor (calvin-4d2)"
```

---

### Task 4: Migrate screen-delete `×` to IconButton (danger)

**Files:**
- Modify: editor — screen delete button (`class="screen-delete"`, ~L71-79); `.screen-delete` CSS block (~L1347).
- Test: `DashboardDisplayTabs.spec.js`

**Interfaces:**
- Produces: screen delete rendered as `icon-btn icon-btn--danger`, `deleteScreen` handler unchanged.

- [ ] **Step 1: Write the failing test:**

```js
it("renders screen delete as a danger IconButton", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  const del = wrapper.find('[aria-label="Delete screen 1"]');
  expect(del.exists()).toBe(true);
  expect(del.classes()).toContain("icon-btn");
  expect(del.classes()).toContain("icon-btn--danger");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "screen delete as a danger"`
Expected: FAIL (class `screen-delete`).

- [ ] **Step 3: Replace the screen delete button** with:

```vue
<IconButton
  v-if="dashboardScreens.screens.length > 1"
  :label="`Delete screen ${screenIndex + 1}`"
  variant="danger"
  size="sm"
  @click="deleteScreen(screenIndex)"
>
  ×
</IconButton>
```

- [ ] **Step 4: Delete the `.screen-delete` CSS block** (`.screen-delete { … }` and its `:hover, :focus` rule, ~L1347).

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "refactor(settings): screen delete -> IconButton in regions editor (calvin-4d2)"
```

---

### Task 5: Remove the redundant "Activate" control

**Files:**
- Modify: editor — `.screen-activate` button markup (~L32-51); `isActiveScreen` (~L741) and `activateScreen` (~L743-749) functions; `.screen-activate*` CSS blocks (~L1318).
- Test: `DashboardDisplayTabs.spec.js`

**Interfaces:**
- Consumes: nothing new. `activeScreenId` data stays (maintained by `addScreen`/`deleteScreen`; used by `expandedScreens` init).
- Produces: no Activate control in the editor; `isActiveScreen`/`activateScreen` removed.

- [ ] **Step 1: Write the failing test:**

```js
it("does not render an Activate control (screen switching lives on the dashboard dots)", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  expect(wrapper.find('[aria-label="Activate screen 1"]').exists()).toBe(false);
  expect(wrapper.find('[aria-label="Screen 2 is active"]').exists()).toBe(false);
  expect(wrapper.find(".screen-activate").exists()).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "does not render an Activate"`
Expected: FAIL (Activate button present).

- [ ] **Step 3: Delete the `.screen-activate` button** — the entire `<button … class="screen-activate" …>{{ isActiveScreen(screen) ? "● Active" : "Activate" }}</button>` element (~L32-51).

- [ ] **Step 4: Delete the two functions** (~L741-749):

```js
const isActiveScreen = screen => screen?.id === dashboardScreens.value.activeScreenId;

const activateScreen = screenIndex => {
  const screens = cloneScreens();
  const target = screens.screens[screenIndex];
  if (!target) return;
  screens.activeScreenId = target.id;
  emitScreensUpdate(screens);
};
```

- [ ] **Step 5: Delete the `.screen-activate` CSS** — the `.screen-activate`, `.screen-activate:hover:not(:disabled), .screen-activate:focus:not(:disabled)`, `.screen-activate-active`, and `.screen-activate:disabled` rules (~L1318-1345).

- [ ] **Step 6: Run the full editor spec.** The existing "adds and activates a new dashboard screen" test clicks `.screen-add` (not the Activate button) and asserts `activeScreenId` equals the new screen — `addScreen` still sets `activeScreenId`, so it passes unchanged. No edit needed.

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: PASS (all).

- [ ] **Step 7: Verify no dangling references**

Run: `cd frontend && npx eslint src/components/settings/shared/DashboardRegionsEditor.vue`
Expected: exit 0 (no `no-unused-vars` for the removed functions; no undefined `isActiveScreen`/`activateScreen`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "feat(settings): remove redundant Activate control from regions editor (calvin-4d2)

Screen switching lives on the dashboard clock-bar dots (ScreenDots); the
per-screen Activate button was redundant. activeScreenId stays (managed by
add/delete-screen; still auto-expands the live screen on open)."
```

---

### Task 6: De-crowd the screen-card header (identity vs actions groups)

**Files:**
- Modify: editor — `<header class="screen-card-header">` children (~L9-80, now Activate-free); `.screen-card-header` CSS (~L1214).
- Test: `DashboardDisplayTabs.spec.js`

**Interfaces:**
- Produces: header split into `.screen-header-identity` (collapse + index + name) and `.screen-header-actions` (+Region + direction + delete).

- [ ] **Step 1: Write the failing test:**

```js
it("groups the screen header into identity and actions clusters", () => {
  const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
  expect(wrapper.find(".screen-header-identity").exists()).toBe(true);
  expect(wrapper.find(".screen-header-actions").exists()).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js -t "identity and actions"`
Expected: FAIL (groups don't exist).

- [ ] **Step 3: Wrap the header children.** Replace the flat header body so it reads:

```vue
<header class="screen-card-header">
  <div class="screen-header-identity">
    <IconButton …collapse… >{{ … }}</IconButton>
    <span class="screen-index">{{ screenIndex + 1 }}</span>
    <input …class="screen-name-input"… />
  </div>
  <div class="screen-header-actions">
    <button …class="add-region-button"…>+ Region</button>
    <IconButton …direction… >{{ … }}</IconButton>
    <IconButton …screen-delete… v-if="dashboardScreens.screens.length > 1">×</IconButton>
  </div>
</header>
```

(Keep each control's existing attributes exactly as left by Tasks 1-5; only the two wrapping `<div>`s are added.)

- [ ] **Step 4: Update the `.screen-card-header` CSS block** to add the group styles:

```css
.screen-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}
.screen-header-identity {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  flex: 1 1 auto;
  min-width: 0;
}
.screen-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  flex: 0 0 auto;
  padding-left: var(--space-md);
  border-left: 1px solid var(--line);
}
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/shared/DashboardRegionsEditor.vue frontend/tests/unit/components/DashboardDisplayTabs.spec.js
git commit -m "feat(settings): de-crowd regions-editor screen header into identity/actions groups (calvin-4d2)"
```

---

### Task 7: Full verification (suite + lint + live visual)

**Files:** none (verification only).

- [ ] **Step 1: Full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass (901+).

- [ ] **Step 2: Lint + format**

Run: `cd frontend && npx eslint src/components/settings/shared/DashboardRegionsEditor.vue tests/unit/components/DashboardDisplayTabs.spec.js && npx prettier --check src/components/settings/shared/DashboardRegionsEditor.vue tests/unit/components/DashboardDisplayTabs.spec.js`
Expected: eslint exit 0; prettier "All matched files use Prettier code style!". If prettier reports issues, run `npx prettier --write` on the two files and amend the last commit.

- [ ] **Step 3: Confirm no dead selectors remain**

Run: `cd frontend && grep -nE "screen-collapse-toggle|direction-toggle|screen-delete|region-delete|screen-activate" src/components/settings/shared/DashboardRegionsEditor.vue`
Expected: no matches (all migrated + CSS deleted). `.split-toggle` may still appear (kept for the text Split/Unsplit) — that is correct.

- [ ] **Step 4: Live visual verification** — with the dev app running (vite :5175 → backend :8002), open Settings → Display → Screens & regions. Confirm:
  - Collapse (▾/▸), direction (▭▭/▯|▯), and delete (×) render as IconButtons; delete is red on hover; collapse is borderless (ghost).
  - Header reads as identity (collapse+number+name) vs actions (+Region, direction, delete) with the divider.
  - No Activate button anywhere.
  - Expand/collapse, add/delete region, split/unsplit, direction toggle, and delete-region all work; clicking a delete button removes the region without side effects.
  - Set Settings UI size to XL (Appearance) and confirm the buttons scale proportionally.

- [ ] **Step 5: No commit needed** unless Step 2 required a prettier fixup.

---

## Notes for the executor

- The two `.split-toggle` uses are different buttons: the glyph sub-direction toggle (migrated in Task 2) and the text `Split`/`Unsplit` (kept). Do not delete `.split-toggle` CSS.
- `IconButton` glyph content goes in the default slot (`>×<`, `>▾<`, etc.), not a prop.
- If any `@click.stop` migration regresses (Task 1 Step 7 fails), stop and investigate `IconButton` fallthrough before continuing — every later delete/sub button depends on it.
