<template>
  <div class="chips" role="group" :aria-label="ariaLabel || undefined">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="chip"
      :class="{ on: isSelected(o.value) }"
      :aria-pressed="isSelected(o.value) ? 'true' : 'false'"
      @click="toggle(o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const selected = computed(() => props.modelValue ?? []);
const isSelected = v => selected.value.includes(v);

const toggle = v => {
  const set = new Set(selected.value);
  set.has(v) ? set.delete(v) : set.add(v);
  // Emit in option order so the saved array is deterministic.
  emit(
    "update:modelValue",
    props.options.map(o => o.value).filter(val => set.has(val))
  );
};
</script>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.chip {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 0 14px;
  min-height: 44px;
  cursor: pointer;
}
.chip.on {
  background: var(--focus);
  color: var(--focus-ink);
  border-color: var(--focus);
}
.chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
