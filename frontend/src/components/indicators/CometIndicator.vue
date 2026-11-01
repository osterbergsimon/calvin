<template>
  <div
    class="loading-indicator comet"
    :class="[`loading-indicator--${frameKind}`, { 'is-active': active }]"
    aria-hidden="true"
  >
    <span v-for="i in beadCount" :key="i" class="comet__bead" :style="beadStyle(i)" />
  </div>
</template>

<script setup>
import { computed } from "vue";

/**
 * Comet loading indicator: a train of focus-light beads orbiting the frame's
 * border box. On the app frame it rides the clock bar's seam where one exists;
 * on a region frame it follows the panel's focus-glow path, on top of the glow
 * when the region is focused. Decorative only.
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

// A dense train of beads packed close enough that their glows fuse into one
// continuous line: a bright leading edge with a soft tail streaming out behind.
const beadCount = 22;
const step = 0.0028; // spacing between beads, as a fraction of the loop

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
  /* Same neon vocabulary as the focus glow: bright core, tight halo, soft
     bloom. Overlapping beads fuse into one bright line with one halo. */
  box-shadow:
    0 0 4px 0 var(--focus),
    0 0 12px 1px var(--focus-edge),
    0 0 24px 4px var(--focus-glow);
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

/* A region frame follows the panel radius, like its focus glow. */
.loading-indicator--region {
  border-radius: var(--radius-frame);
}
.loading-indicator--region .comet__bead {
  offset-path: inset(0 round var(--radius-frame));
}

@keyframes comet-orbit {
  to {
    offset-distance: 100%;
  }
}
</style>
