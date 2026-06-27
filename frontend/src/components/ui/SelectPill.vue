<template>
  <div class="pill-wrap">
    <button
      type="button"
      class="pill"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span v-if="swatch" class="pill__swatch" :style="{ background: `var(${swatch})` }" aria-hidden="true" />
      <span class="pill__label">{{ currentLabel }}</span>
      <span class="pill__cv" aria-hidden="true">▾</span>
    </button>
    <ul v-if="open" class="pill__menu" role="listbox">
      <li
        v-for="o in options"
        :key="o.value"
        role="option"
        class="pill__opt"
        :aria-selected="o.value === modelValue ? 'true' : 'false'"
        @click="choose(o.value)"
      >
        {{ o.label }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  swatch: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const currentLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? ""
);
const choose = v => {
  emit("update:modelValue", v);
  open.value = false;
};
</script>

<style scoped>
.pill-wrap {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--ink);
  cursor: pointer;
}
.pill:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pill__swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
}
.pill__cv {
  color: var(--ink-3);
  font-size: 12px;
}
.pill__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  min-width: 100%;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--focus-glow);
}
.pill__opt {
  padding: 12px 14px;
  min-height: 44px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
}
.pill__opt:hover,
.pill__opt[aria-selected="true"] {
  background: var(--bg-2);
}
</style>
