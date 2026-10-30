<template>
  <div class="dashboard-settings">
    <!-- DASHBOARD SCREENS / REGIONS -->
    <SettingsSection id="regions" title="Pages & regions">
      <div class="regions-launch">
        <div class="regions-launch__summary">
          <span class="regions-launch__count">{{ screenSummary }}</span>
          <span class="regions-launch__hint"
            >Design each page’s regions in the full-size editor.</span
          >
        </div>
        <button type="button" class="regions-launch__btn" @click="editorOpen = true">
          Open editor
        </button>
      </div>
      <ScreenRegionEditor
        :config="config"
        :open="editorOpen"
        :place-source="placement"
        :initial-page-id="initialPageId"
        :initial-region-id="initialRegionId"
        @update:config="patch => emit('update:config', patch)"
        @close="closeEditor"
        @placed="handlePlaced"
        @place-cancel="clearPlacement"
      />
    </SettingsSection>

    <!-- CLOCK BAR (moved from the retired Clock Bar category) -->
    <ClockBarSections :config="config" @update:config="patch => emit('update:config', patch)" />

    <!-- APPEARANCE -->
    <SettingsSection id="appearance" title="Appearance">
      <SettingRow label="Theme">
        <ThemePicker
          :selected-theme-id="config.selectedTheme"
          @select="id => emit('update:config', { selectedTheme: id })"
        />
      </SettingRow>
      <SettingRow label="Light or dark">
        <SelectPill
          :model-value="config.themeMode"
          :options="[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'auto', label: 'Follow device' },
            { value: 'time', label: 'On a schedule' },
          ]"
          aria-label="Light or dark"
          @update:model-value="v => emit('update:config', { themeMode: v })"
        />
      </SettingRow>
      <SettingRow v-if="config.themeMode === 'time'" label="Dark from">
        <div class="dash-hours">
          <input
            class="dash-time"
            type="time"
            step="3600"
            :value="hourToTime(config.darkModeStart, 18)"
            aria-label="Dark from"
            @change="e => emit('update:config', { darkModeStart: timeToHour(e.target.value) })"
          />
          <span class="dash-hours__to">to</span>
          <input
            class="dash-time"
            type="time"
            step="3600"
            :value="hourToTime(config.darkModeEnd, 6)"
            aria-label="Dark to"
            @change="e => emit('update:config', { darkModeEnd: timeToHour(e.target.value) })"
          />
        </div>
      </SettingRow>
      <SettingRow label="Font">
        <TypefacePicker />
      </SettingRow>
      <SettingRow
        label="Settings text size"
        description="Only changes Settings. The dashboard has its own size below."
      >
        <template #label-extra><ScopeChip /></template>
        <SegmentedControl
          :model-value="uiSize"
          :options="UI_SIZE_OPTIONS"
          aria-label="Settings text size"
          @update:model-value="setUiSize"
        />
      </SettingRow>
      <SettingRow label="Room name" :description="ROOM_NAME_DESCRIPTION">
        <input
          class="display-name-input"
          type="text"
          :value="config.displayName"
          aria-label="Room name"
          @input="e => emit('update:config', { displayName: e.target.value })"
        />
      </SettingRow>
    </SettingsSection>

    <!-- TOUCH & CONTROLS — what the wall shows, then what reacts to touches -->
    <SettingsSection id="kiosk-touch" title="Controls">
      <SettingRow
        label="Hide controls"
        description="Hides the ⋯ menu and region headers for a calm wall display."
      >
        <ToggleSwitch
          :model-value="!config.showUI"
          aria-label="Hide controls"
          @update:model-value="v => emit('update:config', { showUI: !v })"
        />
      </SettingRow>
      <SettingRow label="Keep the clock bar when hidden">
        <ToggleSwitch
          :model-value="config.clockBarShowInKiosk"
          aria-label="Keep the clock bar when hidden"
          @update:model-value="v => emit('update:config', { clockBarShowInKiosk: v })"
        />
      </SettingRow>
      <SettingRow
        label="Tap anywhere to show controls"
        description="A tap on calendar or photos brings controls back."
      >
        <ToggleSwitch
          :model-value="config.tapAnywhereReveal"
          aria-label="Tap anywhere to show controls"
          @update:model-value="v => emit('update:config', { tapAnywhereReveal: v })"
        />
      </SettingRow>
      <!-- The corner rows only matter while the controls are hidden. -->
      <template v-if="!config.showUI">
        <SettingRow
          label="Show-controls corner"
          description="Press and hold this corner to bring hidden controls back."
        >
          <SelectPill
            :model-value="config.hotCornerPosition || 'bottom-left'"
            :options="[
              { value: 'bottom-left', label: 'Bottom left' },
              { value: 'bottom-right', label: 'Bottom right' },
              { value: 'top-left', label: 'Top left' },
              { value: 'top-right', label: 'Top right' },
            ]"
            aria-label="Show-controls corner"
            @update:model-value="v => emit('update:config', { hotCornerPosition: v })"
          />
        </SettingRow>
        <SettingRow label="Corner visibility" description="At 0 it's invisible but still works.">
          <NumberStepper
            :model-value="config.hotCornerOpacity ?? 55"
            :min="0"
            :max="100"
            :step="5"
            unit="%"
            aria-label="Corner visibility percentage"
            @update:model-value="v => emit('update:config', { hotCornerOpacity: v })"
          />
        </SettingRow>
        <SettingRow label="Corner size">
          <RangeSlider
            :model-value="config.hotCornerSize ?? 64"
            :min="40"
            :max="96"
            :step="4"
            unit="px"
            aria-label="Corner size in pixels"
            @update:model-value="v => emit('update:config', { hotCornerSize: v })"
          />
        </SettingRow>
        <SettingRow label="Hold for">
          <RangeSlider
            :model-value="config.hotCornerLongPressMs ?? 500"
            :min="200"
            :max="1200"
            :step="50"
            unit="ms"
            aria-label="Hold for, in milliseconds"
            @update:model-value="v => emit('update:config', { hotCornerLongPressMs: v })"
          />
        </SettingRow>
      </template>
    </SettingsSection>

    <SettingsSection id="kiosk-touch-focus" title="Focus & remote">
      <SettingRow
        label="Focus light"
        description="Outlines the region the remote or arrow keys will act on."
      >
        <SelectPill
          :model-value="config.focusLightMode"
          :options="[
            { value: 'always', label: 'Always' },
            { value: 'interaction', label: 'Only while controls show' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Focus light"
          @update:model-value="v => emit('update:config', { focusLightMode: v })"
        />
      </SettingRow>
      <SettingRow
        label="Dim other regions"
        description="Dims the rest while the focus light is on."
      >
        <ToggleSwitch
          :model-value="config.focusLightDimOthers"
          aria-label="Dim other regions"
          @update:model-value="v => emit('update:config', { focusLightDimOthers: v })"
        />
      </SettingRow>
      <SettingRow
        label="Dashboard size"
        description="Size of labels and touch buttons on the dashboard."
      >
        <SelectPill
          :model-value="config.touchControlSize"
          :options="[
            { value: 'xsmall', label: 'X-Small' },
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
            { value: 'xlarge', label: 'X-Large' },
          ]"
          aria-label="Dashboard size"
          @update:model-value="v => emit('update:config', { touchControlSize: v })"
        />
      </SettingRow>
      <SettingRow
        label="Show button presses"
        description="A short label appears when a remote or keyboard button does something."
      >
        <ToggleSwitch
          :model-value="config.keyboardFeedbackEnabled"
          aria-label="Show button presses"
          @update:model-value="v => emit('update:config', { keyboardFeedbackEnabled: v })"
        />
      </SettingRow>
      <SettingRow label="Label size">
        <SegmentedControl
          :model-value="config.keyboardFeedbackMode"
          :options="[
            { value: 'normal', label: 'Normal' },
            { value: 'small', label: 'Small' },
          ]"
          aria-label="Label size"
          @update:model-value="v => emit('update:config', { keyboardFeedbackMode: v })"
        />
      </SettingRow>
      <SettingRow label="Hide label after">
        <NumberStepper
          :model-value="config.modeIndicatorTimeout"
          :min="0"
          :max="60"
          unit=" s"
          aria-label="Hide label after, in seconds"
          @update:model-value="v => emit('update:config', { modeIndicatorTimeout: v })"
        />
      </SettingRow>
      <KeyboardTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ScopeChip from "@/components/settings/shell/ScopeChip.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ClockBarSections from "@/components/settings/categories/ClockBarSections.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import { UI_SIZE_OPTIONS } from "@/styles/uiScale";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { normalizeDashboardScreens } from "@/utils/layout";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useUiScale } from "@/composables/useUiScale";
