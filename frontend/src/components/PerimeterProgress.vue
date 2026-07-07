<template>
  <!--
    Ambient loading indicator: a comet of focus-light orbits the perimeter of
    the content area (this element's border box). Where a clock bar frames that
    edge, the light rides the bar's own seam; on the other edges it traces the
    screen/region edge as a quiet frame accent. Purely decorative — hidden from
    assistive tech, non-interactive.

    The beads always animate; the container's opacity gates *visibility* on the
    active state, so revealing the comet is a cheap fade with no layout churn.
  -->
  <div
    class="perimeter-progress"
    :class="{ 'is-active': show }"
    aria-hidden="true"
  >
    <span
      v-for="i in beadCount"
      :key="i"
      class="perimeter-progress__bead"
      :style="beadStyle(i)"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useProgressStore } from "../stores/progress";

const progress = useProgressStore();

// A dense train of beads packed close enough that their glows fuse into one
// continuous line — a bright leading edge with a soft tail streaming out
// behind it, the same neon vocabulary as the focus light.
const beadCount = 22;
const step = 0.0028; // spacing between beads, as a fraction of the loop
const show = computed(() => progress.active);

const beadStyle = index => {
  const i = index - 1; // 0 = head
  const t = i / (beadCount - 1); // 0 at the head → 1 at the tail tip

  // Keep the tail behind the head: the head gets the most-negative delay (it
  // sits furthest along the loop and leads the direction of travel); each
  // trailing bead is progressively less advanced, so the wake streams out the
  // back. All delays stay negative, so there's no start-up jump.
  const trail = (beadCount - 1 - i) * step;
  return {
    animationDelay: `calc(var(--orbit-duration) * -${trail})`,
    "--bead-scale": (1 - 0.45 * t).toFixed(3), // gentle width taper → a line, not a wedge
    opacity: Math.pow(1 - t, 1.5).toFixed(3), // smooth fade to nothing at the tail tip
  };
};
</script>

<style scoped>
.perimeter-progress {
  --orbit-duration: 3.8s;
  --bead-size: 6px;
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Sit above the region content (dashboard-main is z-index:101) so the comet
     rides on top of the panels' edges rather than hiding behind them. */
  z-index: 150;
  opacity: 0;
  transition: opacity 0.45s ease;
}

.perimeter-progress.is-active {
  opacity: 1;
}

.perimeter-progress__bead {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--bead-size);
  height: var(--bead-size);
  border-radius: 50%;
  background: var(--focus);
  /* Same neon vocabulary as the focus glow: a bright core, a tight halo, then
     a soft outer bloom. Overlapping beads fuse the cores into a solid bright
     line and the blooms into one continuous halo — reading as the focus light,
     drawn into a streak. */
  box-shadow:
    0 0 4px 0 var(--focus),
    0 0 12px 1px var(--focus-edge),
    0 0 24px 4px var(--focus-glow);
  /* The element's centre (offset-anchor: auto) rides the border box of the
     containing block — i.e. the perimeter of the framed content area. */
  offset-path: border-box;
  offset-rotate: 0deg;
  offset-distance: 0%;
  transform: scale(var(--bead-scale, 1));
  animation: perimeter-orbit var(--orbit-duration) linear infinite;
}

@keyframes perimeter-orbit {
  to {
    offset-distance: 100%;
  }
}

/* Respect reduced motion: no travelling light. Fall back to a slow, quiet
   pulse of the head bead resting in the top-left corner so there's still a
   sign of life without motion sickness. */
@media (prefers-reduced-motion: reduce) {
  .perimeter-progress__bead {
    animation: none;
    offset-distance: 0%;
  }
  .perimeter-progress__bead:not(:first-child) {
    display: none;
  }
  .perimeter-progress.is-active .perimeter-progress__bead {
    animation: perimeter-pulse 2.4s ease-in-out infinite;
  }
}

@keyframes perimeter-pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
