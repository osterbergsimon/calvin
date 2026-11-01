<template>
  <div
    class="loading-indicator pulse"
    :class="[`loading-indicator--${frameKind}`, { 'is-active': active }]"
    aria-hidden="true"
  >
    <span class="pulse__ring" />
  </div>
</template>

<script setup>
import { computed } from "vue";

/**
 * Pulse loading indicator: the frame's edge breathes slowly at low opacity.
 * No travelling light, so it is the style forced under reduced motion. The
 * global reduced-motion rule (base.css) stills the breathing on such devices,
 * leaving a quiet, steady frame line while work is in progress.
 */

const props = defineProps({
  active: { type: Boolean, default: false },
  // "app" for the whole dashboard perimeter; "region" for one region's frame.
  frame: { type: String, default: "app" },
  reducedMotion: { type: Boolean, default: false },
});

const frameKind = computed(() => (props.frame === "app" ? "app" : "region"));
</script>

<style scoped>
.loading-indicator {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-raised);
  opacity: 0;
  transition: opacity calc(var(--dur) * 2.25) ease; /* 450ms */
}

.loading-indicator--app {
  z-index: calc(var(--z-sticky) + 1);
}

.loading-indicator.is-active {
  opacity: 1;
}

.pulse__ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 2px var(--focus),
    0 0 12px 1px var(--focus-edge);
  opacity: 0.35;
  animation: pulse-breathe calc(var(--dur) * 12) ease-in-out infinite; /* 2.4s */
}

.loading-indicator--region {
  border-radius: var(--loading-light-radius, 0);
}

@keyframes pulse-breathe {
  50% {
    opacity: 0.12;
  }
}
</style>
