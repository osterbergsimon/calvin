# Calendar sources + refresh rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rebuild `CalendarSourcesTab.vue` into a shell-native CRUD editor (add/list/color/show-time/enable/remove + refresh), behavior preserved.

**Architecture:** Single-component rebuild in place. Same path, same props (`config`) + emit (`update:config`) → `ContentSettings` unchanged. All calendar store/API contracts preserved verbatim (spec §2). Data colors preserved.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vitest. From `frontend/`: `npx vitest run`, `npx eslint src`.

**Reference spec (authoritative — read it):** `docs/design/2026-06-30-calendar-sources-rebuild.md`. §2 = the contracts to preserve, §3 = the new UI, §4 = tests.

## Global Constraints
- Branch `feat/design-settings-cycle-c`; do NOT push/branch.
- Preserve EVERY contract in spec §2 (store `fetchSources`/`updateSource(id, fullObject)`/`sources`; `calendarApi.addCalendarSource`/`deleteCalendarSource` direct + each followed by `fetchSources()`; `pluginsApi.getPlugins({plugin_type:"calendar"})` + hardcoded fallback; `usePlugins().pluginInstances` running dot; per-source fields incl. `color` as DATA hex via `getColorValue` default `#2196f3`; `show_time !== false`; global `calendarRefreshInterval` via props/emit, not store).
- New chrome uses new shell tokens only. The ONLY permitted hex in the file is the `getColorValue` named→hex palette + the `#2196f3` default (data colors — justify in the report). No legacy tokens. No `CollapsibleSection`.
- Stage only the changed files. NEVER `git add -A`. Untracked `.beads/` + `frontend/public/test-calendar.ics` never staged. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (git commit -F -).

---

### Task 1: Rebuild `CalendarSourcesTab.vue` + tests

**Files:**
- Rewrite: `frontend/src/components/settings/tabs/content/CalendarSourcesTab.vue`
- Test: `frontend/tests/unit/components/settings/CalendarSourcesTab.spec.js` (new)

**Interfaces:** unchanged — `defineProps({ config: { type: Object, required: true } })`, `defineEmits(["update:config"])`. `ContentSettings` renders `<CalendarSourcesTab :config @update:config/>` and stubs it in its own spec — do not change `ContentSettings`.

- [ ] **Step 1: Read the current file + the spec.** Read `CalendarSourcesTab.vue` (current 724-line version) to harvest the exact store/api usage, the `getColorValue` map, per-type placeholders/help text, and the hardcoded fallback type list — these are reused verbatim. Read the spec (§2/§3/§4).

- [ ] **Step 2: Write the failing component tests (RED).** Create `CalendarSourcesTab.spec.js`. Mock `@/stores/calendar` (useCalendarStore with `fetchSources` vi.fn, `updateSource` vi.fn, `sources` ref), `@/services/calendarApi` (`addCalendarSource`/`deleteCalendarSource` vi.fn), `@/services/pluginsApi` (`getPlugins`), and `@/composables` (`usePlugins` → `{ pluginInstances: ref(...) }`). Mirror the mocking style of existing `frontend/tests/unit/components/settings/*.spec.js`. Assert (each its own `it`):
  - mounts and calls `fetchSources()` on mount.
  - add: filling name+url and clicking "Add calendar" calls `calendarApi.addCalendarSource(objectWith({name,ical_url,type,color,show_time:true}))` then `fetchSources()`.
  - color change on a source calls `updateSource(id, objectContaining({ color: <hex> }))` with the full source spread.
  - show_time toggle calls `updateSource(id, objectContaining({ show_time }))`.
  - enabled toggle calls `updateSource(id, objectContaining({ enabled }))`.
  - remove → confirm calls `deleteCalendarSource(id)` then `fetchSources()`.
  - refresh interval change emits `update:config` with `{ calendarRefreshInterval }`.
  - "Refresh now" calls `calendarStore.refreshEvents()`.
  - data color: a source whose `color` is a named color (e.g. `"green"`) renders the color input as the mapped hex (`getColorValue`) — color is not tokenized.
  Run `npx vitest run tests/unit/components/settings/CalendarSourcesTab.spec.js` → FAIL (component not yet rebuilt to satisfy them).

- [ ] **Step 3: Rebuild the component (GREEN).** Replace the template + script per spec §3: shell add-form (type `<select>`, name, url, Add button disabled until name+url), per-source cards (`--bg-2`/`--line`) with color input + show_time `ToggleSwitch` + enabled `ToggleSwitch` + remove→`ConfirmModal`, empty state, and a refresh `SettingRow` (`NumberStepper` 5–120 step 5 + "Refresh now" button calling `refreshEvents()`). Import shell components from `@/components/settings/shell/*` (SettingsSection is the parent's; here use `SettingRow`, `ToggleSwitch`, `NumberStepper`) and `ConfirmModal` from `@/components/settings/shared/ConfirmModal.vue`. Carry over `getColorValue`, the per-type placeholders/help, and the fallback type list verbatim. Keep all store/api call sites exactly per §2. `<style scoped>` uses shell tokens only (data colors excepted). Run the spec → PASS.

- [ ] **Step 4: Full verify.** `npx vitest run` → full suite green (prior count + new tests; `ContentSettings.spec` still green since it stubs this component). `npx eslint src/components/settings/tabs/content/CalendarSourcesTab.vue src/.../CalendarSourcesTab.spec.js` → 0. Grep gate: `grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/tabs/content/CalendarSourcesTab.vue` → only the `getColorValue` palette + `#2196f3` default remain (list them as justified data colors in the report); zero legacy tokens, zero chrome hex.

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/components/settings/tabs/content/CalendarSourcesTab.vue frontend/tests/unit/components/settings/CalendarSourcesTab.spec.js
git commit -F - <<'EOF'
feat(settings): rebuild calendar sources + refresh as shell-native CRUD editor

Replace the CollapsibleSection form with shell add-form + per-source cards
(color/show-time/enable/remove) + a refresh interval stepper and Refresh-now.
All calendar store/api contracts and per-source data colors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: On-device verification (manual, controller)
Against the running stack: Settings → Content Sources → Calendars. Add a source (type/name/url), edit its color, toggle show-times + enable, remove it (confirm); change the refresh interval; click Refresh now. Confirm the panel is light shell, source colors render as their data colors, and behavior matches the old editor.

## Notes for the executor
- This is a rebuild, not a restyle: the template/script change substantially, but the externally observable behavior (the store/api calls, props/emits) MUST be identical to the current component. If a test can't assert a contract because the mock isn't wired, fix the mock — don't change the contract.
- Carry `getColorValue` + the fallback type list + per-type placeholders verbatim from the current file.
- "Refresh now" (`refreshEvents()`) is the one additive affordance; everything else preserves current behavior.
