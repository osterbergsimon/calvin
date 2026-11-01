<template>
  <div class="screen-behaviour" data-test="screen-behaviour">
    <SettingRow
      label="Photo frame"
      description="After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back."
    >
      <template #description>
        <span>
          After a while with no touches or key presses, photos go full screen. Any touch brings the
          dashboard back.
        </span>
        <ScopeLine
          :overridden="Boolean(overridden.photoFrameEnabled)"
          reset-test="reset-photo-frame"
          @reset="emit('reset', 'photoFrameEnabled')"
        />
      </template>
      <SegmentedControl
        :model-value="frameEnabled"
        :options="[
          { value: false, label: 'Off' },
          { value: true, label: 'On' },
        ]"
        aria-label="Photo frame"
        @update:model-value="value => emit('set', 'photoFrameEnabled', value)"
      />
    </SettingRow>

    <template v-if="frameEnabled">
      <SettingRow label="Start after">
        <template #description>
          <ScopeLine
            :overridden="Boolean(overridden.photoFrameTimeout)"
            reset-test="reset-photo-frame-timeout"
            @reset="emit('reset', 'photoFrameTimeout')"
          />
        </template>
        <SelectPill
          :model-value="timeout"
          :options="timeoutOptions"
          aria-label="Start the photo frame after"
          @update:model-value="value => emit('set', 'photoFrameTimeout', value)"
        />
      </SettingRow>
      <SettingRow
        label="Photos from"
        description="All sources, or the photo sources this screen's frame uses."
        stacked
      >
        <template #description>
          <span>All sources, or the photo sources this screen's frame uses.</span>
          <ScopeLine
            :overridden="Boolean(overridden.photoFrameSourceIds)"
            reset-test="reset-photo-frame-sources"
            @reset="emit('reset', 'photoFrameSourceIds')"
          />
        </template>
        <PhotoSourcePicker
          :model-value="sourceIds"
          :options="photoSources"
          @update:model-value="value => emit('set', 'photoFrameSourceIds', value)"
        />
      </SettingRow>
    </template>

    <SettingRow
      label="Loading light"
      description="What Calvin shows while it's fetching something."
    >
      <template #description>
        <span>What Calvin shows while it's fetching something.</span>
        <span v-if="prefersReducedMotion">This device prefers less motion, so it pulses.</span>
        <ScopeLine
          :overridden="Boolean(overridden.loadingLight)"
          reset-test="reset-loading-light"
          @reset="emit('reset', 'loadingLight')"
        />
      </template>
      <SegmentedControl
        :model-value="light"
        :options="LOADING_LIGHT_OPTIONS"
        aria-label="Loading light"
        @update:model-value="value => emit('set', 'loadingLight', value)"
      />
    </SettingRow>

    <SettingRow
      label="Layout"
      description="Auto follows the screen size. Force the desktop or phone layout on this screen."
    >
      <template #description>
        <span>Auto follows the screen size. Force the desktop or phone layout on this screen.</span>
        <ScopeLine
          :overridden="Boolean(overridden.layoutMode)"
          reset-test="reset-layout-mode"
          @reset="emit('reset', 'layoutMode')"
        />
      </template>
      <SegmentedControl
        :model-value="layout"
        :options="LAYOUT_OPTIONS"
        aria-label="Layout"
        @update:model-value="value => emit('set', 'layoutMode', value)"
      />
    </SettingRow>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import PhotoSourcePicker from "@/components/settings/shared/PhotoSourcePicker.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { usePlugins } from "@/composables/usePlugins";
import { normalizeLayoutMode } from "@/utils/layoutMode";

// The per-screen behaviour rows (docs/design/2026-11-01-screen-schedule.md §4):
// Photo frame, Loading light and Layout moved out of Dashboard › Focus & remote
// to Screens › Default / each screen. They keep their per-screen storage — the
// Default page hands in useScreenSetting's values, a screen page its overrides.
const props = defineProps({
  photoFrameEnabled: { type: [Boolean, String], default: false },
  photoFrameTimeout: { type: [Number, String], default: 300 },
  photoFrameSourceIds: { type: Array, default: () => [] },
  loadingLight: { type: String, default: "comet" },
  layoutMode: { type: String, default: "auto" },
  // Which values this screen has its own choice for (the ScopeLine above).
  overridden: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["set", "reset"]);

const frameEnabled = computed(
  () => props.photoFrameEnabled === true || props.photoFrameEnabled === "true"
);

const PHOTO_FRAME_MINUTES = [1, 2, 5, 10, 15, 30];
const minutesLabel = seconds => {
  if (seconds % 60 !== 0) return `${seconds} s`;
  return `${seconds / 60} min`;
};
const timeout = computed(() => {
  const seconds = Number(props.photoFrameTimeout);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
});
const timeoutOptions = computed(() => {
  const options = PHOTO_FRAME_MINUTES.map(minutes => ({
    value: minutes * 60,
    label: `${minutes} min`,
  }));
  const current = timeout.value;
  if (!options.some(option => option.value === current)) {
    options.push({ value: current, label: minutesLabel(current) });
    options.sort((a, b) => a.value - b.value);
  }
  return options;
});

const sourceIds = computed(() =>
  Array.isArray(props.photoFrameSourceIds) ? props.photoFrameSourceIds : []
);

const LOADING_LIGHT_OPTIONS = [
  { value: "comet", label: "Comet" },
  { value: "pulse", label: "Pulse" },
  { value: "off", label: "Off" },
];
const light = computed(() =>
  LOADING_LIGHT_OPTIONS.some(option => option.value === props.loadingLight)
    ? props.loadingLight
    : "comet"
);

const LAYOUT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "desktop", label: "Desktop" },
  { value: "phone", label: "Phone" },
];
const layout = computed(() => normalizeLayoutMode(props.layoutMode));

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
</script>
