<template>
  <button
    v-if="visible"
    class="hot-corner"
    :class="`hot-corner--${position}`"
    :style="{ '--rest-opacity': restOpacity, '--hot-corner-size': `${size}px` }"
    type="button"
    title="Show controls (press and hold)"
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
import { normalizeHotCornerPosition, HOT_CORNER_DEFAULTS } from "../utils/hotCorner";

const configStore = useConfigStore();

const position = computed(() => normalizeHotCornerPosition(configStore.hotCornerPosition));

// A pure hint — shown whenever the UI is hidden. The reveal itself is a
// long-press detected at the dashboard level (useHotCornerReveal), so this
// element stays pointer-events:none and never intercepts a content tap.
const visible = computed(() => !configStore.shouldShowUI);

// Square touch target / long-press hit-box size (px), also drives icon + inset.
const size = computed(() => {
  const v = Number(configStore.hotCornerSize);
  return Number.isFinite(v) && v > 0 ? v : HOT_CORNER_DEFAULTS.size;
});

// 0–100 setting → 0–1 rest opacity (0 = invisible but the long-press still works).
const restOpacity = computed(() => {
  const v = Number(configStore.hotCornerOpacity);
  return Math.max(0, Math.min(1, (Number.isFinite(v) ? v : HOT_CORNER_DEFAULTS.opacity) / 100));
});
</script>

<style scoped>
/* A deliberate reveal affordance tucked into a screen corner: a subtle hint
   that stays unobtrusive over content (calendar/photos). It never captures
   pointer events — short taps fall through to content; a press-and-hold in the
   corner is what reveals the UI. The dark glass keeps the icon legible over any
   background. Rest opacity + size are user-set. */
.hot-corner {
  position: fixed;
  z-index: 1001; /* above the clock (1000) */
  width: var(--hot-corner-size, 64px);
  height: var(--hot-corner-size, 64px);
  display: flex;
  border: 0;
  color: rgba(255, 255, 255, 0.95);
  pointer-events: none; /* never intercept content taps; reveal is a long-press */
  opacity: var(--rest-opacity, 0.55);
  transition: opacity 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
/* Keyboard users can still Tab to the button and reveal with Enter (pointer-events
   doesn't disable keyboard activation); brighten it while focused. */
.hot-corner:focus-visible {
  opacity: 1;
  pointer-events: auto;
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.hot-corner__icon {
  width: calc(var(--hot-corner-size, 64px) * 0.34);
  height: calc(var(--hot-corner-size, 64px) * 0.34);
}

/* Per-corner anchoring: inner corner rounded, gradient + icon hug the edge.
   Inset + radius scale with the target size. */
.hot-corner--bottom-left {
  bottom: 0;
  left: 0;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 0 0 calc(var(--hot-corner-size, 64px) * 0.19) calc(var(--hot-corner-size, 64px) * 0.19);
  border-top-right-radius: calc(var(--hot-corner-size, 64px) * 0.28);
  background: linear-gradient(135deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--bottom-right {
  bottom: 0;
  right: 0;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 calc(var(--hot-corner-size, 64px) * 0.19) calc(var(--hot-corner-size, 64px) * 0.19) 0;
  border-top-left-radius: calc(var(--hot-corner-size, 64px) * 0.28);
  background: linear-gradient(225deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--top-left {
  top: 0;
  left: 0;
  align-items: flex-start;
  justify-content: flex-start;
  padding: calc(var(--hot-corner-size, 64px) * 0.19) 0 0 calc(var(--hot-corner-size, 64px) * 0.19);
  border-bottom-right-radius: calc(var(--hot-corner-size, 64px) * 0.28);
  background: linear-gradient(45deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}
.hot-corner--top-right {
  top: 0;
  right: 0;
  align-items: flex-start;
  justify-content: flex-end;
  padding: calc(var(--hot-corner-size, 64px) * 0.19) calc(var(--hot-corner-size, 64px) * 0.19) 0 0;
  border-bottom-left-radius: calc(var(--hot-corner-size, 64px) * 0.28);
  background: linear-gradient(315deg, color-mix(in srgb, black 42%, transparent), transparent 70%);
}

@media (prefers-reduced-motion: reduce) {
  .hot-corner {
    transition: none;
  }
}
</style>
