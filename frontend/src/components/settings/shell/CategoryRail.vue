<template>
  <nav ref="railEl" class="category-rail" role="list">
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
import { useTemplateRef } from "vue";
import FocusPanel from "@/components/ui/FocusPanel.vue";

const props = defineProps({
  categories: { type: Array, required: true },
  activeId: { type: String, default: null },
});

defineEmits(["select"]);

const railEl = useTemplateRef("railEl");

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
  /* Keep this NOT a scroll container by default: a scroll container clips both
     axes, which cuts the selected tile's outward FocusPanel glow into an ugly
     box (calvin-7ux). The 6 categories always fit on a normal viewport, so the
     glow blooms freely here. Only short kiosks need the rail to scroll
     (calvin-g7v) — scoped below, where a glow clipped at the scroll edge reads
     as normal scrolling. */
  overflow: visible;
}

/* Wide-short kiosk (e.g. 800x480): the settings layout keeps its constrained
   internal scroll (calvin-g7v) and the rail's items can exceed the viewport, so
   let the rail scroll here. Short+narrow falls back to page scroll via the
   media queries in Settings.vue, so it needs no override. */
@media (max-height: 600px) and (min-width: 769px) {
  .category-rail {
    overflow-y: auto;
  }
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
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
}

.category-rail__subtitle {
  color: var(--ink-3);
  font-size: 0.75rem;
  line-height: 1.3;
}
</style>
