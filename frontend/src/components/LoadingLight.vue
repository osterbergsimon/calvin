<template>
  <component
    :is="indicator"
    v-if="indicator"
    :active="active"
    :frame="frame"
    :reduced-motion="reducedMotion"
    :data-loading-light="styleName"
    :class="{ 'loading-light--viewport': viewport }"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import Comet from "./indicators/Comet.vue";
import Pulse from "./indicators/Pulse.vue";
import { APP_FRAME, LOADING_LIGHT_STYLES, useProgressStore } from "../stores/progress";
import { useScreenSetting } from "../composables/useScreenSetting";

/**
 * Engine-facing side of the loading light (CLV-115): reads the progress store
 * for one frame and mounts the style this screen picked. Indicators only draw;
 * the store owns the timing, so every style behaves the same way.
 */
const props = defineProps({
  // Region whose frame this light belongs to; null = the app frame.
  regionId: { type: String, default: null },
  // Fixed to the viewport instead of the nearest positioned ancestor (the
  // Reload UI light on views without a dashboard stage).
  viewport: { type: Boolean, default: false },
});

const progress = useProgressStore();
const setting = useScreenSetting("loadingLight");

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const mediaQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
const reducedMotion = ref(Boolean(mediaQuery?.matches));
const onMotionChange = event => {
  reducedMotion.value = Boolean(event.matches);
};
mediaQuery?.addEventListener?.("change", onMotionChange);
onBeforeUnmount(() => mediaQuery?.removeEventListener?.("change", onMotionChange));

const frame = computed(() => (props.regionId ? "region" : APP_FRAME));
const active = computed(() => progress.isFrameVisible(props.regionId || APP_FRAME));

const styleName = computed(() => {
  const picked = setting.value.value;
  const chosen = LOADING_LIGHT_STYLES.includes(picked) ? picked : "comet";
  // Off stays off; any moving style becomes the pulse when the device asks
  // for less motion.
  if (chosen === "off") return "off";
  return reducedMotion.value ? "pulse" : chosen;
});

const indicator = computed(() => {
  if (styleName.value === "comet") return Comet;
  if (styleName.value === "pulse") return Pulse;
  return null;
});
</script>

<style scoped>
.loading-indicator.loading-light--viewport {
  position: fixed;
}
</style>
