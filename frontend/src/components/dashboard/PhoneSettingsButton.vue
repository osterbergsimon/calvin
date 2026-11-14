<template>
  <Button
    class="phone-settings-button"
    :class="floating ? `phone-settings-button--floating phone-settings-button--${corner}` : ''"
    :variant="floating ? 'secondary' : 'ghost'"
    :size="floating ? 'sm' : 'md'"
    :icon="mdiCogOutline"
    :icon-only="!floating"
    :label="floating ? '' : 'Settings'"
    data-test="phone-settings-button"
    @click="openSettings"
  >
    <template v-if="floating">Settings</template>
  </Button>
</template>

<script setup>
import { computed } from "vue";
import { mdiCogOutline } from "@mdi/js";
import { useRouter } from "vue-router";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";
import { normalizeHotCornerPosition } from "../../utils/hotCorner";
import Button from "../ui/Button.vue";

// The way into Settings on a phone. A phone is the setup device we point
// people to, so Settings is its own button instead of the first item of the
// ⋯ menu, and it stays when the screen's controls are hidden: "Hide controls"
// is for a calm wall display, not for the phone that sets it up. In the clock
// bar it takes the ⋯ menu's place, as the gear alone (named "Settings"): at
// 390 px the bar has no room for the word beside weather tiles and an offline
// pill. Floating, it has.
defineProps({
  // No clock bar to sit in (turned off, or hidden with the controls): float in
  // a bottom corner, in thumb reach, away from the hot corner.
  floating: { type: Boolean, default: false },
});

const router = useRouter();
const modeStore = useModeStore();
const configStore = useConfigStore();

const corner = computed(() =>
  normalizeHotCornerPosition(configStore.hotCornerPosition) === "bottom-right"
    ? "bottom-left"
    : "bottom-right"
);

const openSettings = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push("/settings");
};
</script>

<style scoped>
.phone-settings-button--floating {
  position: fixed;
  bottom: calc(var(--gap-4) + env(safe-area-inset-bottom, 0px));
  z-index: var(--z-sticky);
  box-shadow: var(--elev-1);
}

.phone-settings-button--bottom-right {
  right: calc(var(--gap-4) + env(safe-area-inset-right, 0px));
}

.phone-settings-button--bottom-left {
  left: calc(var(--gap-4) + env(safe-area-inset-left, 0px));
}
</style>
