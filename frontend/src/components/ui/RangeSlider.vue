<template>
  <div class="range-slider">
    <input
      class="range-slider__input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="clamped"
      :aria-label="ariaLabel"
      @input="onInput"
    />
    <span class="range-slider__value">{{ clamped }}{{ unit }}</span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  unit: { type: String, default: "" },
  ariaLabel: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const clamped = computed(() => {
  const v = Number(props.modelValue);
  const n = Number.isFinite(v) ? v : props.min;
  return Math.max(props.min, Math.min(props.max, n));
});

const onInput = event => {
  const v = parseFloat(event.target.value);
  if (Number.isNaN(v)) return;
  emit("update:modelValue", Math.max(props.min, Math.min(props.max, v)));
};
</script>

<style scoped>
.range-slider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 200px;
}
.range-slider__input {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-2);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.range-slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--focus);
  cursor: pointer;
  border: 2px solid var(--bg-1);
  box-shadow: 0 2px 4px var(--shadow);
}
.range-slider__input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--focus);
  cursor: pointer;
  border: 2px solid var(--bg-1);
  box-shadow: 0 2px 4px var(--shadow);
}
.range-slider__input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.range-slider__value {
  min-width: 3.5ch;
  text-align: right;
  font-family: var(--font-data);
  font-size: 0.9rem;
  color: var(--ink-2);
}
</style>
