<template>
  <div class="dashboard-region" :class="containerClass" @click="emit('focus-region', region.id)">
    <template v-if="region.split">
      <DashboardRegion
        v-for="sub in region.split.regions"
        :key="sub.id"
        class="dashboard-subregion"
        :class="{ 'dashboard-subregion--lit': subtreeContainsActive(sub) }"
        :style="getSubStyle(sub)"
        :region="sub"
        :photo-rotation-interval="photoRotationInterval"
        :parent-direction="splitDirection"
        :active-region-id="activeRegionId"
        :light-active="lightActive"
        :dim-others="dimOthers"
        @focus-region="emit('focus-region', $event)"
      />
    </template>
    <template v-else>
      <CalendarView
        v-if="region.kind === 'calendar'"
        :source-ids="region.instanceIds || []"
        :view="region.view"
        :region-id="region.id"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
      <PhotoSlideshow
        v-else-if="region.kind === 'photos'"
        :is-fullscreen="false"
        :auto-rotate="true"
        :rotation-interval="photoRotationInterval * 1000"
        :source-ids="region.instanceIds || []"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
      <WebServiceViewer
        v-else-if="region.kind === 'service'"
        :is-fullscreen="false"
        :service-id="region.instanceIds?.[0] || region.serviceId"
        :region-id="region.id"
        :view="region.view"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from "vue";
import { getSplitDirection } from "@/utils/layout";

const props = defineProps({
  region: {
    type: Object,
    required: true,
  },
  photoRotationInterval: {
    type: Number,
    required: true,
  },
  parentDirection: {
    type: String,
    default: "row",
  },
  activeRegionId: {
    type: String,
    default: null,
  },
  lightActive: {
    type: Boolean,
    default: false,
  },
  dimOthers: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["focus-region"]);

const isFocused = leafId => props.lightActive && leafId === props.activeRegionId;
const isDim = leafId => props.lightActive && props.dimOthers && leafId !== props.activeRegionId;

const subtreeContainsActive = node => {
  if (!props.lightActive || !props.activeRegionId) return false;
  if (!node.split) return node.id === props.activeRegionId;
  return node.split.regions.some(subtreeContainsActive);
};

const CalendarView = defineAsyncComponent(() => import("./CalendarView.vue"));
const PhotoSlideshow = defineAsyncComponent(() => import("./PhotoSlideshow.vue"));
const WebServiceViewer = defineAsyncComponent(() => import("./WebServiceViewer.vue"));

const splitDirection = computed(() =>
  props.region.split ? getSplitDirection(props.region.split, props.parentDirection) : null
);

const containerClass = computed(() =>
  splitDirection.value ? `dashboard-region-split-${splitDirection.value}` : null
);

const getSubStyle = sub => {
  const size = `${sub.size}%`;
  return splitDirection.value === "column"
    ? { height: size, width: "100%" }
    : { width: size, height: "100%" };
};
</script>

<style scoped>
.dashboard-region {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dashboard-region-split-row {
  flex-direction: row;
}

.dashboard-region-split-column {
  flex-direction: column;
}

.dashboard-subregion {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Default stacking context so the focused sibling can be raised above its
     neighbours — otherwise a later sub-region paints over its glow. */
  position: relative;
  z-index: 0;
}
/* Raise the focused sub-region so its neon glow blooms over adjacent sub-regions
   instead of being clipped by a later-painted sibling (mirrors the section --lit
   treatment for top-level regions). */
.dashboard-subregion--lit {
  z-index: 3;
}
</style>
