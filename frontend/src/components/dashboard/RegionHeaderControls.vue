<template>
  <div class="region-header-controls" :style="chromeStyle">
    <slot />
  </div>
</template>

<script setup>
// One control rail for every dashboard region header (calendar, photos and
// services). It applies the same region-chrome scale Dashboard.vue puts on the
// dashboard root, then exposes the control geometry as custom properties so
// every ui/ control in the row snaps to one height, radius and type size.
//
// The inline copy of regionChromeVars() keeps the set self-contained (and works
// in fullscreen, where the dashboard root's inline vars are absent) while still
// reading the one scale module. Height is the chrome rail; a coarse pointer
// raises it to the touch target, never lowers it.
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { regionChromeVars } from "@/styles/regionChromeScale";

const configStore = useConfigStore();

const chromeStyle = computed(() => ({
  ...regionChromeVars(configStore.touchControlSize),
  // IconButton size="custom" reads these; reference the shared rail so the
  // coarse-pointer minimum below also applies to the icon box.
  "--icon-size": "var(--region-control-h)",
  "--icon-font": "var(--region-glyph-fs, var(--text-body))",
}));
</script>

<style scoped>
.region-header-controls {
  /* One row when it fits; a narrow region wraps into balanced centre-aligned
     rows instead of squeezing the pill under its neighbours (calvin-8nad
     review 3). The container is shrink-to-fit, so this only affects wraps. */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--gap-1);
  min-width: 0;
  max-width: 100%;

  --region-control-h: var(--region-rail-h, var(--control-height));
  --region-control-fs: var(--region-content-fs, var(--text-body));
  --region-control-radius: var(--radius-control);

  /* ui/Button size="custom" */
  --btn-height: var(--region-control-h);
  --btn-font: var(--region-control-fs);

  /* ui/SegmentedControl */
  /* The track takes the rail height; its segments stretch to the content box.
     Their corners nest at the track radius minus its 1px border. */
  --seg-height: var(--region-control-h);
  --seg-font: var(--region-control-fs);
  --seg-radius: var(--region-control-radius);
  --seg-padding: 0;
  --seg-btn-min-height: 0;
  --seg-btn-padding: 0 var(--gap-3);
  --seg-btn-radius: calc(var(--region-control-radius) - 1px);

  /* ui/SelectPill */
  --pill-height: var(--region-control-h);
  --pill-font: var(--region-control-fs);
  --pill-radius: var(--region-control-radius);
}

/* Touch screens: never below the touch target, as the old header's coarse
   pointer block guaranteed. Fine pointers keep the chosen Dashboard size. */
@media (any-pointer: coarse) {
  .region-header-controls {
    --region-control-h: max(var(--region-rail-h, var(--control-height)), var(--touch-target));
  }
}
</style>
