<template>
  <div class="pill-wrap" ref="rootEl">
    <button
      type="button"
      class="pill"
      :aria-label="ariaLabel || undefined"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      ref="triggerEl"
      @click="toggleOpen"
      @keydown="onTriggerKey"
    >
      <span
        v-if="swatch"
        class="pill__swatch"
        :style="{ background: `var(${swatch})` }"
        aria-hidden="true"
      />
      <span class="pill__label">{{ currentLabel }}</span>
      <span class="pill__cv" aria-hidden="true">▾</span>
    </button>
    <ul
      v-if="open"
      class="pill__menu"
      :class="{ 'pill__menu--up': openUp }"
      :style="popoverStyle"
      role="listbox"
      :id="listboxId"
      :aria-activedescendant="activeOptionId"
      @keydown="onListKey"
    >
      <li
        v-for="(o, i) in options"
        :key="o.value"
        :id="`${listboxId}-opt-${i}`"
        role="option"
        class="pill__opt"
        :class="{ 'pill__opt--active': i === activeIndex }"
        :aria-selected="o.value === modelValue ? 'true' : 'false'"
        tabindex="-1"
        :ref="el => setOptRef(el, i)"
        @click="choose(o.value)"
      >
        {{ o.label }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, nextTick } from "vue";
import { usePopoverPlacement } from "@/composables/usePopoverPlacement";

let _counter = 0;
const listboxId = `selectpill-lb-${++_counter}-${Math.random().toString(36).slice(2, 7)}`;

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  swatch: { type: String, default: null },
  ariaLabel: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const activeIndex = ref(0);
const rootEl = ref(null);
const triggerEl = ref(null);
const optRefs = ref([]);
const { openUp, popoverStyle, place } = usePopoverPlacement();

const currentLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? ""
);

const activeOptionId = computed(() =>
  open.value ? `${listboxId}-opt-${activeIndex.value}` : undefined
);

const setOptRef = (el, i) => {
  if (el) optRefs.value[i] = el;
};

const handleClickOutside = e => {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false;
    document.removeEventListener("click", handleClickOutside);
  }
};

const close = () => {
  open.value = false;
  document.removeEventListener("click", handleClickOutside);
  nextTick(() => triggerEl.value?.focus());
};

const openList = () => {
  const idx = props.options.findIndex(o => o.value === props.modelValue);
  activeIndex.value = idx >= 0 ? idx : 0;
  place(triggerEl);
  open.value = true;
  nextTick(() => {
    optRefs.value[activeIndex.value]?.focus();
    document.addEventListener("click", handleClickOutside);
  });
};

const toggleOpen = () => {
  if (open.value) {
    close();
  } else {
    openList();
  }
};

const choose = v => {
  emit("update:modelValue", v);
  close();
};

const onTriggerKey = e => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) {
      openList();
    } else {
      activeIndex.value = Math.min(activeIndex.value + 1, props.options.length - 1);
      nextTick(() => optRefs.value[activeIndex.value]?.focus());
    }
  }
};

const onListKey = e => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, props.options.length - 1);
    nextTick(() => optRefs.value[activeIndex.value]?.focus());
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
    nextTick(() => optRefs.value[activeIndex.value]?.focus());
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    choose(props.options[activeIndex.value].value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
};

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
.pill-wrap {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem; /* 12px */
  height: var(--control-height);
  padding: 0 1rem; /* 16px */
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
  cursor: pointer;
}
.pill:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pill__swatch {
  width: 1rem; /* 16px */
  height: 1rem;
  border-radius: 0.3125rem; /* 5px */
}
.pill__cv {
  color: var(--ink-3);
  font-size: 0.75rem; /* 12px */
}
.pill__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  min-width: 100%;
  list-style: none;
  margin: 0;
  padding: 0.375rem; /* 6px */
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: 0 12px 32px var(--focus-glow);
  /* Long option lists scroll inside the menu (max-height set inline from the
     viewport space) instead of running off a short screen. */
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pill__menu--up {
  top: auto;
  bottom: calc(100% + 6px);
}
.pill__opt {
  padding: 0.75rem 0.875rem; /* 12px 14px */
  min-height: var(--touch-target);
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
}
.pill__opt:hover,
.pill__opt[aria-selected="true"],
.pill__opt--active {
  background: var(--bg-2);
}
.pill__opt:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
</style>
