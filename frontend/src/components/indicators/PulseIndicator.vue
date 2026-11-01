<template>
  <div
    class="loading-indicator pulse"
    :class="[`loading-indicator--${frameKind}`, { 'is-active': active }]"
    aria-hidden="true"
  >
    <!-- The one deliberate exception to the reduced-motion rule (CLV-65 motion e2e). -->
    <span class="pulse__ring" data-reduced-motion-exempt />
  </div>
</template>

<script setup>
import { computed } from "vue";

/**
 * Pulse loading indicator: the frame's edge breathes slowly at low opacity.
 * No travelling light, so it is the style forced under reduced motion. Its
 * slow low-opacity fade is itself the reduced-motion style, so it is exempt
 * from the global reduced-motion rule (base.css) and keeps pulsing there.
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
  box-shadow:
    inset 0 0 0 2px var(--focus),
    0 0 12px 1px var(--focus-edge);
  opacity: 0.35;
  animation: pulse-breathe calc(var(--dur) * 12) ease-in-out infinite; /* 2.4s */
}

/* A region frame follows the panel radius, like its focus glow. */
.loading-indicator--region,
.loading-indicator--region .pulse__ring {
  border-radius: var(--radius-frame);
}

/* The global reduced-motion rule (base.css) stops every animation with
   !important. This slow low-opacity fade *is* the reduced-motion style, so it
   keeps breathing: the more specific selector wins among !important rules. */
@media (prefers-reduced-motion: reduce) {
  .pulse__ring {
    animation-duration: calc(var(--dur) * 12) !important; /* 2.4s */
    animation-iteration-count: infinite !important;
  }
}

@keyframes pulse-breathe {
  50% {
    opacity: 0.12;
  }
}
</style>
