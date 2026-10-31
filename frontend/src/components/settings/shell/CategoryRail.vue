<template>
  <nav ref="railEl" class="category-rail" :class="{ 'is-scrollable': scrollable }" role="list">
    <FocusPanel
      v-for="(cat, index) in categories"
      :key="cat.id"
      as="button"
      :focused="cat.id === activeId"
      :dim="false"
      class="category-rail__item"
      :class="{ 'is-active': cat.id === activeId }"
      type="button"
      :aria-current="cat.id === activeId ? 'page' : null"
      :tabindex="cat.id === activeId ? 0 : -1"
      role="listitem"
      @click="$emit('select', cat.id)"
      @keydown="onKeydown($event, index)"
    >
      <span class="category-rail__label">{{ cat.label }}</span>
      <span class="category-rail__subtitle">{{ cat.subtitle }}</span>
    </FocusPanel>
  </nav>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import FocusPanel from "@/components/ui/FocusPanel.vue";

const props = defineProps({
  categories: { type: Array, required: true },
  activeId: { type: String, default: null },
});

defineEmits(["select"]);

const railEl = useTemplateRef("railEl");

// Scroll only when the items really don't fit. A viewport-height breakpoint
// guessed wrong once the rail grew to 8 categories: windows 601-650px tall
// clipped the last tiles with no way to reach them. Measuring keeps the glow
// unclipped whenever everything fits (calvin-7ux).
const scrollable = ref(false);
let resizeObserver = null;

function measure() {
  const el = railEl.value;
  if (!el) return;
  scrollable.value = el.scrollHeight > el.clientHeight + 1;
}

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !railEl.value) return;
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(railEl.value);
  for (const item of railEl.value.children) resizeObserver.observe(item);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

function onKeydown(event, index) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const next = (index + 1) % props.categories.length;
    focusItem(next);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    const prev = (index - 1 + props.categories.length) % props.categories.length;
    focusItem(prev);
  }
}

function focusItem(index) {
  const items = railEl.value?.querySelectorAll(".category-rail__item");
  if (!items) return;
  items.forEach(item => {
    item.tabIndex = -1;
  });
  if (items[index]) {
    items[index].tabIndex = 0;
    items[index].focus();
  }
}
</script>

<style scoped>
.category-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  /* Not a scroll container while everything fits: a scroll container clips
     both axes, which cuts the selected tile's outward FocusPanel glow into an
     ugly box (calvin-7ux). `is-scrollable` is set from a measurement in the
     script when the items overflow, at any viewport size. */
  overflow: visible;
}

.category-rail.is-scrollable {
  overflow-y: auto;
}

.category-rail__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.category-rail__item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.category-rail__label {
  font-family: var(--font-ui);
  color: var(--ink);
  font-size: var(--fs-control);
  font-weight: 500;
  line-height: 1.2;
}

.category-rail__subtitle {
  color: var(--ink-3);
  font-size: var(--fs-2xs);
  line-height: 1.3;
}
</style>
