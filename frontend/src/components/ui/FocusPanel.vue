<template>
  <component
    :is="as"
    class="focus-panel"
    :class="stateClass"
    :aria-current="focused ? 'true' : null"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  focused: { type: Boolean, default: false },
  dim: { type: Boolean, default: true },
  as: { type: String, default: "section" },
});

const stateClass = computed(() => {
  if (props.focused) return "is-focused";
  if (props.dim) return "is-dim";
  return null;
});
</script>

<style scoped>
.focus-panel {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  /* Only compositor-friendly properties animate (calvin-c3jz): transform,
     opacity and border-color. The ring and its single small halo snap to their
     new value instead of repainting a whole region frame for 200ms — that
     crawl is very visible on the Pi kiosk. */
  transition:
    transform var(--dur) cubic-bezier(0.2, 0.7, 0.2, 1),
    opacity var(--dur),
    border-color var(--dur);
}
/* Dimming is a translucent wash whose opacity composites, instead of a
   saturate/brightness filter that re-rasterises the whole region. */
.focus-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-xs);
  background: var(--bg-0);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur);
}
.focus-panel.is-focused {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--focus) 16%, transparent), transparent 44%),
    var(--bg-2);
  border-color: var(--focus);
  /* A cheap neon ring: a crisp 2px outline plus one tight halo (the old
     four-layer glow reached 68px and dominated the tap paint cost). */
  outline: 2px solid var(--focus);
  outline-offset: -1px;
  box-shadow: 0 0 8px 0 var(--focus-edge);
  transform: translateY(-2px);
}
.focus-panel.is-dim {
  opacity: 0.62;
}
.focus-panel.is-dim::after {
  opacity: 0.28;
}
@media (prefers-reduced-motion: reduce) {
  .focus-panel,
  .focus-panel::after {
    transition: none;
  }
}
</style>
