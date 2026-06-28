<template>
  <component :is="as" class="focus-panel" :class="stateClass" :aria-current="focused ? 'true' : null">
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
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 4px;
  transition:
    transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 0.35s,
    opacity 0.35s,
    filter 0.35s;
}
.focus-panel.is-focused {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--focus) 16%, transparent), transparent 44%),
    var(--bg-2);
  border-color: var(--focus);
  /* Soft neon, even on all sides: a crisp saturated edge, a tight bright halo,
     then centered colored blooms (no directional drop), so the light is equal
     all the way around the region. */
  box-shadow:
    0 0 0 2px var(--focus),
    0 0 10px 0 var(--focus),
    0 0 30px 1px var(--focus-edge),
    0 0 68px 3px var(--focus-glow);
  transform: translateY(-2px);
}
.focus-panel.is-dim {
  opacity: 0.62;
  filter: saturate(0.65) brightness(0.86);
}
@media (prefers-reduced-motion: reduce) {
  .focus-panel {
    transition: none;
  }
}
</style>
