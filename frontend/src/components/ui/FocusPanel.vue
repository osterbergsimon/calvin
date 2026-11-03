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

<script>
/** provide/inject key: the dashboard's focus light style ("performance" | "full"). */
export const FOCUS_LIGHT_STYLE_KEY = "calvin:focus-light-style";
</script>

<script setup>
import { computed, inject, ref, unref } from "vue";

const props = defineProps({
  focused: { type: Boolean, default: false },
  dim: { type: Boolean, default: true },
  as: { type: String, default: "section" },
});

// Performance is the default; the dashboard provides "full" on kiosks fast
// enough for the original glow (calvin-fufd).
const focusLightStyle = inject(FOCUS_LIGHT_STYLE_KEY, ref("performance"));
const isFull = computed(() => unref(focusLightStyle) === "full");

const stateClass = computed(() => {
  const classes = [];
  if (props.focused) classes.push("is-focused");
  else if (props.dim) classes.push("is-dim");
  if (isFull.value) classes.push("is-full");
  return classes;
});
</script>

<style scoped>
/* PERFORMANCE (default). Nothing animates and nothing lifts: on a Pi 3B+ the
   2px lift and its 0.2s transitions were about half the cost of a region swap
   (calvin-fufd). The ring, the single halo and the tint just snap. */
.focus-panel {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
}
/* Dimming is a translucent wash, not a saturate/brightness filter that
   re-rasterises the whole region. */
.focus-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-xs);
  background: var(--bg-0);
  opacity: 0;
  pointer-events: none;
}
.focus-panel.is-focused {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--focus) 16%, transparent), transparent 44%),
    var(--bg-2);
  border-color: var(--focus);
  outline: 2px solid var(--focus);
  outline-offset: -1px;
  box-shadow: 0 0 8px 0 var(--focus-edge);
}
.focus-panel.is-dim {
  opacity: 0.62;
}
.focus-panel.is-dim::after {
  opacity: 0.28;
}

/* FULL: the original neon glow and dim from before the kiosk perf work
   (calvin-e70v, calvin-c3jz). Opt-in per screen for fast kiosks. */
.focus-panel.is-full {
  transition:
    transform var(--dur) cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow var(--dur),
    opacity var(--dur),
    filter var(--dur);
}
.focus-panel.is-full::after {
  display: none;
}
.focus-panel.is-full.is-focused {
  outline: none;
  /* Soft neon, even on all sides: a crisp saturated edge, a tight bright halo,
     then centered colored blooms. */
  box-shadow:
    0 0 0 2px var(--focus),
    0 0 10px 0 var(--focus),
    0 0 30px 1px var(--focus-edge),
    0 0 68px 3px var(--focus-glow);
  transform: translateY(-2px);
}
.focus-panel.is-full.is-dim {
  filter: saturate(0.65) brightness(0.86);
}
@media (prefers-reduced-motion: reduce) {
  .focus-panel.is-full {
    transition: none;
  }
}
</style>
