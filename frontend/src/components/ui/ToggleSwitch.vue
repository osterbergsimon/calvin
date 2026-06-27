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
  width: 56px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}
.tog::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #cdd6dc;
  transition: transform 0.2s;
}
.tog.on {
  background: var(--focus);
}
.tog.on::after {
  transform: translateX(24px);
  background: #fff;
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
