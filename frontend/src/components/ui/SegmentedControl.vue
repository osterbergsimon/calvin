<template>
  <div class="seg" role="radiogroup" :aria-label="ariaLabel" @keydown="onKey">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      :ref="el => setRef(el, i)"
      type="button"
      role="radio"
      class="seg__btn"
      :class="{ on: o.value === modelValue }"
      :aria-checked="o.value === modelValue ? 'true' : 'false'"
      :tabindex="o.value === modelValue ? 0 : -1"
      @click="select(o.value)"
    >
      <span v-if="o.icon" class="seg__ic" aria-hidden="true">{{ o.icon }}</span>
      {{ o.label }}
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const refs = ref([]);
const setRef = (el, i) => {
  if (el) refs.value[i] = el;
};

const select = v => {
  if (v !== props.modelValue) emit("update:modelValue", v);
};

const onKey = e => {
  const idx = props.options.findIndex(o => o.value === props.modelValue);
  if (idx < 0) return;
  let n = idx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (idx + 1) % props.options.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    n = (idx - 1 + props.options.length) % props.options.length;
  else return;
  e.preventDefault();
  emit("update:modelValue", props.options[n].value);
  refs.value[n]?.focus();
};
</script>

<style scoped>
.seg {
  display: inline-flex;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-3xs);
}
.seg__btn {
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  padding: calc(10px * var(--ui-scale)) calc(18px * var(--ui-scale));
  min-height: var(--touch-target);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: calc(7px * var(--ui-scale));
}
.seg__btn.on {
  background: var(--focus);
  color: var(--focus-ink);
}
.seg__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
