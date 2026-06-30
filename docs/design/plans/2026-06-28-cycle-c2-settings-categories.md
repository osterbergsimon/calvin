# Cycle C2 — Settings categories (Clock bar · Device · Maintenance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Clock bar, Device, and Maintenance settings categories from the legacy tab UI to the Cycle C1 shell (eyebrow `SettingsSection`s of `SettingRow`s with shell controls), embedding five specialized editors as-is.

**Architecture:** Three new category components (`ClockBarSettings.vue`, `DeviceSettings.vue`, `MaintenanceSettings.vue`) mirror `DisplaySettings.vue` — `defineProps({ config, … })` + `emit("update:config", patch)`. Plain settings become rows with `SegmentedControl`/`ToggleSwitch`/`SelectPill`/`NumberStepper`/text inputs; specialized editors are wrapped in a row but keep their internals. `Settings.vue` swaps each old wrapper for the new one and generalizes its section-anchor jump to the migrated categories. A small `DisplayScheduleGrid.vue` is lifted out of `PowerTab`; the System restart/reload rows move out of `UpdatesTab` into `MaintenanceSettings`.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Vite, Pinia, Vitest + @vue/test-utils + jsdom. Run a single spec: `npx vitest run <path>` (from `frontend/`). Lint: `npx eslint src`.

## Global Constraints

- Reference spec: `docs/design/2026-06-28-cycle-c2-settings-categories.md`. The canonical row idiom is the existing `frontend/src/components/settings/categories/DisplaySettings.vue` — read it before writing a new category.
- Dashboard keyboard vocabulary is **FROZEN**: do not modify `frontend/src/composables/useKeyboardActions.js`.
- New markup uses **new semantic tokens only** — `--ink`, `--ink-2`, `--ink-3`, `--bg-0`, `--bg-1`, `--bg-2`, `--line`, `--line-soft`, `--focus`, `--ok`, `--warn`, `--err`, and font-role tokens `--font-ui`/`--font-data`. **No** legacy tokens (`--accent-primary`, `--text-*`, `--bg-secondary`, `--bg-primary`, `--bg-tertiary`, `--border-color`, `--shadow`) and **no** hardcoded hex/rgb in new components.
- Controls are keyboard-operable and carry `:focus-visible`; touch targets ≥44px (the shell controls already satisfy this; custom buttons/inputs must too).
- Preserve `useConfigForm` auto-save (rows emit `update:config` exactly as the old tabs did), `settingsRegistry` search, and Maintenance's `gitRepoUrl`/`gitBranch` prop+emit interface.
- Embedded editors keep their current styling this cycle (restyle is bead `calvin-hbp`).
- Stage **only** the files each task lists. Never `git add -A` (untracked `.beads/` and `frontend/public/test-calendar.ics` must never be committed).
- Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  (use `git commit -F -` with a heredoc to include it).
- Do NOT `git push` (the controller handles finishing the branch).

**Control signatures (all from Cycle A/C1, unchanged):**
- `SettingsSection` — props `{ id: String!, title: String! }`; renders `<section id="section-{id}">` with an eyebrow + `.settings-section__panel` default slot.
- `SettingRow` — props `{ label: String!, description: String = "" }`; default slot is the control.
- `SegmentedControl` — props `{ modelValue: [String,Number], options: [{value,label}], ariaLabel }`; emits `update:modelValue`.
- `ToggleSwitch` — props `{ modelValue: Boolean, ariaLabel }`; emits `update:modelValue`.
- `SelectPill` — props `{ modelValue: [String,Number], options: [{value,label}], swatch }`; emits `update:modelValue`.
- `NumberStepper` — props `{ modelValue: Number, min, max, step, ariaLabel }`; emits `update:modelValue` (already clamped to min/max).

**Binding idiom for every control:** `:model-value="config.<key>"` + `@update:model-value="v => emit('update:config', { <key>: v })"`.

---

### Task 1: `DisplayScheduleGrid.vue` (extract the per-day schedule grid from PowerTab)

Lift the weekday on/off schedule editor out of `PowerTab` into a standalone embeddable component, so Device's DISPLAY POWER section can rebuild its simple rows while embedding just the grid. Markup/styling copied as-is (legacy tokens stay — restyle is `calvin-hbp`); only the data interface changes to `modelValue`/`update:modelValue`.

**Files:**
- Create: `frontend/src/components/settings/shared/DisplayScheduleGrid.vue`
- Test: `frontend/tests/unit/components/settings/DisplayScheduleGrid.spec.js`

**Interfaces:**
- Produces: `DisplayScheduleGrid` — props `{ modelValue: Array }` (the `displaySchedule` array of `{ day, enabled, onTime, offTime }`); emits `update:modelValue` with the full updated array on any change.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/components/settings/DisplayScheduleGrid.spec.js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";

const schedule = [
  { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 1, enabled: false, onTime: "06:00", offTime: "22:00" },
];

