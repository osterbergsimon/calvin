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
        label="Photo frame"
        description="After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back."
      >
        <template #description>
          <p class="setting-row__desc">
            After a while with no touches or key presses, photos go full screen. Any touch brings
            the dashboard back.
          </p>
          <ScopeLine
            :overridden="photoFrameSetting.overridden.value"
            reset-test="reset-photo-frame"
            @reset="photoFrameSetting.reset()"
          />
        </template>
        <SegmentedControl
          :model-value="photoFrameEnabled"
          :options="[
            { value: false, label: 'Off' },
            { value: true, label: 'On' },
          ]"
          aria-label="Photo frame"
          @update:model-value="photoFrameSetting.set($event)"
        />
      </SettingRow>
      <SettingRow v-if="photoFrameEnabled" label="Start after">
        <template #description>
          <ScopeLine
            :overridden="photoFrameTimeoutSetting.overridden.value"
            reset-test="reset-photo-frame-timeout"
            @reset="photoFrameTimeoutSetting.reset()"
          />
        </template>
        <SelectPill
          :model-value="photoFrameTimeout"
          :options="photoFrameTimeoutOptions"
          aria-label="Start the photo frame after"
          @update:model-value="photoFrameTimeoutSetting.set($event)"
        />
      </SettingRow>
      <SettingRow
        v-if="photoFrameEnabled"
        label="Photos from"
        description="All sources, or the photo sources this screen's frame uses."
      >
        <template #description>
          <p class="setting-row__desc">
            All sources, or the photo sources this screen's frame uses.
          </p>
          <ScopeLine
            :overridden="photoFrameSourceSetting.overridden.value"
            reset-test="reset-photo-frame-sources"
            @reset="photoFrameSourceSetting.reset()"
          />
        </template>
        <PhotoSourcePicker
          :model-value="photoFrameSourceIds"
          :options="photoSources"
          @update:model-value="photoFrameSourceSetting.set($event)"
        />
      </SettingRow>
      <SettingRow label="Loading light">
        <template #description>
          <p class="setting-row__desc">What Calvin shows while it's fetching something.</p>
          <p v-if="prefersReducedMotion" class="setting-row__desc">
            This device prefers less motion, so it pulses.
          </p>
          <ScopeLine
            :overridden="loadingLightSetting.overridden.value"
            reset-test="reset-loading-light"
            @reset="loadingLightSetting.reset()"
          />
        </template>
        <SegmentedControl
          :model-value="loadingLight"
          :options="LOADING_LIGHT_OPTIONS"
          aria-label="Loading light"
          @update:model-value="v => loadingLightSetting.set(v)"
        />
      </SettingRow>
      <SettingRow
        label="Layout"
        description="Auto follows the screen size. Force the desktop or phone layout on this screen."
      >
        <template #description>
          <p class="setting-row__desc">
            Auto follows the screen size. Force the desktop or phone layout on this screen.
          </p>
          <ScopeLine
            :overridden="layoutSetting.overridden.value"
            reset-test="reset-layout-mode"
            @reset="layoutSetting.reset()"
          />
        </template>
        <SegmentedControl
          :model-value="layoutMode"
          :options="LAYOUT_OPTIONS"
          aria-label="Layout"
          @update:model-value="v => layoutSetting.set(v)"
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
import ScopeLine from "@/components/ui/ScopeLine.vue";
import Button from "@/components/ui/Button.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import PhotoSourcePicker from "@/components/settings/shared/PhotoSourcePicker.vue";
import ClockBarSections from "@/components/settings/categories/ClockBarSections.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import { UI_SIZE_OPTIONS } from "@/styles/uiScale";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { normalizeDashboardScreens } from "@/utils/layout";
import { LAYOUT_STORAGE_KEY, normalizeLayoutMode } from "@/utils/layoutMode";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { usePlugins } from "@/composables/usePlugins";
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

// --- Loading light: per screen, like the rows above (CLV-115) --------------
// A wall panel and a laptop may want different lights; the Default value is
// what a screen without its own choice uses. Reduced motion forces the pulse
// on the dashboard, so say so here instead of silently ignoring Comet.
const LOADING_LIGHT_OPTIONS = [
  { value: "comet", label: "Comet" },
  { value: "pulse", label: "Pulse" },
  { value: "off", label: "Off" },
];
const loadingLightSetting = useScreenSetting("loadingLight", {
  serverValue: () => props.config.loadingLight,
});
const loadingLight = computed(() => {
  const value = loadingLightSetting.value.value;
  return LOADING_LIGHT_OPTIONS.some(option => option.value === value) ? value : "comet";
});

// --- Layout: per screen, browser, or kiosk (calvin-tnkg) --------------------
// A small or portrait kiosk may want the desktop layout. On a kiosk the choice
// is that screen's override; any other browser remembers it locally. Auto is
// today's viewport rule.
const LAYOUT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "desktop", label: "Desktop" },
  { value: "phone", label: "Phone" },
];
const layoutSetting = useScreenSetting("layoutMode", { storageKey: LAYOUT_STORAGE_KEY });
const layoutMode = computed(() => normalizeLayoutMode(layoutSetting.value.value));

// --- Photo frame: per screen (calvin-3xz9) ---------------------------------
// Off/On, the idle wait and the sources all follow this screen's own choice
// (a kiosk's override, or this browser's localStorage) with the old global
// value as the Default. The frame's sources use the same picker as a photo
// region: an empty list means every source.
const PHOTO_FRAME_MINUTES = [1, 2, 5, 10, 15, 30];
const photoFrameSetting = useScreenSetting("photoFrameEnabled", {
  serverValue: () => props.config.photoFrameEnabled,
  serialize: JSON.stringify,
  parse: JSON.parse,
});
const photoFrameEnabled = computed(
  () => photoFrameSetting.value.value === true || photoFrameSetting.value.value === "true"
);
const photoFrameTimeoutSetting = useScreenSetting("photoFrameTimeout", {
  serverValue: () => props.config.photoFrameTimeout,
  serialize: JSON.stringify,
  parse: JSON.parse,
});
const photoFrameTimeout = computed(() => {
  const seconds = Number(photoFrameTimeoutSetting.value.value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
});
const minutesLabel = seconds => {
  if (seconds % 60 !== 0) return `${seconds} s`;
  return `${seconds / 60} min`;
};
const photoFrameTimeoutOptions = computed(() => {
  const options = PHOTO_FRAME_MINUTES.map(minutes => ({
    value: minutes * 60,
    label: `${minutes} min`,
  }));
  const current = photoFrameTimeout.value;
  if (!options.some(option => option.value === current)) {
    options.push({ value: current, label: minutesLabel(current) });
    options.sort((a, b) => a.value - b.value);
  }
  return options;
});
const photoFrameSourceSetting = useScreenSetting("photoFrameSourceIds", {
  serverValue: () => props.config.photoFrameSourceIds,
  serialize: JSON.stringify,
  parse: JSON.parse,
});
const photoFrameSourceIds = computed(() =>
  Array.isArray(photoFrameSourceSetting.value.value) ? photoFrameSourceSetting.value.value : []
);

// The photo-region picker's source list: enabled image-plugin instances.
const { plugins, pluginInstances, loadPlugins } = usePlugins();
const photoSources = computed(() =>
  plugins.value
    .filter(plugin => plugin.type === "image" && plugin.enabled)
    .flatMap(plugin => pluginInstances.value[plugin.id] || [])
    .filter(instance => instance.enabled !== false)
    .map(instance => ({ id: instance.id, name: instance.name }))
);
onMounted(() => {
  if (plugins.value.length === 0) loadPlugins();
});

const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches);

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
