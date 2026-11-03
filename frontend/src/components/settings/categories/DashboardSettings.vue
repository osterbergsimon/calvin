<template>
  <div class="dashboard-settings">
    <!-- DASHBOARD SCREENS / REGIONS -->
    <SettingsSection id="regions" title="Pages & regions">
      <SettingRow
        :label="screenSummary"
        description="Design each page’s regions in the full-size editor."
      >
        <Button variant="primary" @click="editorOpen = true">Open editor</Button>
      </SettingRow>
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
        <TextField
          label="Dark from"
          hide-label
          type="time"
          step="3600"
          :model-value="hourToTime(config.darkModeStart, 18)"
          @update:model-value="v => emit('update:config', { darkModeStart: timeToHour(v) })"
        />
      </SettingRow>
      <SettingRow v-if="config.themeMode === 'time'" label="Dark to">
        <TextField
          label="Dark to"
          hide-label
          type="time"
          step="3600"
          :model-value="hourToTime(config.darkModeEnd, 6)"
          @update:model-value="v => emit('update:config', { darkModeEnd: timeToHour(v) })"
        />
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
    </SettingsSection>

    <!-- The moved per-screen groups: one line where they used to be (§4). -->
    <InlineNote class="dashboard-signpost" data-test="dashboard-screen-signpost">
      Focus light and controls are set per screen.
      <template #action>
        <Button variant="link" data-test="open-screens-settings" @click="openScreenSettings">
          Open Screens
        </Button>
      </template>
    </InlineNote>

    <SettingsSection id="kiosk-touch-focus" title="Remote buttons">
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
import InlineNote from "@/components/ui/InlineNote.vue";
import Button from "@/components/ui/Button.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import TextField from "@/components/ui/TextField.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ClockBarSections from "@/components/settings/categories/ClockBarSections.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import { UI_SIZE_OPTIONS } from "@/styles/uiScale";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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

const editorOpen = ref(false);
const route = useRoute();
const router = useRouter();
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

// "Open Screens": the same destination as the old Controls deep link. On a
// kiosk it opens that screen's page; elsewhere Screens › Default.
const openScreenSettings = () => {
  router.push({ path: "/settings", query: { setting: "dashboard-kiosk" } });
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
  // Apply immediately, without waiting for the save round-trip.
  applyUiScale(value);
  await uiSizeSetting.set(value);
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
