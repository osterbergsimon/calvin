# Cycle C1 — Settings Shell + Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new Settings shell (category rail with focus-light, promoted search, breadcrumbs, eyebrow-sectioned ~72px touch rows, restyled controls) and prove it on the Display category, preserving auto-save / search / plugin forms and the frozen dashboard keyboard.

**Architecture:** `views/Settings.vue` is rebuilt to orchestrate a new shell composed of small focused components under `components/settings/shell/`. The Display rail entry renders a new `DisplaySettings.vue` (eyebrow sections of `SettingRow`s using Cycle-A controls); the other five rail entries render their existing category components inside the new shell unchanged. Every row writes its existing `configStore` key through the existing `useConfigForm` auto-save path.

**Tech Stack:** Vue 3 (`<script setup>`), Vite, Pinia (composition stores), Vue Router, Vitest + `@vue/test-utils`. Builds on Cycle-A primitives (`FocusPanel`, `SegmentedControl`, `ToggleSwitch`, `SelectPill`, tokens, `useTypeTheme`) already on this branch.

## Global Constraints

Every task implicitly includes these (from the spec `docs/design/2026-06-28-cycle-c-settings.md`).

- **Dashboard keyboard vocabulary is FROZEN** — do not modify `useKeyboardActions.js`. Settings uses standard web keyboard; new controls must be keyboard-operable with visible `:focus-visible`.
- **No hardcoded hex or font-family** in new/restyled components — use semantic tokens (`--bg-0/1/2`, `--line`, `--line-soft`, `--ink`, `--ink-2`, `--ink-3`, `--focus`, `--focus-ink`, `--focus-glow`, `--focus-edge`, `--ok/--warn/--err`) and font-role tokens (`--font-display`, `--font-ui`, `--font-data`).
- **Preserve behavior:** `useConfigForm` auto-save + save-status (don't change its API); `settingsRegistry` search; `PluginFieldRenderer`/`InstanceModal` plugin forms (untouched).
- **Touch targets ≥ 44px**; `prefers-reduced-motion` respected by focus-light + popovers.
- **Staging discipline:** the working tree has untracked `.beads/` and `frontend/public/test-calendar.ics`, plus possibly other pre-existing modified files. **Never `git add -A`/`.`** — stage only the exact files each task changes, by path.
- **Commit trailer:** every commit message ends with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -` with a heredoc).
- **Do NOT `git push`** — the controller handles pushing.
- **Run a single test file:** `npx vitest run <path>` from `frontend/`. Full suite: `npx vitest run`. Lint: `npx eslint src`.

## Key interfaces (verified, copy exactly)

- `useConfigForm()` → `{ localConfig, loadConfig, updateConfig, error, saveStatus }`. `updateConfig(updates)` merges into `localConfig.value` and saves immediately (no debounce). `saveStatus` is a computed `{ state, message }` where `state ∈ {"idle","saving","saved","error"}`.
- Category contract (existing + new): a category component takes prop `config` (Object) and emits `update:config(patchObject)`. `Settings.vue` passes `localConfig` and routes the emit to `updateConfig`.
- `settingsRegistry`: `settingsCategories` = `[{ id, label, icon }]` (ids: `dashboard`, `clock-bar`, `content`, `plugins`, `device`, `maintenance`); `settingsDestinations` = `[{ id, label, path, category, tabKey, tab, keywords }]`; `filterSettingsDestinations(query, limit=8)`; `getSettingDestinationById(id)`; `SETTINGS_CATEGORY_STORAGE_KEY="settings_active_category"`; `defaultSettingsCategoryId="dashboard"`.
- Cycle-A controls (all emit `update:modelValue`):
  - `SegmentedControl` props `{ modelValue:[String,Number], options:[{value,label,icon?}], ariaLabel }`
  - `ToggleSwitch` props `{ modelValue:Boolean, ariaLabel }`
  - `SelectPill` props `{ modelValue:[String,Number], options:[{value,label}], swatch:String(css-var) }`
- `useTypeTheme()` → `{ current(ref<string>), applyTypeTheme(id), loadTypeTheme() }`; `TYPE_THEMES` keys `instrument|marquee|station`; `DEFAULT_TYPE_THEME="instrument"`; `isTypeTheme(id)`.
- `ThemeSelector` props `{ themes:Array, selectedThemeId:String, loading:Boolean, showHelp:Boolean }`, emits `select(themeId)`. Theme list loaded via `pluginsApi.getPlugins({ plugin_type: "theme" })` → `{ plugins:[...] }`.
- `CalendarView.vue` rolling view currently hardcodes 4 weeks: `for (let i = 0; i < 28; i++)` (~line 561); `viewMode = computed(() => configStore.calendarViewMode)`; `weekStartDay = computed(() => configStore.weekStartDay ?? 1)`; helpers `getWeekStart(date)` / `adjustDayOfWeek(dayOfWeek)`.

## File structure

**New:**
- `frontend/src/components/ui/NumberStepper.vue` — bounded number control.
- `frontend/src/components/settings/shell/SettingsTopBar.vue`
- `frontend/src/components/settings/shell/CategoryRail.vue`
- `frontend/src/components/settings/shell/SettingsSearch.vue`
- `frontend/src/components/settings/shell/SettingsSection.vue`
- `frontend/src/components/settings/shell/SettingRow.vue`
- `frontend/src/components/settings/shell/TypefacePicker.vue`
- `frontend/src/components/settings/shell/ThemePicker.vue`
- `frontend/src/components/settings/categories/DisplaySettings.vue`
- Specs mirroring each under `frontend/tests/unit/...`.

**Modified:**
- `frontend/src/stores/config.js`, `frontend/src/stores/configRegistry.js`, `frontend/src/composables/useConfigForm.js` — add `calendarWeeks`.
- `frontend/src/components/CalendarView.vue` — rolling grid honors `calendarWeeks`.
- `frontend/src/components/settings/settingsRegistry.js` — add `subtitle` to each category; remap Display destinations to section anchors.
- `frontend/src/views/Settings.vue` — rebuild the shell.

---

## Task 1: `calendarWeeks` config key + rolling-grid support

**Files:**
- Modify: `frontend/src/stores/config.js`, `frontend/src/stores/configRegistry.js`, `frontend/src/composables/useConfigForm.js`, `frontend/src/components/CalendarView.vue`
- Test: `frontend/tests/unit/stores/configCalendarWeeks.spec.js` (create), `frontend/tests/unit/components/CalendarViewRolling.spec.js` (create)

**Interfaces — Produces:** `configStore.calendarWeeks` (number, default 4); rolling calendar renders `calendarWeeks` weeks (clamped 1–12).

- [ ] **Step 1: Failing config test**

Create `frontend/tests/unit/stores/configCalendarWeeks.spec.js`:
```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

describe("config store — calendarWeeks", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("defaults to 4", () => {
    expect(useConfigStore().calendarWeeks).toBe(4);
  });
  it("syncs from a backend payload (snake_case)", async () => {
    const store = useConfigStore();
    await store.updateConfig({ calendar_weeks: 6 });
    expect(store.calendarWeeks).toBe(6);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/unit/stores/configCalendarWeeks.spec.js`

- [ ] **Step 3: Add the key.** In `config.js`: add `const calendarWeeks = ref(4);` near `calendarViewMode`, add `calendarWeeks,` to the `configRefs` object and to the store's `return {}`. In `configRegistry.js` `CONFIG_FIELD_DEFINITIONS`, add after the `calendarViewMode` entry:
```javascript
{ name: "calendarWeeks", keys: ["calendarWeeks", "calendar_weeks"], defaultValue: 4 },
```
In `useConfigForm.js` `loadConfig`, near the `calendarViewMode` line add:
```javascript
calendarWeeks: response.calendarWeeks ?? response.calendar_weeks ?? 4,
```

- [ ] **Step 4: Run — expect PASS** (2 tests).

- [ ] **Step 5: Failing rolling test**

Create `frontend/tests/unit/components/CalendarViewRolling.spec.js`. Mock the calendar/images stores as the existing `DashboardRegionSurfaces.spec.js` does (vi.mock vue-router useRoute; stub schema data). Assert the rolling grid day-count = `calendarWeeks * 7`:
```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

describe("CalendarView rolling weeks", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.events = []; cal.sources = []; cal.loading = false;
    const cfg = useConfigStore();
    cfg.showUI = true; cfg.calendarViewMode = "rolling";
  });
  it("renders calendarWeeks*7 day cells in rolling view", async () => {
    useConfigStore().calendarWeeks = 3;
    const w = mount(CalendarView, { props: { sourceIds: [] } });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(21);
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (gets 28, the hardcoded value).

- [ ] **Step 7: Implement rolling support.** In `CalendarView.vue` rolling branch, replace the hardcoded loop bound and add a clamp. Add near the other computeds:
```javascript
const rollingWeeks = computed(() => Math.min(12, Math.max(1, configStore.calendarWeeks ?? 4)));
```
and in the rolling `calendarDays` branch change `for (let i = 0; i < 28; i++)` to `for (let i = 0; i < rollingWeeks.value * 7; i++)`. Leave the month/week/day branches untouched.

- [ ] **Step 8: Run both specs — expect PASS.** `npx vitest run tests/unit/stores/configCalendarWeeks.spec.js tests/unit/components/CalendarViewRolling.spec.js`

- [ ] **Step 9: Commit**
```bash
git add frontend/src/stores/config.js frontend/src/stores/configRegistry.js frontend/src/composables/useConfigForm.js frontend/src/components/CalendarView.vue frontend/tests/unit/stores/configCalendarWeeks.spec.js frontend/tests/unit/components/CalendarViewRolling.spec.js
git commit -F - <<'EOF'
feat(settings): add calendarWeeks config + rolling-grid week count

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: `NumberStepper` control

**Files:** Create `frontend/src/components/ui/NumberStepper.vue`; Test `frontend/tests/unit/components/ui/NumberStepper.spec.js`

**Interfaces — Produces:** `<NumberStepper :model-value :min :max :step :aria-label />`, emits `update:modelValue` with a clamped number. `−`/`+` buttons (≥44px), value display, `:focus-visible`.

- [ ] **Step 1: Failing test**
```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import NumberStepper from "@/components/ui/NumberStepper.vue";

describe("NumberStepper", () => {
  it("increments and decrements within bounds", async () => {
    const w = mount(NumberStepper, { props: { modelValue: 4, min: 1, max: 6, ariaLabel: "Weeks" } });
    await w.get('[data-step="inc"]').trigger("click");
    expect(w.emitted("update:modelValue").at(-1)).toEqual([5]);
    await w.setProps({ modelValue: 6 });
    await w.get('[data-step="inc"]').trigger("click"); // clamp at max
    expect(w.emitted("update:modelValue").at(-1)).toEqual([6]);
  });
  it("clamps at min", async () => {
    const w = mount(NumberStepper, { props: { modelValue: 1, min: 1, max: 6 } });
    await w.get('[data-step="dec"]').trigger("click");
    expect(w.emitted("update:modelValue").at(-1)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `frontend/src/components/ui/NumberStepper.vue`:
```vue
<template>
  <div class="stepper" role="group" :aria-label="ariaLabel">
    <button type="button" class="stepper__btn" data-step="dec" aria-label="Decrease" @click="bump(-step)">−</button>
    <span class="stepper__value" aria-live="polite">{{ modelValue }}</span>
    <button type="button" class="stepper__btn" data-step="inc" aria-label="Increase" @click="bump(step)">+</button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: -Infinity },
  max: { type: Number, default: Infinity },
  step: { type: Number, default: 1 },
  ariaLabel: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);
const bump = delta => {
  const next = Math.min(props.max, Math.max(props.min, props.modelValue + delta));
  emit("update:modelValue", next);
};
</script>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 2px;
}
.stepper__btn {
  min-width: 44px;
  min-height: 44px;
  font-size: 1.25rem;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}
.stepper__btn:hover {
  background: var(--bg-1);
}
.stepper__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.stepper__value {
  min-width: 2.5ch;
  text-align: center;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink);
}
</style>
```

- [ ] **Step 4: Run — expect PASS** (2 tests).
- [ ] **Step 5: Commit** (`git add` the two files; trailer).

---

## Task 3: Category subtitles + `CategoryRail`

**Files:** Modify `frontend/src/components/settings/settingsRegistry.js` (add `subtitle` per category); Create `frontend/src/components/settings/shell/CategoryRail.vue`; Test `frontend/tests/unit/components/settings/CategoryRail.spec.js`

**Interfaces — Consumes:** `settingsCategories` (now with `subtitle`), `FocusPanel`. **Produces:** `<CategoryRail :categories :active-id @select="id => ..." />` — one focus-lit button per category (title + subtitle); active = focus-light (`FocusPanel :focused`); tap or ArrowUp/Down+Enter selects.

- [ ] **Step 1:** In `settingsRegistry.js`, add a `subtitle` to each `settingsCategories` entry (verbatim from the mock): dashboard → `"Layout · appearance · regions"`, clock-bar → `"Time · weather · status tiles"`, content → `"Calendars · photos · services"`, plugins → `"Install · manage · themes"`, device → `"Power · keyboard · hardware"`, maintenance → `"Updates · diagnostics"`. Keep existing `id`/`label`/`icon`.

- [ ] **Step 2: Failing test**
```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CategoryRail from "@/components/settings/shell/CategoryRail.vue";

const cats = [
  { id: "dashboard", label: "Display", subtitle: "Layout · appearance · regions" },
  { id: "clock-bar", label: "Clock bar", subtitle: "Time · weather · status tiles" },
];

describe("CategoryRail", () => {
  it("renders an entry per category and marks the active one", () => {
    const w = mount(CategoryRail, { props: { categories: cats, activeId: "dashboard" } });
    const btns = w.findAll(".category-rail__item");
    expect(btns).toHaveLength(2);
    expect(w.find(".category-rail__item.is-active").text()).toContain("Display");
    expect(w.text()).toContain("Layout · appearance · regions");
  });
  it("emits select on click", async () => {
    const w = mount(CategoryRail, { props: { categories: cats, activeId: "dashboard" } });
    await w.findAll(".category-rail__item")[1].trigger("click");
    expect(w.emitted("select")[0]).toEqual(["clock-bar"]);
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement** `CategoryRail.vue`. Use `FocusPanel` per item (`:focused="cat.id === activeId"`), `as="button"` (FocusPanel renders the `as` element). Each item: title (`--font-ui`, `--ink`) + subtitle (`--ink-3`). `data`/class `category-rail__item` + `is-active` when focused. `@click="$emit('select', cat.id)"`, `type="button"`, `:aria-current`. Add `:focus-visible`. (Roving tabindex / arrow nav optional but add ArrowUp/Down moving focus between items for the keyboard unit.)

- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit** (`settingsRegistry.js`, `CategoryRail.vue`, its spec; trailer).

---

## Task 4: `SettingRow` + `SettingsSection`

**Files:** Create `frontend/src/components/settings/shell/SettingRow.vue`, `frontend/src/components/settings/shell/SettingsSection.vue`; Test `frontend/tests/unit/components/settings/SettingRowSection.spec.js`

**Interfaces — Produces:**
- `<SettingRow :label :description>` — label + description (left), default slot control (right); ~72px min-height; token-styled.
- `<SettingsSection :id :title>` — eyebrow `title` (uppercase tracked label) + a panel wrapping default-slot rows; the root carries the `id` (for anchor/scroll-spy).

- [ ] **Step 1: Failing test**
```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

describe("SettingRow + SettingsSection", () => {
  it("SettingRow renders label, description and the control slot", () => {
    const w = mount(SettingRow, {
      props: { label: "Orientation", description: "How panels arrange." },
      slots: { default: "<button class='ctl'>x</button>" },
    });
    expect(w.find(".setting-row__label").text()).toBe("Orientation");
    expect(w.find(".setting-row__desc").text()).toBe("How panels arrange.");
    expect(w.find(".setting-row__control .ctl").exists()).toBe(true);
  });
  it("SettingsSection renders an eyebrow title and exposes its id", () => {
    const w = mount(SettingsSection, { props: { id: "layout", title: "Layout" }, slots: { default: "<p>rows</p>" } });
    expect(w.find(".settings-section").attributes("id")).toBe("section-layout");
    expect(w.find(".settings-section__eyebrow").text()).toBe("Layout");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
`SettingRow.vue`:
```vue
<template>
  <div class="setting-row">
    <div class="setting-row__info">
      <div class="setting-row__label">{{ label }}</div>
      <p v-if="description" class="setting-row__desc">{{ description }}</p>
    </div>
    <div class="setting-row__control"><slot /></div>
  </div>
</template>
<script setup>
defineProps({ label: { type: String, required: true }, description: { type: String, default: "" } });
</script>
<style scoped>
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; min-height: 72px; padding: 0.75rem 1.25rem; }
.setting-row + .setting-row { border-top: 1px solid var(--line-soft); }
.setting-row__info { min-width: 0; }
.setting-row__label { font-family: var(--font-ui); font-size: 1rem; font-weight: 500; color: var(--ink); }
.setting-row__desc { margin: 0.2rem 0 0; font-size: 0.85rem; line-height: 1.4; color: var(--ink-2); }
.setting-row__control { flex-shrink: 0; }
</style>
```
`SettingsSection.vue`:
```vue
<template>
  <section :id="`section-${id}`" class="settings-section">
    <div class="settings-section__eyebrow">{{ title }}</div>
    <div class="settings-section__panel"><slot /></div>
  </section>
</template>
<script setup>
defineProps({ id: { type: String, required: true }, title: { type: String, required: true } });
</script>
<style scoped>
.settings-section { scroll-margin-top: 1rem; }
.settings-section__eyebrow { font-family: var(--font-data); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-3); margin: 1.25rem 0.25rem 0.5rem; }
.settings-section__panel { background: var(--bg-1); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
</style>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 5: `SettingsSearch`

**Files:** Create `frontend/src/components/settings/shell/SettingsSearch.vue`; Test `frontend/tests/unit/components/settings/SettingsSearch.spec.js`

**Interfaces — Consumes:** `filterSettingsDestinations`. **Produces:** `<SettingsSearch @jump="destination => ..." />` — full-width input; live results from `filterSettingsDestinations(query)`; selecting a result emits `jump(destination)` and clears; pressing `/` (when not already focused) focuses the input; Escape clears.

- [ ] **Step 1: Failing test**
```javascript
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
vi.mock("@/components/settings/settingsRegistry", () => ({
  filterSettingsDestinations: q =>
    q === "orient" ? [{ id: "dashboard-layout", label: "Layout", path: "Display / Layout", category: "dashboard" }] : [],
}));
import SettingsSearch from "@/components/settings/shell/SettingsSearch.vue";

describe("SettingsSearch", () => {
  it("shows results and emits jump on selection", async () => {
    const w = mount(SettingsSearch);
    await w.get("input").setValue("orient");
    const results = w.findAll(".settings-search__result");
    expect(results).toHaveLength(1);
    await results[0].trigger("click");
    expect(w.emitted("jump")[0][0].id).toBe("dashboard-layout");
    expect(w.get("input").element.value).toBe("");
  });
  it("shows nothing for an empty query", async () => {
    const w = mount(SettingsSearch);
    expect(w.find(".settings-search__result").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `SettingsSearch.vue`: input bound to a `query` ref; `results = computed(() => filterSettingsDestinations(query.value))`; render `.settings-search__result` per result (label + `path` muted); `@click` → `emit('jump', dest)` + clear query. Add a global `keydown` listener (registered on mount, removed on unmount) that focuses the input on `/` when the active element isn't an input/textarea; Escape clears. Token-styled, `/` kbd hint, `:focus-visible`. Magnifier glyph.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 6: `SettingsTopBar`

**Files:** Create `frontend/src/components/settings/shell/SettingsTopBar.vue`; Test `frontend/tests/unit/components/settings/SettingsTopBar.spec.js`

**Interfaces — Produces:** `<SettingsTopBar :category-label :section-label :save-state @done @crumb="target => ..." />`:
- Left: `CAL·VIN` wordmark + breadcrumb `Settings › {categoryLabel} [› {sectionLabel}]` (section crumb only when `sectionLabel` set). Crumbs are buttons emitting `crumb("settings"|"section")`.
- Right: a save-status pill reflecting `saveState` (`"saving"|"saved"|"error"|"idle"`) with text + a status dot; a `Done` button emitting `done`.

- [ ] **Step 1: Failing test**
```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";

describe("SettingsTopBar", () => {
  it("shows breadcrumb with category and section", () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", sectionLabel: "Appearance", saveState: "saved" } });
    const t = w.text();
    expect(t).toContain("Settings");
    expect(t).toContain("Display");
    expect(t).toContain("Appearance");
  });
  it("omits the section crumb when no section", () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", sectionLabel: "", saveState: "idle" } });
    expect(w.findAll(".topbar__crumb").length).toBe(2); // Settings + Display
  });
  it("emits done", async () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", saveState: "idle" } });
    await w.get('[data-action="done"]').trigger("click");
    expect(w.emitted("done")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `SettingsTopBar.vue`. Props `{ categoryLabel:String, sectionLabel:{type:String,default:""}, saveState:String }`. Wordmark uses `--font-display` with the focus-colored `·`. Breadcrumb crumbs are `<button class="topbar__crumb">`; render Settings + category always, section when `sectionLabel`. Save pill maps `saveState`→ dot color (`--ok` saved/idle, `--warn` saving, `--err` error) + a label (`Saved`/`Saving…`/`Error`/`All changes saved`). `Done` is the primary `--focus`-filled button (`data-action="done"`). Tokens only, `:focus-visible`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 7: `TypefacePicker`

**Files:** Create `frontend/src/components/settings/shell/TypefacePicker.vue`; Test `frontend/tests/unit/components/settings/TypefacePicker.spec.js`

**Interfaces — Consumes:** `useTypeTheme`, `SelectPill`, `TYPE_THEMES`. **Produces:** `<TypefacePicker />` — a `SelectPill` whose options are the type themes (`instrument`→"Instrument", `marquee`→"Marquee", `station`→"Station"), bound to `useTypeTheme().current`; selecting calls `applyTypeTheme(id)`.

- [ ] **Step 1: Failing test**
```javascript
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
const applyTypeTheme = vi.fn();
const current = ref("instrument");
vi.mock("@/composables/useTypeTheme", () => ({ useTypeTheme: () => ({ current, applyTypeTheme, loadTypeTheme: vi.fn() }) }));
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";

describe("TypefacePicker", () => {
  it("lists the three type themes and applies on change", async () => {
    const w = mount(TypefacePicker);
    // SelectPill is real; open + pick is component-specific, so drive via the emitted model:
    w.findComponent({ name: "SelectPill" }).vm.$emit("update:modelValue", "marquee");
    await w.vm.$nextTick();
    expect(applyTypeTheme).toHaveBeenCalledWith("marquee");
  });
});
```
(If `SelectPill` has no `name`, target it via `findComponent(SelectPill)` with the imported component.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `TypefacePicker.vue`: build `options = [{value:'instrument',label:'Instrument'},{value:'marquee',label:'Marquee'},{value:'station',label:'Station'}]`; `<SelectPill :model-value="current" :options="options" @update:model-value="applyTypeTheme" />`. Import `useTypeTheme` + `SelectPill`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 8: `ThemePicker`

**Files:** Create `frontend/src/components/settings/shell/ThemePicker.vue`; Test `frontend/tests/unit/components/settings/ThemePicker.spec.js`

**Interfaces — Consumes:** `ThemeSelector`, `pluginsApi.getPlugins`. **Produces:** `<ThemePicker :selected-theme-id @select="themeId => ..." />` — a pill trigger (swatch + current theme name + chevron); tapping opens a popover containing `ThemeSelector` (theme cards). Loads themes on mount via `pluginsApi.getPlugins({ plugin_type: "theme" })`. Selecting a card emits `select(themeId)` and closes. Outside-click + Escape close (reuse the SelectPill close pattern).

- [ ] **Step 1: Failing test** (mock the API + stub ThemeSelector):
```javascript
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("@/services/pluginsApi", () => ({
  getPlugins: vi.fn().mockResolvedValue({ plugins: [{ id: "midnight", name: "Midnight", type: "theme" }] }),
  getPlugin: vi.fn().mockResolvedValue({}),
}));
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
const stubs = { ThemeSelector: { name: "ThemeSelector", props: ["themes", "selectedThemeId", "loading"], emits: ["select"], template: '<div class="theme-selector-stub" @click="$emit(\'select\', themes[0]?.id)" />' } };

describe("ThemePicker", () => {
  it("opens the popover and emits select", async () => {
    const w = mount(ThemePicker, { props: { selectedThemeId: null }, global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(w.find(".theme-picker__popover").exists()).toBe(false);
    await w.get(".theme-picker__trigger").trigger("click");
    expect(w.find(".theme-picker__popover").exists()).toBe(true);
    await w.get(".theme-selector-stub").trigger("click");
    expect(w.emitted("select")[0]).toEqual(["midnight"]);
    expect(w.find(".theme-picker__popover").exists()).toBe(false); // closes after select
    w.unmount();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `ThemePicker.vue`: props `{ selectedThemeId: String }`, emits `select`. On mount, load themes (mirror `AppearanceTab.loadThemes`: `pluginsApi.getPlugins({plugin_type:'theme'})` → filter `type==='theme'`; optionally enrich via `getPlugin`). Trigger pill shows the selected theme's `name` (or "Theme") + a `--focus` swatch + chevron. Popover (`.theme-picker__popover`) renders `<ThemeSelector :themes :selected-theme-id="selectedThemeId" :loading @select="onSelect" />`; `onSelect(id)` → `emit('select', id)` + close. Document-listener outside-click + Escape close (registered while open only; removed on close + `onUnmounted`). Token-styled.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 9: `DisplaySettings` (Display category as eyebrow rows)

**Files:** Create `frontend/src/components/settings/categories/DisplaySettings.vue`; Test `frontend/tests/unit/components/settings/DisplaySettings.spec.js`

**Interfaces — Consumes:** `SettingsSection`, `SettingRow`, `SegmentedControl`, `ToggleSwitch`, `SelectPill`, `NumberStepper`, `ThemePicker`, `TypefacePicker`. **Produces:** `<DisplaySettings :config @update:config="patch => ..." />` — same category contract as the existing components. Renders the sections/rows from the spec §4. Each control's change emits `update:config({ key: value })`. Section ids: `layout`, `calendar`, `appearance`, `notifications`, `plugin-display`.

**Row spec (exact key ↔ control; build each as `<SettingRow><Control/></SettingRow>` inside the matching `<SettingsSection>`):**

| Section (id) | Row label | Control | config key | options / notes |
|---|---|---|---|---|
| LAYOUT (`layout`) | Orientation | SegmentedControl | `orientation` | `[{value:'landscape',label:'Landscape'},{value:'portrait',label:'Portrait'}]` |
| | Flip 180° | ToggleSwitch | `orientationFlipped` | |
| | Apply display rotation | ToggleSwitch | `applyDisplayRotation` | |
| CALENDAR (`calendar`) | Calendar view | SelectPill | `calendarViewMode` | `[{value:'month',label:'Month'},{value:'week',label:'Week'},{value:'day',label:'Day'},{value:'rolling',label:'Rolling'}]` |
| | Weeks to show | NumberStepper | `calendarWeeks` | `min:1 max:12` |
| | Week starts on | SelectPill | `weekStartDay` | 7 entries: `{value:1,label:'Monday'}…{value:0,label:'Sunday'}` |
| | Show week numbers | ToggleSwitch | `showWeekNumbers` | |
| | Time format | SegmentedControl | `timeFormat` | `[{value:'24h',label:'24h'},{value:'12h',label:'12h'}]` |
| | Max visible events | NumberStepper | `maxVisibleEvents` | `min:1 max:20` |
| | Highlight holidays | ToggleSwitch | `showRedDays` | |
| APPEARANCE (`appearance`) | Theme | ThemePicker | `selectedTheme` | `@select` → `{selectedTheme:id}` |
| | Theme mode | SelectPill | `themeMode` | `[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'auto',label:'Auto'},{value:'time',label:'Time'}]` |
| | Typeface | TypefacePicker | (type theme; self-contained) | no config key |
| | Focus light | SelectPill | `focusLightMode` | `[{value:'interaction',label:'When navigating'},{value:'always',label:'Always on'},{value:'off',label:'Off'}]` |
| | Dim other regions | ToggleSwitch | `focusLightDimOthers` | |
| | Hide controls in kiosk mode | ToggleSwitch | (`showUI` inverted) | row value = `!config.showUI`; emit `{showUI: !checked}` |
| | Touch controls | SelectPill | `touchControls` | `[{value:'auto',label:'Auto'},{value:'on',label:'Always on'},{value:'off',label:'Off'}]` |
| | Touch control size | SegmentedControl | `touchControlSize` | `[{value:'small',label:'Small'},{value:'medium',label:'Medium'},{value:'large',label:'Large'}]` |
| | Display name | text input | `displayName` | styled `<input>` row; emit on input |
| NOTIFICATIONS (`notifications`) | Enable feedback | ToggleSwitch | `keyboardFeedbackEnabled` | |
| | Feedback style | SegmentedControl | `keyboardFeedbackMode` | `[{value:'normal',label:'Normal'},{value:'small',label:'Small'}]` |
| | Auto-hide delay (s) | NumberStepper | `modeIndicatorTimeout` | `min:0 max:60` |
| PLUGIN DISPLAY (`plugin-display`) | Meal-plan card size | SegmentedControl | `mealPlanCardSize` | `[{value:'small',label:'Small'},{value:'medium',label:'Medium'},{value:'large',label:'Large'}]` |

Add a plain-language `description` to each row (one short sentence; e.g. Orientation → "How panels arrange on the screen.").

**Binding pattern (every control):** `:model-value="config.<key>"` + `@update:model-value="v => emit('update:config', { <key>: v })"`. For the inverted kiosk row: `:model-value="!config.showUI"` + `@update:model-value="v => emit('update:config', { showUI: !v })"`. For ThemePicker: `:selected-theme-id="config.selectedTheme"` + `@select="id => emit('update:config', { selectedTheme: id })"`. For the Time-mode reveal: when `config.themeMode === 'time'`, render two extra `NumberStepper` rows (`darkModeStart` min 0 max 23, `darkModeEnd` min 0 max 23). `weekendDays` (array multi-select) — keep simple: render the existing multi-day control if trivial to reuse, else a row of toggle chips; if uncertain, OMIT weekendDays from C1 and note it for C2 (it's a multi-select, lower priority) — do NOT block on it.

- [ ] **Step 1: Failing test** — assert representative bindings, especially the new keys and the inverted kiosk row:
```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DisplaySettings from "@/components/settings/categories/DisplaySettings.vue";

const baseConfig = () => ({
  orientation: "landscape", orientationFlipped: false, applyDisplayRotation: true,
  calendarViewMode: "month", calendarWeeks: 4, weekStartDay: 1, showWeekNumbers: false,
  timeFormat: "24h", maxVisibleEvents: 4, showRedDays: false,
  selectedTheme: null, themeMode: "auto", focusLightMode: "interaction", focusLightDimOthers: true,
  showUI: true, touchControls: "auto", touchControlSize: "medium", displayName: "",
  keyboardFeedbackEnabled: true, keyboardFeedbackMode: "normal", modeIndicatorTimeout: 5,
  mealPlanCardSize: "medium",
});

const stubs = { ThemePicker: true, TypefacePicker: true };

describe("DisplaySettings", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("renders the five eyebrow sections", () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    ["layout", "calendar", "appearance", "notifications", "plugin-display"].forEach(id =>
      expect(w.find(`#section-${id}`).exists()).toBe(true)
    );
  });
  it("emits update:config for the focus-light mode select", async () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    // drive the SelectPill bound to focusLightMode via its emitted model event
    const pills = w.findAllComponents({ name: "SelectPill" });
    // find the one wired to focusLightMode by its options (contains 'When navigating')
    const focusPill = pills.find(p => (p.props("options") || []).some(o => o.value === "always"));
    focusPill.vm.$emit("update:modelValue", "always");
    expect(w.emitted("update:config").some(c => c[0].focusLightMode === "always")).toBe(true);
  });
  it("inverts the kiosk toggle (Hide controls → showUI:false)", async () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    const toggles = w.findAllComponents({ name: "ToggleSwitch" });
    // the kiosk row's toggle shows !showUI (=false); toggling emits true → showUI:false
    // (identify by surrounding label text via the row; simplest: assert at least one emit sets showUI)
    // Drive every toggle and assert a showUI:false emit appears for the inverted one.
    for (const t of toggles) t.vm.$emit("update:modelValue", true);
    expect(w.emitted("update:config").some(c => c[0].showUI === false)).toBe(true);
  });
});
```
(If components lack a `name`, import them and use `findAllComponents(SelectPill)` etc.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `DisplaySettings.vue` per the row table. Structure: `<div>` of five `<SettingsSection :id :title>` blocks, each containing `<SettingRow>`s wrapping the mapped control. `defineProps({ config: { type: Object, required: true } })`, `defineEmits(["update:config"])`. Use the binding pattern above. Tokens only; the text input for `displayName` styled to match the control language (≥44px, `--bg-2`/`--line`).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

---

## Task 10: Rebuild `Settings.vue` shell

**Files:** Modify `frontend/src/views/Settings.vue`; Test `frontend/tests/unit/views/SettingsShell.spec.js` (create)

**Interfaces — Consumes:** `SettingsTopBar`, `CategoryRail`, `SettingsSearch`, `DisplaySettings`, the existing category components, `useConfigForm`, `settingsRegistry`. **Produces:** the rebuilt Settings screen.

**Behavior to implement (preserve existing semantics):**
- Layout: `SettingsTopBar` (top), `SettingsSearch` (below), then a two-column `CategoryRail` (left) + content (right).
- `activeCategory` ref (init from `?setting=` destination's category → else `SETTINGS_CATEGORY_STORAGE_KEY` → else `defaultSettingsCategoryId`); persist to that storage key on change. `CategoryRail @select` sets it.
- Content: when `activeCategory === 'dashboard'` render `<DisplaySettings :config="localConfig" @update:config="handleConfigUpdate" />`; otherwise render the existing category component for that id (`clock-bar`→`ClockBarCategory`, `content`→`ContentSourcesCategory`, `plugins`→`PluginsCategory`, `device`→`DeviceCategory`, `maintenance`→`MaintenanceCategory`) with the same `:config`/`@update:config`.
- `useConfigForm`: `const { localConfig, loadConfig, updateConfig, saveStatus } = useConfigForm();` `handleConfigUpdate = updates => updateConfig(updates)`; call `loadConfig()` on mount. Pass `:save-state="saveStatus.state"` to the top bar.
- `SettingsSearch @jump="onJump"`: `onJump(dest)` sets `activeCategory = dest.category`; if it's the dashboard/Display category, `nextTick` then scroll to `#section-${sectionForTab(dest.tab)}` (map former Display tab → section id: `layout→layout`, `calendar→calendar`, `appearance→appearance`, `notifications→notifications`, `plugin-display→plugin-display`); else keep existing tab/sessionStorage behavior for old categories. Update the route `?setting=` as before.
- Breadcrumb: pass `:category-label` (active category's label) and `:section-label` (scroll-spy: the `SettingsSection` whose top is nearest the viewport top; implement with an IntersectionObserver over `.settings-section` elements, only meaningful for `dashboard`). Top bar `@done` → `router.push('/')` (return to dashboard, like the old Back). `@crumb` → scroll to top / section.
- Keep the existing route-return / config reload semantics.

- [ ] **Step 1: Failing test** — stub heavy children; assert orchestration:
```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
const push = vi.fn();
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {}, path: "/settings" }), useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/composables/useConfigForm", () => ({
  useConfigForm: () => ({
    localConfig: { value: { orientation: "landscape" } },
    loadConfig: vi.fn().mockResolvedValue(), updateConfig: vi.fn().mockResolvedValue(),
    error: { value: "" }, saveStatus: { value: { state: "idle", message: "" } },
  }),
}));
import Settings from "@/views/Settings.vue";

const stubs = {
  SettingsTopBar: { template: '<div class="topbar-stub" />' },
  SettingsSearch: { template: '<div class="search-stub" />' },
  CategoryRail: { props: ["categories", "activeId"], emits: ["select"], template: '<div class="rail-stub" @click="$emit(\'select\', \'clock-bar\')" />' },
  DisplaySettings: { template: '<div class="display-stub" />' },
  ClockBarCategory: { template: '<div class="clockbar-stub" />' },
  ContentSourcesCategory: true, PluginsCategory: true, DeviceCategory: true, MaintenanceCategory: true,
};

describe("Settings shell", () => {
  beforeEach(() => { setActivePinia(createPinia()); push.mockClear(); });
  it("renders DisplaySettings for the default (dashboard) category", () => {
    const w = mount(Settings, { global: { stubs } });
    expect(w.find(".display-stub").exists()).toBe(true);
  });
  it("switches to an existing category component on rail select", async () => {
    const w = mount(Settings, { global: { stubs } });
    await w.find(".rail-stub").trigger("click");
    await flushPromises();
    expect(w.find(".clockbar-stub").exists()).toBe(true);
    expect(w.find(".display-stub").exists()).toBe(false);
  });
});
```
(`useConfigForm` mock returns `saveStatus` as a `{value}` to mimic a computed ref; adjust if the real shape differs — the component reads `saveStatus.value.state` or `saveStatus.state` consistently.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the rebuild per the behavior list. Read the current `Settings.vue` first and preserve the route/sessionStorage/config-reload logic; replace the header/search/sidebar markup with the new shell components; swap the dashboard category render to `DisplaySettings`. Keep the other category imports/renders.

- [ ] **Step 4: Run the shell spec + existing settings specs — expect PASS:**
`npx vitest run tests/unit/views/SettingsShell.spec.js tests/unit/components/settingsRegistry.spec.js tests/unit/components/SettingItem.spec.js tests/unit/components/SettingsCategories.spec.js tests/unit/composables/useConfigForm.spec.js`

- [ ] **Step 5: Commit.**

---

## Task 11: Full-suite + lint gate, and on-device verification

**Files:** none (verification).

- [ ] **Step 1:** `npx vitest run` — all green (incl. dashboard keyboard/mode/layout specs untouched, proving the frozen vocabulary).
- [ ] **Step 2:** `npx eslint src` — 0 errors. Fix any introduced.
- [ ] **Step 3: Manual checklist** (record in PR): the new top bar + breadcrumb (category, and section via scroll-spy); promoted search jumps to category + scrolls to section; rail focus-light on active; Display category shows eyebrow sections with all rows; the new keys (focus-light mode/dim, touch controls/size, display name) read + write + persist; Theme pill opens the card popover and selects; Typeface pill switches the type theme live; Calendar view → Rolling + Weeks-to-show changes the dashboard rolling grid; other 5 categories still open (old UI) inside the new shell; auto-save status pill reacts; Done returns to dashboard. Keyboard: tab/arrows operate every control with visible focus.
- [ ] **Step 4:** Commit any lint fixes (stage only changed files; trailer).

---

## Notes for the executor

- This is on `feat/design-settings-cycle-c` (stacked on Cycle B). Cycle-A/B primitives are present.
- **Read before edit:** Tasks 9 & 10 touch/replace large files — read them first, change only what the task names, never restructure unrelated logic.
- **Frozen keyboard** is the headline constraint; `useKeyboardActions.js` must not appear in any diff.
- Stage only each task's files (untracked `.beads/`, `frontend/public/test-calendar.ics` must never be committed). Minor findings → progress ledger for final-review triage.
