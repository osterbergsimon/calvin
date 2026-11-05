<template>
  <div class="clock-bar-mini" data-test="clock-bar-mini">
    <ClockBarHorizontal
      position="top"
      :show-in-non-kiosk="true"
      :show-in-kiosk="false"
      :enabled="true"
      :sample="true"
    />
  </div>
</template>

<script setup>
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";

// The live thumbnail in Dashboard › Clock bar (§5): the real bar, drawn with
// sample room/dots/status values so an empty browser preview still shows what
// the design will look like.
defineOptions({ name: "ClockBarMiniPreview" });
</script>

<style scoped>
.clock-bar-mini {
  padding: var(--panel-pad-y) var(--panel-pad-x);
  background: var(--bg-2);
  border-bottom: 1px solid var(--line-soft);
}
</style>