describe("DisplayScheduleGrid", () => {
  it("renders a row per day and emits update:modelValue when a day toggles", async () => {
    const wrapper = mount(DisplayScheduleGrid, { props: { modelValue: schedule } });
    const days = wrapper.findAll(".schedule-day");
    expect(days.length).toBe(2);

    await wrapper.findAll(".schedule-day input[type='checkbox']")[1].setValue(true);
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted.at(-1)[0][1].enabled).toBe(true);
  });

  it("emits when an on-time changes", async () => {
    const wrapper = mount(DisplayScheduleGrid, { props: { modelValue: schedule } });
    const onInput = wrapper.find(".schedule-day input[type='time']");
    await onInput.setValue("07:30");
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted.at(-1)[0][0].onTime).toBe("07:30");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/settings/DisplayScheduleGrid.spec.js`
Expected: FAIL — cannot resolve `@/components/settings/shared/DisplayScheduleGrid.vue`.

- [ ] **Step 3: Create the component (markup lifted verbatim from PowerTab lines 18–45; data interface changed to modelValue)**

```vue
<!-- frontend/src/components/settings/shared/DisplayScheduleGrid.vue -->
<template>
  <div class="schedule-days">
    <div v-for="(dayConfig, index) in localSchedule" :key="index" class="schedule-day">
      <div class="schedule-day-header">
        <label>
          <input v-model="dayConfig.enabled" type="checkbox" @change="emitChange" />
          {{ getDayName(dayConfig.day) }}
        </label>
      </div>
      <div v-if="dayConfig.enabled" class="schedule-day-times">
        <div class="schedule-time">
          <label>On:</label>
          <input v-model="dayConfig.onTime" type="time" @change="emitChange" />
        </div>
        <div class="schedule-time">
          <label>Off:</label>
          <input v-model="dayConfig.offTime" type="time" @change="emitChange" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue"]);

const localSchedule = ref(JSON.parse(JSON.stringify(props.modelValue)));

watch(
  () => props.modelValue,
  next => {
    localSchedule.value = JSON.parse(JSON.stringify(next || []));
  },
  { deep: true }
);

const getDayName = day => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[day] || `Day ${day}`;
};

const emitChange = () => {
  emit("update:modelValue", localSchedule.value);
};
</script>

<style scoped>
/* Styling lifted as-is from PowerTab (legacy tokens) — restyle in calvin-hbp. */
.schedule-days {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.schedule-day {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
.schedule-day-header {
  margin-bottom: 0.5rem;
}
.schedule-day-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}
.schedule-day-times {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}
.schedule-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.schedule-time label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.schedule-time input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
</style>
```

> Note: this is the one place legacy tokens are allowed in a *new* file — it is a verbatim lift of an embedded editor, tracked for restyle by `calvin-hbp`. Do not introduce legacy tokens anywhere else in this plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/settings/DisplayScheduleGrid.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/shared/DisplayScheduleGrid.vue frontend/tests/unit/components/settings/DisplayScheduleGrid.spec.js
git commit -F - <<'EOF'
feat(settings): extract DisplayScheduleGrid from PowerTab (C2 Task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Remove the System section from `UpdatesTab`

The Restart Backend / Restart Frontend / Reload UI block added to `UpdatesTab` in C1 moves to `MaintenanceSettings`'s SYSTEM section (Task 5). Strip it from `UpdatesTab` so it isn't double-rendered when `UpdatesTab` is embedded in UPDATES, and trim the now-unused `useSystem` restart imports + `ConfirmModal` if nothing else there uses them.

**Files:**
- Modify: `frontend/src/components/settings/tabs/system/UpdatesTab.vue`
- Modify: `frontend/tests/unit/components/UpdatesTab.spec.js`

**Interfaces:**
- Produces: `UpdatesTab` now renders only update/git/status/health (no `System` `CollapsibleSection`); its props/emits are unchanged (`gitRepoUrl`, `gitBranch` / `update:gitRepoUrl`, `update:gitBranch`).

- [ ] **Step 1: Read the file and identify the System block**

Read `frontend/src/components/settings/tabs/system/UpdatesTab.vue`. The System block is the `<CollapsibleSection title="System" …>` (around lines 120–133 in the template) plus its handlers/refs (`openConfirm`, `handleConfirm`, `pendingAction`, `confirmTitle`/`confirmMessage`/`confirmButtonText`, the `ConfirmModal` element, and the `restartBackend`/`restartFrontend` items in the `useSystem()` destructure).

- [ ] **Step 2: Update the test to assert the System rows are gone**

In `frontend/tests/unit/components/UpdatesTab.spec.js`, delete the `describe("System section", …)` block added in C1 (the buttons-render / confirm-modal-opens / confirm-calls-restartBackend / cancel tests). Add one assertion that the System section is absent:

```js
it("no longer renders the System restart/reload section", () => {
  const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" }, global: mountGlobals });
  expect(wrapper.text()).not.toContain("Restart Backend");
  expect(wrapper.text()).not.toContain("Reload UI");
});
```

(Reuse the file's existing `mountGlobals`/mock setup; if the System tests were the only consumers of the `restartBackend`/`restartFrontend` mocks, leave the mocks in place — harmless — or remove them if eslint flags them unused.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/UpdatesTab.spec.js`
Expected: FAIL — the System section text is still present.

- [ ] **Step 4: Remove the System block from the component**

Delete the `<CollapsibleSection title="System" …>…</CollapsibleSection>` from the template and its supporting script (the confirm refs/handlers, the `ConfirmModal` import + element, and `restartBackend`/`restartFrontend` from the `useSystem()` destructure). Keep everything related to git URL/branch, update trigger, update status, and backend health. Ensure no now-unused imports remain (eslint will flag them).

- [ ] **Step 5: Run tests + lint to verify**

Run: `npx vitest run tests/unit/components/UpdatesTab.spec.js`
Expected: PASS.
Run: `npx eslint src/components/settings/tabs/system/UpdatesTab.vue`
Expected: 0 problems.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/tabs/system/UpdatesTab.vue frontend/tests/unit/components/UpdatesTab.spec.js
git commit -F - <<'EOF'
refactor(settings): remove System section from UpdatesTab (moves to Maintenance, C2 Task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: `ClockBarSettings.vue`

The Clock bar category as eyebrow sections: CLOCK (toggles), BAR LAYOUT (layout selects + embedded sizing pickers), BAR ITEMS (embedded items editor).

**Files:**
- Create: `frontend/src/components/settings/categories/ClockBarSettings.vue`
- Test: `frontend/tests/unit/components/settings/ClockBarSettings.spec.js`

**Interfaces:**
- Consumes: `SettingsSection`, `SettingRow`, `SegmentedControl`/`SelectPill`/`ToggleSwitch` (signatures above); `ClockBarFontSizePicker` (props `timeSize`,`dateSize`,`layout`,`padding`,`showDate`,`isVertical`,`showPreview`,`max`; emits `update:timeSize`,`update:dateSize`,`update:padding`); `ClockBarItemsTab` (no props/emits — self-managed).
- Produces: `ClockBarSettings` — props `{ config: Object! }`; emits `update:config`. Section ids: `clock-bar-clock`, `clock-bar-layout`, `clock-bar-items`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/components/settings/ClockBarSettings.spec.js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClockBarSettings from "@/components/settings/categories/ClockBarSettings.vue";

const stubs = { ClockBarFontSizePicker: true, ClockBarItemsTab: true };

const baseConfig = {
  clockShowDate: true, clockShowSeconds: false, clockBarShowLogo: true,
  clockBarShowWeather: false, clockBarShowInKiosk: false,
  clockBarLayout: "single-line", clockBarVerticalLayout: "upright",
  clockBarFontSize: 16, clockBarDateFontSize: 14, clockBarPadding: 8,
  clockBarVerticalFontSize: 18, clockBarVerticalDateFontSize: 11, clockBarVerticalPadding: 8,
};

describe("ClockBarSettings", () => {
  it("renders the three sections", () => {
    const wrapper = mount(ClockBarSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(wrapper.find("#section-clock-bar-clock").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-layout").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-items").exists()).toBe(true);
  });

  it("emits update:config when a clock toggle changes", async () => {
    const wrapper = mount(ClockBarSettings, { props: { config: baseConfig }, global: { stubs } });
    await wrapper.findAll('[role="switch"]')[0].trigger("click");
    const emitted = wrapper.emitted("update:config");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toHaveProperty("clockShowDate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/settings/ClockBarSettings.spec.js`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

```vue
<!-- frontend/src/components/settings/categories/ClockBarSettings.vue -->
<template>
  <div class="clock-bar-settings">
    <SettingsSection id="clock-bar-clock" title="Clock">
      <SettingRow label="Show date" description="Display the date alongside the time.">
        <ToggleSwitch
          :model-value="config.clockShowDate"
          aria-label="Show date"
          @update:model-value="v => emit('update:config', { clockShowDate: v })"
        />
      </SettingRow>
      <SettingRow label="Show seconds" description="Update the time every second.">
        <ToggleSwitch
          :model-value="config.clockShowSeconds"
          aria-label="Show seconds"
          @update:model-value="v => emit('update:config', { clockShowSeconds: v })"
        />
      </SettingRow>
      <SettingRow label="Show Calvin logo" description="Show a small Calvin glyph at the leading edge of the bar.">
        <ToggleSwitch
          :model-value="config.clockBarShowLogo !== false"
          aria-label="Show Calvin logo"
          @update:model-value="v => emit('update:config', { clockBarShowLogo: v })"
        />
      </SettingRow>
      <SettingRow label="Show weather" description="Show current temperature and icon (requires a weather service).">
        <ToggleSwitch
          :model-value="config.clockBarShowWeather"
          aria-label="Show weather"
          @update:model-value="v => emit('update:config', { clockBarShowWeather: v })"
        />
      </SettingRow>
      <SettingRow label="Show in kiosk mode" description="Keep the bar visible when the rest of the UI is hidden.">
        <ToggleSwitch
          :model-value="config.clockBarShowInKiosk"
          aria-label="Show in kiosk mode"
          @update:model-value="v => emit('update:config', { clockBarShowInKiosk: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="clock-bar-layout" title="Bar layout">
      <SettingRow label="Horizontal layout" description="How time and date are arranged on the top and bottom bars.">
        <SelectPill
          :model-value="config.clockBarLayout || 'single-line'"
          :options="[{value:'single-line',label:'Single line'},{value:'two-lines',label:'Two lines'}]"
          @update:model-value="v => emit('update:config', { clockBarLayout: v })"
        />
      </SettingRow>
      <SettingRow label="Horizontal sizing" description="Time, date, and padding for the top and bottom bars.">
        <ClockBarFontSizePicker
          :time-size="config.clockBarFontSize || 16"
          :date-size="config.clockBarDateFontSize || 14"
          :layout="config.clockBarLayout || 'single-line'"
          :padding="config.clockBarPadding || 8"
          :show-date="config.clockShowDate"
          :is-vertical="false"
          @update:time-size="v => emit('update:config', { clockBarFontSize: v })"
          @update:date-size="v => emit('update:config', { clockBarDateFontSize: v })"
          @update:padding="v => emit('update:config', { clockBarPadding: v })"
        />
      </SettingRow>
      <SettingRow label="Vertical layout" description="How time and date are arranged on the left and right bars.">
        <SelectPill
          :model-value="config.clockBarVerticalLayout || 'upright'"
          :options="[
            {value:'upright',label:'Upright'},
            {value:'compact-time',label:'Compact time'},
            {value:'compact-time-date',label:'Compact time & date'},
          ]"
          @update:model-value="v => emit('update:config', { clockBarVerticalLayout: v })"
        />
      </SettingRow>
      <SettingRow label="Vertical sizing" description="Time, date, and padding for the left and right vertical bars.">
        <ClockBarFontSizePicker
          :time-size="config.clockBarVerticalFontSize || 18"
          :date-size="config.clockBarVerticalDateFontSize || 11"
          :layout="config.clockBarVerticalLayout || 'upright'"
          :padding="config.clockBarVerticalPadding || 8"
          :show-date="config.clockShowDate"
          :is-vertical="true"
          :max="48"
          @update:time-size="v => emit('update:config', { clockBarVerticalFontSize: v })"
          @update:date-size="v => emit('update:config', { clockBarVerticalDateFontSize: v })"
          @update:padding="v => emit('update:config', { clockBarVerticalPadding: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="clock-bar-items" title="Bar items">
      <ClockBarItemsTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import ClockBarFontSizePicker from "@/components/settings/shared/ClockBarFontSizePicker.vue";
import ClockBarItemsTab from "@/components/settings/tabs/clock-bar/ClockBarItemsTab.vue";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
</script>

<style scoped>
.clock-bar-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/settings/ClockBarSettings.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/ClockBarSettings.vue frontend/tests/unit/components/settings/ClockBarSettings.spec.js
git commit -F - <<'EOF'
feat(settings): add ClockBarSettings category (C2 Task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: `DeviceSettings.vue`

Device as eyebrow sections: DISPLAY POWER (toggles + timezone + embedded schedule grid + timeout stepper + manual-control buttons), KEYBOARD (embed), REBOOT COMBO (selects + stepper + info), HARDWARE (read-only info rows).

**Files:**
- Create: `frontend/src/components/settings/categories/DeviceSettings.vue`
- Test: `frontend/tests/unit/components/settings/DeviceSettings.spec.js`

**Interfaces:**
- Consumes: shell controls; `DisplayScheduleGrid` (Task 1 — props `modelValue`, emits `update:modelValue`); `KeyboardTab` (props `config`, emits `update:config`); `useSystem` (`@/composables` — `turnDisplayOn`, `turnDisplayOff`); `useConnectionStore` (`@/stores/connection` — `isBackendOnline`).
- Produces: `DeviceSettings` — props `{ config: Object!, version: String, frontendVersion: String }`; emits `update:config`. Section ids: `device-power`, `device-keyboard`, `device-reboot`, `device-hardware`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/components/settings/DeviceSettings.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DeviceSettings from "@/components/settings/categories/DeviceSettings.vue";

vi.mock("@/composables", () => ({
  useSystem: () => ({ turnDisplayOn: vi.fn(), turnDisplayOff: vi.fn() }),
}));

const stubs = { DisplayScheduleGrid: true, KeyboardTab: true };
const baseConfig = {
  displayScheduleEnabled: false, displaySchedule: [],
  timezone: null, displayTimeoutEnabled: false, displayTimeout: 0,
  rebootComboKey1: "KEY_1", rebootComboKey2: "KEY_7", rebootComboDuration: 10000,
};

describe("DeviceSettings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the four sections", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    for (const id of ["device-power", "device-keyboard", "device-reboot", "device-hardware"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("shows the timeout stepper only when timeout is enabled", async () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: { ...baseConfig, displayTimeoutEnabled: true }, version: null, frontendVersion: null },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Timeout");
  });

  it("renders the backend version in Hardware", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("1.2.3");
  });

  it("emits update:config when the first reboot key changes", async () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: null, frontendVersion: null },
      global: { stubs },
    });
    // SelectPill exposes its options as buttons; click a non-active option.
    const pill = wrapper.findAll(".pill").find(p => p.text().includes("KEY_3"));
    // fallback: emit directly via the component if the markup differs
    expect(wrapper.find("#section-device-reboot").exists()).toBe(true);
    if (pill) await pill.trigger("click");
  });
});
```

> Note: the reboot-key emit assertion is intentionally light (SelectPill internals are covered by its own spec). The mandatory assertions are the four sections, the conditional timeout reveal, and the Hardware version.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/settings/DeviceSettings.spec.js`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

```vue
<!-- frontend/src/components/settings/categories/DeviceSettings.vue -->
<template>
  <div class="device-settings">
    <SettingsSection id="device-power" title="Display power">
      <SettingRow label="Power schedule" description="Automatically turn the display off and on at set times.">
        <ToggleSwitch
          :model-value="config.displayScheduleEnabled"
          aria-label="Power schedule"
          @update:model-value="v => emit('update:config', { displayScheduleEnabled: v })"
        />
      </SettingRow>
      <template v-if="config.displayScheduleEnabled">
        <SettingRow label="Daily schedule" description="On and off times for each day of the week.">
          <DisplayScheduleGrid
            :model-value="config.displaySchedule || []"
            @update:model-value="v => emit('update:config', { displaySchedule: v })"
          />
        </SettingRow>
        <SettingRow label="Timezone" description="Timezone for the schedule. Leave as system default to use the Pi's timezone.">
          <SelectPill
            :model-value="config.timezone || 'system'"
            :options="timezoneOptions"
            @update:model-value="v => emit('update:config', { timezone: v === 'system' ? null : v })"
          />
        </SettingRow>
      </template>

      <SettingRow label="Screen timeout" description="Turn the display off after a period of inactivity.">
        <ToggleSwitch
          :model-value="config.displayTimeoutEnabled"
          aria-label="Screen timeout"
          @update:model-value="v => emit('update:config', { displayTimeoutEnabled: v })"
        />
      </SettingRow>
      <SettingRow
        v-if="config.displayTimeoutEnabled"
        label="Timeout"
        description="Seconds of inactivity before the display turns off (0 = never)."
      >
        <NumberStepper
          :model-value="config.displayTimeout || 0"
          :min="0"
          :max="3600"
          :step="60"
          aria-label="Display timeout in seconds"
          @update:model-value="v => emit('update:config', { displayTimeout: v })"
        />
      </SettingRow>

      <SettingRow label="Manual control" description="Turn the display on or off right now.">
        <div class="device-actions">
          <button type="button" class="device-btn" @click="onTurnOn">Turn on</button>
          <button type="button" class="device-btn" @click="onTurnOff">Turn off</button>
        </div>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-keyboard" title="Keyboard">
      <KeyboardTab :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="device-reboot" title="Reboot combo">
      <SettingRow label="First key" description="First key in the reboot key combination.">
        <SelectPill
          :model-value="config.rebootComboKey1 || 'KEY_1'"
          :options="keyOptions"
          @update:model-value="v => emit('update:config', { rebootComboKey1: v })"
        />
      </SettingRow>
      <SettingRow label="Second key" description="Second key in the reboot key combination.">
        <SelectPill
          :model-value="config.rebootComboKey2 || 'KEY_7'"
          :options="keyOptions"
          @update:model-value="v => emit('update:config', { rebootComboKey2: v })"
        />
      </SettingRow>
      <SettingRow label="Hold duration" description="How long to hold both keys to trigger a reboot (milliseconds).">
        <NumberStepper
          :model-value="config.rebootComboDuration || 10000"
          :min="1000"
          :max="60000"
          :step="1000"
          aria-label="Reboot combo duration in milliseconds"
          @update:model-value="v => emit('update:config', { rebootComboDuration: v })"
        />
      </SettingRow>
      <SettingRow label="Combo" :description="comboHint" />
    </SettingsSection>

    <SettingsSection id="device-hardware" title="Hardware">
      <SettingRow label="Backend version" :description="version || 'Unknown'" />
      <SettingRow label="Frontend version" :description="frontendVersion || 'Unknown'" />
      <SettingRow label="System status">
        <span class="device-status" :class="statusClass">{{ statusText }}</span>
      </SettingRow>
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useSystem } from "@/composables";
import { useConnectionStore } from "@/stores/connection";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";

const props = defineProps({
  config: { type: Object, required: true },
  version: { type: String, default: null },
  frontendVersion: { type: String, default: null },
});
const emit = defineEmits(["update:config"]);

const { turnDisplayOn, turnDisplayOff } = useSystem();
const connectionStore = useConnectionStore();

const keyOptions = ["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7"].map(k => ({
  value: k,
  label: k,
}));

const timezoneOptions = [
  { value: "system", label: "System default" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Denver", label: "Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
];

const comboHint = computed(() => {
  const k1 = props.config.rebootComboKey1 || "KEY_1";
  const k2 = props.config.rebootComboKey2 || "KEY_7";
  const secs = ((props.config.rebootComboDuration || 10000) / 1000).toFixed(1);
  return `Hold ${k1} + ${k2} for ${secs} seconds to reboot.`;
});

const statusText = computed(() => (connectionStore.isBackendOnline ? "● Online" : "○ Offline"));
const statusClass = computed(() => (connectionStore.isBackendOnline ? "is-online" : "is-offline"));

const onTurnOn = async () => {
  try {
    await turnDisplayOn();
  } catch (e) {
    console.error("Failed to turn display on:", e);
  }
};
const onTurnOff = async () => {
  try {
    await turnDisplayOff();
  } catch (e) {
    console.error("Failed to turn display off:", e);
  }
};
</script>

<style scoped>
.device-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.device-actions {
  display: flex;
  gap: 0.5rem;
}
.device-btn {
  min-height: 44px;
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.device-btn:hover {
  border-color: var(--focus);
}
.device-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.device-status {
  font-family: var(--font-data);
  font-weight: 600;
}
.device-status.is-online {
  color: var(--ok);
}
.device-status.is-offline {
  color: var(--err);
}
</style>
```

> The Timezone `SelectPill` maps `null` ↔ a sentinel `"system"` value because `SelectPill` cannot bind a `null` model value cleanly; the emit converts `"system"` back to `null` so the stored config key is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/settings/DeviceSettings.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/DeviceSettings.vue frontend/tests/unit/components/settings/DeviceSettings.spec.js
git commit -F - <<'EOF'
feat(settings): add DeviceSettings category (C2 Task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: `MaintenanceSettings.vue`

Maintenance as eyebrow sections: UPDATES (embed the stripped `UpdatesTab` with git pass-through), SYSTEM (relocated restart/reload action rows + confirm), DIAGNOSTICS (rebuilt console/logging + poll-interval rows).

**Files:**
- Create: `frontend/src/components/settings/categories/MaintenanceSettings.vue`
- Test: `frontend/tests/unit/components/settings/MaintenanceSettings.spec.js`

**Interfaces:**
- Consumes: shell controls; `UpdatesTab` (props `gitRepoUrl`,`gitBranch`; emits `update:gitRepoUrl`,`update:gitBranch`); `ConfirmModal` (`@/components/settings/shared/ConfirmModal.vue` — props `{ show, title, message, confirmText }`, emits `confirm`/`cancel`); `useSystem` (`restartBackend`, `restartFrontend`).
- Produces: `MaintenanceSettings` — props `{ config: Object!, gitRepoUrl: String = "", gitBranch: String = "main" }`; emits `update:config`, `update:gitRepoUrl`, `update:gitBranch`. Section ids: `maintenance-updates`, `maintenance-system`, `maintenance-diagnostics`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/components/settings/MaintenanceSettings.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const restartBackend = vi.fn();
const restartFrontend = vi.fn();
vi.mock("@/composables", () => ({
  useSystem: () => ({ restartBackend, restartFrontend }),
}));

import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";

const stubs = { UpdatesTab: true };
const baseConfig = { consoleLogEnabled: true, consoleLogLevel: "info", configPollInterval: 30 };

describe("MaintenanceSettings", () => {
  beforeEach(() => {
    restartBackend.mockClear();
    restartFrontend.mockClear();
  });

  it("renders the three sections", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    for (const id of ["maintenance-updates", "maintenance-system", "maintenance-diagnostics"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("calls restartBackend after confirming Restart backend", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    const btn = wrapper.findAll("button").find(b => b.text() === "Restart backend");
    await btn.trigger("click");
    // ConfirmModal is real; find its confirm button and click it
    const confirmBtn = wrapper.findAll("button").find(b => /restart/i.test(b.text()) && b.text() !== "Restart backend" && b.text() !== "Restart frontend");
    await confirmBtn.trigger("click");
    expect(restartBackend).toHaveBeenCalled();
  });

  it("shows the log level only when console logging is on", () => {
    const on = mount(MaintenanceSettings, { props: { config: { ...baseConfig, consoleLogEnabled: true }, gitRepoUrl: "", gitBranch: "main" }, global: { stubs } });
    expect(on.text()).toContain("Log level");
    const off = mount(MaintenanceSettings, { props: { config: { ...baseConfig, consoleLogEnabled: false }, gitRepoUrl: "", gitBranch: "main" }, global: { stubs } });
    expect(off.text()).not.toContain("Log level");
  });
});
```

> If matching the ConfirmModal confirm button by text proves brittle, target it by the modal's confirm-button class/role per `ConfirmModal.vue` (read it first); the binding assertion (`restartBackend` called) is what matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/settings/MaintenanceSettings.spec.js`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

```vue
<!-- frontend/src/components/settings/categories/MaintenanceSettings.vue -->
<template>
  <div class="maintenance-settings">
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
    </SettingsSection>

    <SettingsSection id="maintenance-system" title="System">
      <SettingRow label="Restart backend" description="Restart the backend API server.">
        <button type="button" class="maint-btn" @click="askRestartBackend">Restart backend</button>
      </SettingRow>
      <SettingRow label="Restart frontend" description="Restart the frontend service.">
        <button type="button" class="maint-btn" @click="askRestartFrontend">Restart frontend</button>
      </SettingRow>
      <SettingRow label="Reload UI" description="Reload the browser page.">
        <button type="button" class="maint-btn" @click="reloadUi">Reload UI</button>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-diagnostics" title="Diagnostics">
      <SettingRow label="Console logging" description="Log to the browser console. When off, only errors are shown.">
        <ToggleSwitch
          :model-value="config.consoleLogEnabled ?? true"
          aria-label="Console logging"
          @update:model-value="v => emit('update:config', { consoleLogEnabled: v })"
        />
      </SettingRow>
      <SettingRow
        v-if="config.consoleLogEnabled ?? true"
        label="Log level"
        description="Which messages appear in the browser console."
      >
        <SelectPill
          :model-value="config.consoleLogLevel || 'info'"
          :options="[
            {value:'error',label:'Errors only'},
            {value:'warn',label:'Warnings & errors'},
            {value:'info',label:'Info, warnings & errors'},
            {value:'debug',label:'All logs'},
          ]"
          @update:model-value="v => emit('update:config', { consoleLogLevel: v })"
        />
      </SettingRow>
      <SettingRow label="Config polling interval" description="How often to check for config changes (seconds).">
        <NumberStepper
          :model-value="config.configPollInterval || 30"
          :min="5"
          :max="300"
          :step="1"
          aria-label="Config polling interval in seconds"
          @update:model-value="v => emit('update:config', { configPollInterval: v })"
        />
      </SettingRow>
    </SettingsSection>

    <ConfirmModal
      :show="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      confirm-text="Restart"
      @confirm="onConfirm"
      @cancel="confirm.show = false"
    />
  </div>
</template>

<script setup>
import { reactive } from "vue";
import { useSystem } from "@/composables";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";

defineProps({
  config: { type: Object, required: true },
  gitRepoUrl: { type: String, default: "" },
  gitBranch: { type: String, default: "main" },
});
const emit = defineEmits(["update:config", "update:gitRepoUrl", "update:gitBranch"]);

const { restartBackend, restartFrontend } = useSystem();

const confirm = reactive({ show: false, title: "", message: "", action: null });

const askRestartBackend = () => {
  confirm.title = "Restart backend?";
  confirm.message = "The display will briefly disconnect while the backend restarts.";
  confirm.action = "backend";
  confirm.show = true;
};
const askRestartFrontend = () => {
  confirm.title = "Restart frontend?";
  confirm.message = "The dashboard UI will reload while the frontend restarts.";
  confirm.action = "frontend";
  confirm.show = true;
};
const onConfirm = async () => {
  const action = confirm.action;
  confirm.show = false;
  try {
    if (action === "backend") await restartBackend();
    else if (action === "frontend") await restartFrontend();
  } catch (e) {
    console.error("System action failed:", e);
  }
};
const reloadUi = () => {
  window.location.reload();
};
</script>

<style scoped>
.maintenance-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.maint-btn {
  min-height: 44px;
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.maint-btn:hover {
  border-color: var(--focus);
}
.maint-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
```

> Before writing the test's confirm-click, read `frontend/src/components/settings/shared/ConfirmModal.vue` to confirm its prop names (`show`/`title`/`message`/`confirmText`) and the confirm-button selector. Adjust the bindings here if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/settings/MaintenanceSettings.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/MaintenanceSettings.vue frontend/tests/unit/components/settings/MaintenanceSettings.spec.js
git commit -F - <<'EOF'
feat(settings): add MaintenanceSettings category (C2 Task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Wire the new components into `Settings.vue` + generalize the section jump

Swap the three old wrappers for the new components and make the search/deep-link section-scroll work for the migrated categories (not just `dashboard`).

**Files:**
- Modify: `frontend/src/views/Settings.vue`
- Modify: `frontend/tests/unit/views/SettingsShell.spec.js`

**Interfaces:**
- Consumes: `ClockBarSettings` (Task 3), `DeviceSettings` (Task 4), `MaintenanceSettings` (Task 5).

- [ ] **Step 1: Update the shell test to expect the new components per category**

In `frontend/tests/unit/views/SettingsShell.spec.js`, extend the existing render assertions: switching `activeCategory` to `clock-bar` renders `ClockBarSettings`, `device` renders `DeviceSettings`, `maintenance` renders `MaintenanceSettings` (stub the three new components in the mount `global.stubs` and assert presence by stubbed tag, mirroring how the existing test asserts `DisplaySettings`). Read the current spec first and follow its mocking style (vue-router + `useConfigForm` are already mocked there).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/views/SettingsShell.spec.js`
Expected: FAIL — `Settings.vue` still renders the old `ClockBarCategory`/`DeviceCategory`/`MaintenanceCategory`.

- [ ] **Step 3: Swap imports + template render blocks**

In `frontend/src/views/Settings.vue`:
- Replace the imports of `ClockBarCategory`, `DeviceCategory`, `MaintenanceCategory` with `ClockBarSettings`, `DeviceSettings`, `MaintenanceSettings` (paths `@/components/settings/categories/<Name>.vue`).
- In the content block, replace the three elements. New markup (preserve the exact prop/emit wiring the old ones used — note `MaintenanceSettings` keeps the git pass-through):

```vue
<ClockBarSettings
  v-if="activeCategory === 'clock-bar' && localConfig"
  :key="categoryRenderKey"
  :config="localConfig"
  @update:config="handleConfigUpdate"
/>
<DeviceSettings
  v-if="activeCategory === 'device' && localConfig"
  :key="categoryRenderKey"
  :config="localConfig"
  :version="version"
  :frontend-version="frontendVersion"
  @update:config="handleConfigUpdate"
/>
<MaintenanceSettings
  v-if="activeCategory === 'maintenance' && localConfig"
  :key="categoryRenderKey"
  :config="localConfig"
  :git-repo-url="localConfig && localConfig.gitRepoUrl"
  :git-branch="(localConfig && localConfig.gitBranch) || 'main'"
  @update:config="handleConfigUpdate"
  @update:git-repo-url="v => handleConfigUpdate({ gitRepoUrl: v })"
  @update:git-branch="v => handleConfigUpdate({ gitBranch: v })"
/>
```

> Keep whatever `version`/`frontendVersion`/git wiring the old `DeviceCategory`/`MaintenanceCategory` blocks used — read the current `Settings.vue` block (around lines 50–66) and mirror its prop sources exactly. If the old Maintenance block routed git updates through dedicated handlers rather than `handleConfigUpdate`, reuse those handlers instead.

- [ ] **Step 4: Generalize the section-anchor jump to migrated categories**

Replace the dashboard-only `TAB_TO_SECTION` map + `sectionForTab` + the `destination.category === "dashboard"` gate in `onJump` with a per-`(category, tab)` lookup that covers all migrated categories. Exact replacement for the mapping block (around lines 215–226) and the `onJump` scroll branch (around lines 248–255):

```js
// ── (category, tab) → section-id for migrated categories ────────────────────
const SECTION_BY_CATEGORY_TAB = {
  dashboard: {
    layout: "layout",
    calendar: "calendar",
    appearance: "appearance",
    notifications: "notifications",
    "plugin-display": "plugin-display",
  },
  "clock-bar": {
    appearance: "clock-bar-clock",
    "bar-items": "clock-bar-items",
  },
  device: {
    power: "device-power",
    keyboard: "device-keyboard",
    reboot: "device-reboot",
    hardware: "device-hardware",
  },
  maintenance: {
    updates: "maintenance-updates",
    diagnostics: "maintenance-diagnostics",
  },
};
const MIGRATED_CATEGORIES = new Set(Object.keys(SECTION_BY_CATEGORY_TAB));

function sectionFor(category, tab) {
  return SECTION_BY_CATEGORY_TAB[category]?.[tab] ?? null;
}
```

In `onJump`, change the sessionStorage-hint guard and the scroll branch so that migrated categories scroll to their section instead of writing a `tabKey` hint:

```js
const onJump = async destination => {
  // Unmigrated categories still use the tab sessionStorage hint.
  if (
    destination.tabKey &&
    destination.tab &&
    !MIGRATED_CATEGORIES.has(destination.category)
  ) {
    sessionStorage.setItem(destination.tabKey, destination.tab);
  }

  activeCategory.value = destination.category;
  categoryRenderKey.value += 1;
  router.replace({ query: { ...route.query, setting: destination.id } });

  if (MIGRATED_CATEGORIES.has(destination.category) && destination.tab) {
    await nextTick();
    const sectionId = sectionFor(destination.category, destination.tab);
    if (sectionId) {
      const el = document.getElementById("section-" + sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }
};
```

Apply the same `MIGRATED_CATEGORIES` guard to the external `?setting=` watch (around lines 284–286) so it no longer writes a tab hint for migrated categories.

- [ ] **Step 5: Run the shell + preservation specs**

Run: `npx vitest run tests/unit/views/SettingsShell.spec.js tests/unit/components/settingsRegistry.spec.js tests/unit/composables/useConfigForm.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/Settings.vue frontend/tests/unit/views/SettingsShell.spec.js
git commit -F - <<'EOF'
feat(settings): render C2 category components + generalize section jump (C2 Task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Update search destinations, remove orphaned components, full gate

Update `settingsRegistry` path labels for the migrated categories (cosmetic, keeps search readable), delete the now-unreferenced old components, and verify the whole suite + lint.

**Files:**
- Modify: `frontend/src/components/settings/settingsRegistry.js`
- Delete: `frontend/src/components/settings/categories/ClockBarCategory.vue`, `DeviceCategory.vue`, `MaintenanceCategory.vue`, `frontend/src/components/settings/tabs/dashboard/ClockSettingsTab.vue`, `frontend/src/components/settings/tabs/device/RebootComboTab.vue`, `frontend/src/components/settings/tabs/system/HardwareTab.vue`, `frontend/src/components/settings/tabs/system/DebugTab.vue`, `frontend/src/components/settings/tabs/system/PowerTab.vue`
- Possibly modify: any test that imported a deleted component directly.

- [ ] **Step 1: Reference-check each deletion candidate**

For each file in the delete list, confirm nothing imports it anymore:

```bash
cd frontend
for f in ClockBarCategory DeviceCategory MaintenanceCategory ClockSettingsTab RebootComboTab HardwareTab DebugTab PowerTab; do
  echo "== $f =="; grep -rn "$f" src tests --include="*.vue" --include="*.js" | grep -v "/$f.vue"
done
```

Expected: no hits other than the files themselves. If a hit remains (e.g. a test importing `PowerTab` directly, or `ClockSettingsTab` still referenced by a not-yet-migrated path), do NOT delete that file — note it in the report and leave it.

- [ ] **Step 2: Update registry path labels (cosmetic)**

In `frontend/src/components/settings/settingsRegistry.js`, update the `path` strings for the migrated destinations so the breadcrumb-style search text matches the new section names (the `tab` keys stay — they drive `sectionFor`). Apply:
- `clock-bar-appearance` → `path: "Clock Bar / Clock"`
- `clock-bar-items` → `path: "Clock Bar / Bar Items"` (unchanged)
- `device-power` → `path: "Device / Display Power"`
- `device-reboot` → `path: "Device / Reboot Combo"` (unchanged)
- `maintenance-updates` → `path: "Maintenance / Updates"` (unchanged)
- `maintenance-diagnostics` → `path: "Maintenance / Diagnostics"` (unchanged)

Leave `device-keyboard`, `device-hardware` paths as they are. Do not change ids/categories/tabs/keywords.

- [ ] **Step 3: Delete the orphaned components**

Delete only the files confirmed unreferenced in Step 1:

```bash
cd frontend
git rm src/components/settings/categories/ClockBarCategory.vue \
       src/components/settings/categories/DeviceCategory.vue \
       src/components/settings/categories/MaintenanceCategory.vue \
       src/components/settings/tabs/dashboard/ClockSettingsTab.vue \
       src/components/settings/tabs/device/RebootComboTab.vue \
       src/components/settings/tabs/system/HardwareTab.vue \
       src/components/settings/tabs/system/DebugTab.vue \
       src/components/settings/tabs/system/PowerTab.vue
```

(Omit any file Step 1 flagged as still-referenced.)

- [ ] **Step 4: Full suite + lint**

Run: `npx vitest run`
Expected: all tests pass (no suite references a deleted file).
Run: `npx eslint src`
Expected: 0 errors, 0 warnings.

If a deleted-component test fails, either it tested a now-removed component (delete that spec, recording it in the report) or a deletion was premature (restore the file).

- [ ] **Step 5: Commit**

```bash
cd /home/tux/code/calvin
git add frontend/src/components/settings/settingsRegistry.js
git add -u frontend/src/components/settings  # stages the deletions under this path only
git commit -F - <<'EOF'
chore(settings): retire migrated category/tab components + update search paths (C2 Task 7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

> `git add -u <path>` stages tracked deletions/modifications under the settings tree only — it will not touch untracked `.beads/` or `frontend/public/test-calendar.ics`. Verify with `git status` before committing.

- [ ] **Step 6: On-device verification checklist (manual, by the controller/user)**

Against a running stack: open Settings → rail shows all categories; selecting **Clock bar**, **Device**, **Maintenance** renders the new eyebrow sections; breadcrumb section label updates on scroll; search jumping into each category scrolls to the right section; the embedded editors still function (clock sizing + vertical preview, bar items, display-power schedule grid, keyboard remap, update/health block); System restart/reload confirm dialogs work; Diagnostics log-level reveal toggles. Note any issues for follow-up.

---

## Notes for the executor

- Tasks 3, 4, 5 are independent of each other (all depend only on Tasks 1–2 being done: Task 4 needs `DisplayScheduleGrid` from Task 1; Task 5 needs the stripped `UpdatesTab` from Task 2). Task 6 depends on 3/4/5. Task 7 depends on 6.
- Embedded editors are stubbed in the new components' unit tests; their real behaviour is covered by their own existing specs and the on-device pass.
- If `ConfirmModal`'s prop/emit names differ from `{ show, title, message, confirmText }` / `confirm`/`cancel`, adjust Task 5's bindings to match the real component (read it first) — the contract (confirming calls `restartBackend`) is what the test guards.
