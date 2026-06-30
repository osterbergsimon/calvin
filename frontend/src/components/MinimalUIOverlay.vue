<template>
  <button
    v-if="!configStore.shouldShowUI"
    class="hot-corner"
    type="button"
    title="Show controls"
    aria-label="Show controls"
    @click="configStore.showUITemporarily(60)"
  >
    <svg class="hot-corner__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
    </svg>
  </button>
</template>

<script setup>
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();
</script>

<style scoped>
/* A deliberate reveal affordance tucked into the bottom-left corner: a generous
   touch target that stays unobtrusive over content (calendar/photos) until you
   reach for it. The dark glass keeps it legible over any background. */
.hot-corner {
  position: fixed;
  bottom: 0;
  left: 0;
  z-index: 1001; /* above the clock (1000) */
  width: 64px;
  height: 64px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 0 0 12px 12px;
  border: 0;
  /* rounded only on the inner corner so it reads as tucked into the screen edge */
  border-top-right-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
.hot-corner:hover,
.hot-corner:active,
.hot-corner:focus-visible {
  color: rgba(255, 255, 255, 0.95);
  background: linear-gradient(135deg, color-mix(in srgb, black 60%, transparent), transparent 75%);
}
.hot-corner:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.hot-corner:active {
  transform: scale(0.96);
}
.hot-corner__icon {
  width: 22px;
  height: 22px;
}
@media (prefers-reduced-motion: reduce) {
  .hot-corner {
    transition: none;
  }
  .hot-corner:active {
    transform: none;
  }
}
</style>
