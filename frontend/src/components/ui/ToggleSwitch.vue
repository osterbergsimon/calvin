<template>
  <button
    type="button"
    class="tog"
    role="switch"
    :class="{ on: modelValue }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @click="toggle"
  />
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ariaLabel: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);
const toggle = () => emit("update:modelValue", !props.modelValue);
</script>

<style scoped>
.tog {
  width: var(--toggle-w);
  height: var(--toggle-h);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}
.tog::after {
  content: "";
  position: absolute;
  top: var(--toggle-inset);
  left: var(--toggle-inset);
  width: var(--toggle-knob);
  height: var(--toggle-knob);
  border-radius: 50%;
  background: var(--switch-knob);
  transition: transform 0.2s;
}
.tog.on {
  background: var(--focus);
}
.tog.on::after {
  transform: translateX(var(--toggle-travel));
  background: var(--switch-knob-on);
}
.tog:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .tog,
  .tog::after {
    transition: none;
  }
}
</style>
