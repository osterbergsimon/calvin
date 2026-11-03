<template>
  <SettingRow
    :label="descriptor.label"
    :description="descriptor.description"
    :stacked="Boolean(descriptor.stacked)"
  >
    <template v-if="hasDescription" #description>
      <span v-if="descriptor.description">{{ descriptor.description }}</span>
      <span v-if="showReducedMotionNote">{{ descriptor.reducedMotionNote }}</span>
      <InlineNote v-if="autoNote && isAuto" :data-test="`${descriptor.key}-auto-note`">
        {{ autoNote }}
      </InlineNote>
      <ScopeLine
        v-if="showScope"
        :overridden="overridden"
        :reset-test="descriptor.resetTest"
        @reset="emit('reset')"
      />
    </template>

    <SegmentedControl
      v-if="kind === 'segmented'"
      :model-value="controlValue"
      :options="descriptor.control.options"
      :aria-label="ariaLabel"
      @update:model-value="value => emit('set', value)"
    />
    <ToggleSwitch
      v-else-if="kind === 'toggle'"
      :model-value="controlValue"
      :aria-label="ariaLabel"
      @update:model-value="value => emit('set', value)"
    />
    <SelectPill
      v-else-if="kind === 'select'"
      :model-value="controlValue"
      :options="selectOptions"
      :aria-label="ariaLabel"
      @update:model-value="value => emit('set', value)"
    />
    <NumberStepper
      v-else-if="kind === 'number'"
      :model-value="controlValue"
      :min="descriptor.control.min"
      :max="descriptor.control.max"
      :step="descriptor.control.step"
      :unit="descriptor.control.unit || ''"
      :aria-label="ariaLabel"
      @update:model-value="value => emit('set', value)"
    />
    <PhotoSourcePicker
      v-else-if="kind === 'photoSources'"
      :model-value="photoSourceIds"
      :options="photoSources"
      :aria-label="ariaLabel"
      @update:model-value="value => emit('set', value)"
    />
  </SettingRow>
</template>

<script setup>
import { computed, onMounted } from "vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import PhotoSourcePicker from "@/components/settings/shared/PhotoSourcePicker.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { usePlugins } from "@/composables/usePlugins";
import { normalizeSettingValue, settingControlOptions } from "@/utils/screenOverrides";

// One descriptor-driven row for every per-screen setting (settings-scope §7
// item 2). The descriptor says which control to render; the page says where the
// value lives: a screen page passes its overrides and shows ScopeLine, Default
// passes the household config and shows no scope at all.
const props = defineProps({
  descriptor: { type: Object, required: true },
  value: { type: [String, Number, Boolean, Array], default: null },
  // Whether this screen has its own value for the row.
  overridden: { type: Boolean, default: false },
  // A screen page shows Same as Default / Changed here; Default does not.
  showScope: { type: Boolean, default: true },
  // What Auto resolved to, e.g. "Auto (Standard on this screen)".
  autoNote: { type: String, default: "" },
});
const emit = defineEmits(["set", "reset"]);

const kind = computed(() => props.descriptor?.control?.kind || "segmented");
const ariaLabel = computed(() => props.descriptor?.ariaLabel || props.descriptor?.label);
const controlValue = computed(() => normalizeSettingValue(props.descriptor, props.value));
const isAuto = computed(() => controlValue.value === "auto");
const selectOptions = computed(() => settingControlOptions(props.descriptor, props.value));

const photoSourceIds = computed(() => (Array.isArray(props.value) ? props.value : []));

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
  if (kind.value === "photoSources" && plugins.value.length === 0) loadPlugins();
});

const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches);
const showReducedMotionNote = computed(
  () => Boolean(props.descriptor.reducedMotionNote) && prefersReducedMotion
);

const hasDescription = computed(
  () =>
    Boolean(props.descriptor.description) ||
    props.showScope ||
    Boolean(props.autoNote) ||
    showReducedMotionNote.value
);
</script>
