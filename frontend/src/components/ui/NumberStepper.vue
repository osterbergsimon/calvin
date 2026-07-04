<template>
  <div class="stepper" role="group" :aria-label="ariaLabel">
    <button
      type="button"
      class="stepper__btn"
      data-step="dec"
      aria-label="Decrease"
      @click="bump(-step)"
    >
      −
    </button>
    <span class="stepper__value" aria-live="polite">{{ modelValue }}</span>
    <button
      type="button"
      class="stepper__btn"
      data-step="inc"
      aria-label="Increase"
      @click="bump(step)"
    >
      +
    </button>
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
  gap: var(--space-3xs);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: calc(2px * var(--ui-scale));
}
.stepper__btn {
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  font-size: var(--fs-xl);
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: calc(9px * var(--ui-scale));
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
