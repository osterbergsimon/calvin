<template>
  <div class="clock-bar-size-picker">
    <SettingRow :label="`${label} size`">
      <SegmentedControl
        :model-value="size"
        :options="CLOCK_BAR_SIZE_OPTIONS"
        :aria-label="`${label} size`"
        @update:model-value="selectSize"
      />
    </SettingRow>
    <SettingGroup v-if="size === 'custom'" :title="`${label} size`">
      <SettingRow label="Time">
        <RangeSlider
          :model-value="timeSize"
          :min="8"
          :max="max"
          unit="px"
          :aria-label="`${label} time size in pixels`"
          @update:model-value="value => emit('update', { time: value })"
        />
      </SettingRow>
      <SettingRow label="Padding">
        <RangeSlider
          :model-value="padding"
          :min="0"
          :max="32"
          unit="px"
          :aria-label="`${label} padding in pixels`"
          @update:model-value="value => emit('update', { padding: value })"
        />
      </SettingRow>
      <SettingRow label="Plugin info">
        <RangeSlider
          :model-value="pluginItemSize"
          :min="8"
          :max="max"
          unit="px"
          :aria-label="`${label} plugin info size in pixels`"
          @update:model-value="value => emit('update', { plugin: value })"
        />
      </SettingRow>
    </SettingGroup>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import {
  CLOCK_BAR_SIZE_OPTIONS,
  clockBarSizePreset,
  clockBarSizeValues,
} from "@/utils/clockBarSizes";

// One bar's size (docs/design/2026-11-01-screen-schedule.md §4): Small · Medium
// · Large write the stored values; Custom opens the three fine-tune rows. The
// date size has no row of its own — a preset writes it in proportion, and a
// Custom bar keeps whatever it had.
const props = defineProps({
  label: { type: String, required: true },
  orientation: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value),
  },
  timeSize: { type: Number, required: true },
  padding: { type: Number, required: true },
  pluginItemSize: { type: Number, required: true },
  max: { type: Number, default: 72 },
});
const emit = defineEmits(["update"]);

const size = computed(() =>
  custom.value
    ? "custom"
    : clockBarSizePreset(
        { time: props.timeSize, padding: props.padding, plugin: props.pluginItemSize },
        props.orientation
      )
);

// Custom is the user's open choice: with the preset values unchanged, choosing
// it must still reveal the fine-tune rows.
const custom = ref(false);

function selectSize(name) {
  if (name === "custom") {
    custom.value = true;
    return; // Custom only opens the rows; nothing is written.
  }
  custom.value = false;
  const values = clockBarSizeValues(name, props.orientation);
  if (values) emit("update", values);
}
</script>
