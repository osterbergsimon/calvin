<template>
  <ChipMultiSelect
    class="photo-source-picker"
    :model-value="selection"
    :options="chipOptions"
    :aria-label="ariaLabel"
    @update:model-value="onChange"
  />
</template>

<script setup>
import { computed } from "vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";

/**
 * The photo-region source picker, shared with the photo frame row.
 *
 * An empty `modelValue` means "all sources"; the All sources chip mirrors that
 * and picking a specific source narrows the list to it (calvin-3xz9).
 */
const ALL_SOURCES = "__all__";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: "Photos from" },
});
const emit = defineEmits(["update:modelValue"]);

const selection = computed(() =>
  (props.modelValue || []).length ? props.modelValue : [ALL_SOURCES]
);
const chipOptions = computed(() => [
  { value: ALL_SOURCES, label: "All sources" },
  ...props.options.map(source => ({ value: source.id, label: source.name })),
]);

const onChange = next => {
  const currentIds = props.modelValue || [];
  const currentAll = currentIds.length === 0;
  const nextAll = next.includes(ALL_SOURCES);
  if (currentAll) {
    if (!nextAll) {
      // Deselecting All sources keeps the shared default (all sources).
      emit("update:modelValue", []);
      return;
    }
    // Picking a specific source while All is on narrows to that source.
    emit(
      "update:modelValue",
      next.filter(value => value !== ALL_SOURCES)
    );
    return;
  }
  if (nextAll) {
    emit("update:modelValue", []);
    return;
  }
  emit(
    "update:modelValue",
    next.filter(value => value !== ALL_SOURCES)
  );
};
</script>
