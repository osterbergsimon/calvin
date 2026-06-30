<template>
  <button
    v-if="visible"
    class="hot-corner"
    :class="`hot-corner--${position}`"
    :style="{ '--rest-opacity': restOpacity }"
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
import { computed } from "vue";
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();

const POSITIONS = ["bottom-left", "bottom-right", "top-left", "top-right"];

const position = computed(() => {
  const p = configStore.hotCornerPosition;
  return POSITIONS.includes(p) ? p : "bottom-left";
});

// Shown only when the UI is hidden and the corner isn't switched off.
const visible = computed(
  () => !configStore.shouldShowUI && configStore.hotCornerPosition !== "off"
);

// 0–100 setting → 0–1 rest opacity (0 = invisible but still a live tap target).
const restOpacity = computed(() => {
  const v = Number(configStore.hotCornerOpacity);
  return Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 55) / 100));
});
</script>

<style scoped>
/* A deliberate reveal affordance tucked into a screen corner: a generous touch
   target that stays unobtrusive over content (calendar/photos) until you reach
   for it. The dark glass keeps it legible over any background. Rest opacity is
   user-set; it always brightens on touch/focus. */
.hot-corner {
  position: fixed;
  z-index: 1001; /* above the clock (1000) */
  width: 64px;
  height: 64px;
  display: flex;
  border: 0;
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  opacity: var(--rest-opacity, 0.55);
  transition:
    opacity 0.2s ease,
    background 0.2s ease,
    transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}
.hot-corner:hover,
.hot-corner:active,
.hot-corner:focus-visible {
  opacity: 1;
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

/* Per-corner anchoring: inner corner rounded, gradient + icon hug the edge. */
.hot-corner--bottom-left {
  bottom: 0;
  left: 0;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 0 0 12px 12px;
  border-top-right-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--bottom-right {
  bottom: 0;
  right: 0;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 12px 12px 0;
  border-top-left-radius: 18px;
  background: linear-gradient(225deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--top-left {
  top: 0;
  left: 0;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 12px 0 0 12px;
  border-bottom-right-radius: 18px;
  background: linear-gradient(45deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--top-right {
  top: 0;
  right: 0;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 12px 12px 0 0;
  border-bottom-left-radius: 18px;
  background: linear-gradient(315deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
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
