<template>
  <div
    class="loading-indicator comet"
    :class="[`loading-indicator--${frameKind}`, { 'is-active': active }]"
    aria-hidden="true"
  >
    <template v-if="frameKind === 'app'">
      <span v-for="i in beadCount" :key="i" class="comet__bead" :style="beadStyle(i)" />
    </template>
    <!-- Region frames get a static edge: an offset-path animation on every
         region frame repainted each region during loads (calvin-c3jz). -->
    <span v-else class="comet__edge" />
  </div>
</template>

<script setup>
import { computed } from "vue";

/**
 * Comet loading indicator: a train of focus-light beads orbiting the frame's
 * border box. On the app frame it rides the clock bar's seam where one exists.
 * Region frames draw a single static edge instead: a handful of orbiting beads
 * per region was the expensive part of a page switch on the Pi.
 *
 * The container's opacity gates visibility on `active`, so revealing the
 * comet is a cheap fade with no layout churn. The orbit is paused while idle
 * (no animation work at opacity 0) and resumes from where it stopped.
 */

const props = defineProps({
  active: { type: Boolean, default: false },
  // "app" for the whole dashboard perimeter; "region" for one region's frame.
  frame: { type: String, default: "app" },
  // Accepted for the indicator contract; LoadingLight never mounts the comet
  // under reduced motion (it forces Pulse).
  reducedMotion: { type: Boolean, default: false },
});

const frameKind = computed(() => (props.frame === "app" ? "app" : "region"));

// A short train is enough to read as a comet: 22 beads each painted three
// shadow layers and dominated the loading paint cost (calvin-c3jz).
const beadCount = 8;
const step = 0.008; // spacing between beads, as a fraction of the loop

const beadStyle = index => {
  const i = index - 1; // 0 = head
  const t = i / (beadCount - 1); // 0 at the head → 1 at the tail tip

  // The head gets the most-negative delay (furthest along the loop); each
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
.loading-indicator {
  --orbit-duration: calc(var(--dur) * 19); /* 3.8s */
  --bead-size: 6px;
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-raised);
  opacity: 0;
  transition: opacity var(--dur-loading-fade) ease;
}

.loading-indicator.is-active {
  opacity: 1;
}

.comet__bead {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--bead-size);
  height: var(--bead-size);
  border-radius: 50%;
  background: var(--focus);
  /* One halo layer per bead; overlapping beads still fuse into a line. */
  box-shadow: 0 0 8px 0 var(--focus-edge);
  /* The bead's centre rides the border box of the containing block: the
     perimeter of the framed area. */
  offset-path: border-box;
  offset-rotate: 0deg;
  offset-distance: 0%;
  transform: scale(var(--bead-scale, 1));
  animation: comet-orbit var(--orbit-duration) linear infinite;
  /* Idle: no animation work while nothing loads (a kiosk idles for weeks). */
  animation-play-state: paused;
}

.loading-indicator.is-active .comet__bead {
  animation-play-state: running;
}

/* A region frame follows the panel radius, like its focus glow. It draws one
   static edge instead of an orbiting bead train (calvin-c3jz). */
.loading-indicator--region {
  border-radius: var(--radius-frame);
}
.comet__edge {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-frame);
  box-shadow: inset 0 0 0 2px var(--focus);
}

@keyframes comet-orbit {
  to {
    offset-distance: 100%;
  }
}
</style>