import { usePlacementRequest } from "@/composables/usePlacementRequest";
import { useRegionEditorRequest } from "@/composables/useRegionEditorRequest";

const props = defineProps({
  config: { type: Object, required: true },
});

const emit = defineEmits(["update:config"]);

// Kept out of the template: the quoted example would fight the formatter's
// attribute quoting.
const ROOM_NAME_DESCRIPTION = 'Shown in the clock bar, e.g. "Kitchen".';

const editorOpen = ref(false);
const route = useRoute();
const { placement, clearPlacement } = usePlacementRequest();
const { regionRequest, clearRegionRequest } = useRegionEditorRequest();

// A placement link names the page the source already shows on; open the editor
// on that page.
const initialPageId = computed(() => {
  if (regionRequest.value?.pageId) return regionRequest.value.pageId;
  return typeof route?.query?.page === "string" ? route.query.page : null;
});
const initialRegionId = computed(() => regionRequest.value?.regionId || null);

// "Put it on a page" arrives from Content: open the editor straight into place
// mode instead of making the user hunt for the button.
watch(
  () => placement.value,
  next => {
    if (next) editorOpen.value = true;
  },
  { immediate: true }
);

// A "Where it shows" line opens the editor on its page with the region selected.
watch(
  () => regionRequest.value,
  next => {
    if (next) editorOpen.value = true;
  },
  { immediate: true }
);

