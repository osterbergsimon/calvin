<template>
  <component
    :is="as"
    class="focus-panel"
    :class="focused ? 'is-focused' : 'is-dim'"
    :aria-current="focused ? 'true' : null"
  >
    <slot />
  </component>
</template>

<script setup>
defineProps({
  focused: { type: Boolean, default: false },
  as: { type: String, default: "section" },
});
</script>

<style scoped>
.focus-panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 18px;
  transition:
    transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 0.35s,
    opacity 0.35s,
    filter 0.35s;
}
.focus-panel.is-focused {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--focus) 7%, transparent), transparent 38%),
    var(--bg-2);
  border-color: var(--focus-edge);
  box-shadow:
    0 0 0 1px var(--focus-edge),
    0 18px 60px -12px var(--focus-glow),
    0 0 90px -30px var(--focus-glow);
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
