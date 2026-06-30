<template>
  <div
    v-if="screens.length > 1"
    class="screen-dots"
    :class="{ 'screen-dots--vertical': vertical }"
    role="tablist"
  >
    <button
      v-for="screen in screens"
      :key="screen.id"
      type="button"
      class="screen-dot"
      :class="{ 'is-active': screen.id === activeScreenId }"
      :aria-label="`Show screen: ${screen.name}`"
      :aria-current="screen.id === activeScreenId ? 'true' : null"
      @click="$emit('select-screen', screen.id)"
    >
      <span class="screen-dot__pip" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  screens: { type: Array, required: true },
  activeScreenId: { type: String, default: null },
  // Stack the dots vertically for the left/right (vertical) clock bar.
  vertical: { type: Boolean, default: false },
});
defineEmits(["select-screen"]);
</script>

<style scoped>
.screen-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.screen-dots--vertical {
  flex-direction: column;
}
.screen-dot {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.screen-dot__pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ink-3);
  transition: background 0.2s;
}
.screen-dot.is-active .screen-dot__pip {
  background: var(--focus);
  box-shadow: 0 0 9px var(--focus);
}
.screen-dot:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 11px;
}
@media (prefers-reduced-motion: reduce) {
  .screen-dot__pip {
    transition: none;
  }
}
</style>
