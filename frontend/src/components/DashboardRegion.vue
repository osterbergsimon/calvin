<template>
  <div class="dashboard-region" :class="containerClass">
    <template v-if="region.split">
      <div
        v-for="sub in region.split.regions"
        :key="sub.id"
        class="dashboard-subregion"
        :class="{ 'dashboard-subregion-active': sub.id === activeRegionId }"
        :style="getSubStyle(sub)"
      >
        <CalendarView v-if="sub.kind === 'calendar'" :source-ids="sub.instanceIds || []" />
        <PhotoSlideshow
          v-else-if="sub.kind === 'photos'"
          :is-fullscreen="false"
          :auto-rotate="true"
          :rotation-interval="photoRotationInterval * 1000"
          :source-ids="sub.instanceIds || []"
        />
        <WebServiceViewer
          v-else-if="sub.kind === 'service'"
          :is-fullscreen="false"
          :service-id="sub.instanceIds?.[0] || sub.serviceId"
        />
      </div>
    </template>
    <template v-else>
      <CalendarView v-if="region.kind === 'calendar'" :source-ids="region.instanceIds || []" />
      <PhotoSlideshow
        v-else-if="region.kind === 'photos'"
        :is-fullscreen="false"
        :auto-rotate="true"
        :rotation-interval="photoRotationInterval * 1000"
        :source-ids="region.instanceIds || []"
      />
      <WebServiceViewer
        v-else-if="region.kind === 'service'"
        :is-fullscreen="false"
        :service-id="region.instanceIds?.[0] || region.serviceId"
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
});

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
  outline: 2px solid transparent;
  outline-offset: -2px;
  transition: outline-color 0.6s ease;
}

.dashboard-subregion-active {
  outline-color: var(--accent-primary);
}
</style>
