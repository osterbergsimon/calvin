<template>
  <div :class="['layout-manager', `layout-${orientation}`, { flipped: isFlipped }]">
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();

const orientation = computed(() => configStore.orientation);
const isFlipped = computed(() => configStore.orientationFlipped);
</script>

<style scoped>
.layout-manager {
  width: 100%;
  height: calc(100vh - var(--pairing-strip-h, 0px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-manager.flipped {
  transform: rotate(180deg);
}
</style>
