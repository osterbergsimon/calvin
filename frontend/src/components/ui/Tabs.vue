<template>
  <div class="tabs">
    <div class="tabs__scroller">
      <div class="tabs__list" role="tablist" :aria-label="ariaLabel || undefined" @keydown="onKey">
        <button
          v-for="(item, i) in items"
          :key="item.value"
          :ref="el => setRef(el, i)"
          type="button"
          role="tab"
          class="tabs__tab"
          :class="{ 'is-active': i === activeIndex, 'is-dimmed': item.dimmed }"
          :aria-selected="i === activeIndex ? 'true' : 'false'"
          :tabindex="i === activeIndex ? 0 : -1"
          :title="item.title || undefined"
          :aria-label="item.ariaLabel || undefined"
          :disabled="item.disabled"
          @click="select(i)"
        >
          <span class="tabs__label">{{ item.label }}</span>
          <span
            v-if="item.meta && !hideMeta"
            class="tabs__meta"
            :class="{ 'tabs__meta--warn': item.metaTone === 'warn' }"
          >
            {{ item.meta }}
          </span>
        </button>
      </div>
    </div>
    <div v-if="$slots.action" class="tabs__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";

// Navigation between views of the same thing (docs/design/frontend-doctrine.md
// §3): the pages editor's pages and the plugins catalog's kinds. Choosing a
// *value* (Light/Dark, Month/Week) stays SegmentedControl.
//
// One line per tab: a label plus optional --ink-3 meta. The active tab gets a
// 2px --focus underline and is the only one in the tab order (roving tabindex);
// Arrow keys, Home and End move focus and selection. The row scrolls sideways
// with fades at the ends instead of wrapping or showing a scrollbar. `#action`
// renders beside the tabs, outside the tablist (the editor's Add page).
const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  // [{ value, label, meta?, metaTone?: "neutral"|"warn", title?, ariaLabel?, dimmed?, disabled? }]
  items: { type: Array, required: true },
  ariaLabel: { type: String, default: "" },
  // The phone layout drops the meta line but keeps the name (CLV-47).
  hideMeta: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const refs = ref([]);
const setRef = (el, index) => {
  if (el) refs.value[index] = el;
};

const enabled = index => Boolean(props.items[index]) && !props.items[index].disabled;
const firstEnabled = () => props.items.findIndex((_, index) => enabled(index));
const lastEnabled = () => {
  for (let index = props.items.length - 1; index >= 0; index -= 1) {
    if (enabled(index)) return index;
  }
  return -1;
};

const activeIndex = computed(() => {
  const match = props.items.findIndex(item => item.value === props.modelValue && !item.disabled);
  return match >= 0 ? match : firstEnabled();
});

const nextEnabled = (from, delta) => {
  const count = props.items.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (((from + delta * step) % count) + count) % count;
    if (enabled(index)) return index;
  }
  return from;
};

const select = index => {
  if (!enabled(index)) return;
  if (props.items[index].value !== props.modelValue) {
    emit("update:modelValue", props.items[index].value);
  }
};

const moveTo = index => {
  select(index);
  nextTick(() => refs.value[index]?.focus());
};

const onKey = event => {
  if (!props.items.length) return;
  const current = activeIndex.value < 0 ? 0 : activeIndex.value;
  let next = current;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = nextEnabled(current, 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = nextEnabled(current, -1);
  else if (event.key === "Home") next = firstEnabled();
  else if (event.key === "End") next = lastEnabled();
  else return;
  event.preventDefault();
  if (next >= 0) moveTo(next);
};
</script>

<style scoped>
.tabs {
  display: flex;
  align-items: stretch;
  min-width: 0;
  max-width: 100%;
}

/* The row scrolls sideways on overflow and fades at the ends instead of
   wrapping or showing a scrollbar. */
.tabs__scroller {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  mask-image: linear-gradient(
    to right,
    transparent,
    var(--mask-opaque) var(--gap-3),
    var(--mask-opaque) calc(100% - var(--gap-3)),
    transparent
  );
}

.tabs__scroller::-webkit-scrollbar {
  display: none;
}

.tabs__list {
  display: flex;
  align-items: stretch;
}

.tabs__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--gap-inline);
  min-height: var(--tab-height);
  padding: 0 var(--gap-3);
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  white-space: nowrap;
  cursor: pointer;
}

.tabs__tab:hover:not(:disabled) {
  color: var(--ink);
}

.tabs__tab:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.tabs__tab.is-active {
  color: var(--ink);
  font-weight: var(--weight-title);
}

.tabs__tab.is-active::after {
  content: "";
  position: absolute;
  left: var(--gap-3);
  right: var(--gap-3);
  bottom: 0;
  height: var(--tab-indicator);
  background: var(--focus);
}

.tabs__tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Not on the previewed screen: still selectable, just quieter (CLV-47). */
.tabs__tab.is-dimmed {
  opacity: 0.5;
}

.tabs__label {
  display: inline-block;
}

.tabs__meta {
  max-width: 16ch;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-meta);
  font-weight: var(--weight-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tabs__meta--warn {
  color: color-mix(in srgb, var(--warn) 45%, var(--ink));
}

.tabs__action {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}
</style>