const closeEditor = () => {
  editorOpen.value = false;
  clearPlacement();
  clearRegionRequest();
};

const handlePlaced = () => {
  clearPlacement();
  clearRegionRequest();
};
const screenSummary = computed(() => {
  const screens = normalizeDashboardScreens(props.config.dashboardScreens).screens;
  const regionCount = screens.reduce((sum, s) => {
    const regions = s.layout.regions;
    return sum + regions.reduce((n, r) => n + (r.split ? r.split.regions.length : 1), 0);
  }, 0);
  const s = screens.length === 1 ? "" : "s";
  const r = regionCount === 1 ? "" : "s";
  return `${screens.length} page${s} · ${regionCount} region${r}`;
});

// --- Per-screen rows (settings copy audit §2) ------------------------------
// These two answer differently on a mouse PC and a wall panel, so the choice
// lives in this browser (or this kiosk's overrides). The server value is the
// seed a screen with no choice of its own starts from.
const uiSizeSetting = useScreenSetting("uiSize", {
  storageKey: "calvin-ui-size",
  serverValue: () => props.config.uiSize,
});
const uiSize = computed(() => uiSizeSetting.value.value || "default");
const { applyUiScale } = useUiScale();
const setUiSize = async value => {
  await uiSizeSetting.set(value);
  // Apply immediately, without waiting for the config store to round-trip.
  applyUiScale(value);
};

// --- Dark from: two whole-hour pickers, one row ----------------------------
const hourToTime = (hour, fallback) => {
  const value = Number.isFinite(Number(hour)) ? Number(hour) : fallback;
  return `${String(Math.max(0, Math.min(23, value))).padStart(2, "0")}:00`;
};
const timeToHour = value => {
  const hour = parseInt(String(value).split(":")[0], 10);
  return Number.isNaN(hour) ? 0 : Math.max(0, Math.min(23, hour));
};
</script>

<style scoped>
.dashboard-settings {
  width: 100%;
}

.display-name-input {
  height: var(--control-height);
  min-height: var(--touch-target);
  padding: 0 0.875rem; /* 14px */
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
  min-width: 180px;
}

.display-name-input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.dash-hours {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dash-hours__to {
  color: var(--ink-2);
  font-size: var(--fs-sm);
}
.dash-time {
  height: var(--control-height);
  min-height: var(--touch-target);
  padding: 0 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-data);
  font-size: var(--fs-control-lg);
  color: var(--ink);
}
.dash-time:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.regions-launch {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl) var(--space-2xl);
}
.regions-launch__summary {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.regions-launch__count {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink);
}
.regions-launch__hint {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.regions-launch__btn {
  margin-left: auto;
  flex: 0 0 auto;
  height: var(--control-height);
  min-height: var(--touch-target);
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--focus);
  color: var(--focus-ink);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  font-weight: 600;
  cursor: pointer;
}
.regions-launch__btn:hover {
  filter: brightness(1.06);
}
.regions-launch__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
