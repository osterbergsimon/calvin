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
 * No travelling light, so it is the style forced under reduced motion. Its
 * slow low-opacity fade is itself the reduced-motion style, so an *active*
 * ring is exempt from the global reduced-motion rule (base.css) and keeps
 * pulsing there. An idle ring never animates.
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
  transition: opacity var(--dur) ease;
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
  /* Idle: no animation work while nothing loads (a kiosk idles for weeks). */
  animation-play-state: paused;
}

.loading-indicator.is-active .pulse__ring {
  animation-play-state: running;
}

/* A region frame follows the panel radius, like its focus glow. */
.loading-indicator--region,
.loading-indicator--region .pulse__ring {
  border-radius: var(--radius-frame);
}

/* The global reduced-motion rule (base.css) stops every animation with
   !important. This slow low-opacity fade *is* the reduced-motion style, so an
   active ring keeps breathing: the more specific selector wins among
   !important rules. An idle ring stays stopped by the global rule (CLV-65
   motion contract, tests/e2e/a11y/motion.spec.js). */
@media (prefers-reduced-motion: reduce) {
  .loading-indicator.is-active .pulse__ring {
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
