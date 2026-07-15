<template>
  <div class="dashboard-region" @click="emit('focus-region', region.id)">
    <template v-if="region.split">
      <div
        ref="splitContainerEl"
        class="split-container"
        :class="`split-container--${splitDirection}`"
      >
        <DashboardRegion
          v-for="(sub, i) in region.split.regions"
          :key="sub.id"
          class="dashboard-subregion"
          :class="{ 'dashboard-subregion--lit': subtreeContainsActive(sub) }"
          :style="getSubStyle(sub)"
          :region="sub"
          :path="[...path, i]"
          :photo-rotation-interval="photoRotationInterval"
          :parent-direction="splitDirection"
          :active-region-id="activeRegionId"
          :light-active="lightActive"
          :dim-others="dimOthers"
          @click.stop
          @focus-region="emit('focus-region', $event)"
        />
        <!-- Drag handles between adjacent split children (when unlocked) -->
        <div
          v-for="handle in subResizeHandles"
          :key="`sub-handle-${handle.firstIndex}`"
          class="subregion-resizer"
          :class="`subregion-resizer--${splitDirection}`"
          :style="handle.style"
          role="separator"
          :aria-label="`Drag to resize sub-regions ${handle.firstIndex + 1} and ${handle.firstIndex + 2}`"
          @pointerdown.stop.prevent="
            resizeCtx.start([...path], handle.firstIndex, splitContainerEl, splitDirection)
          "
        >
          <span class="subregion-resizer__grip" aria-hidden="true" />
        </div>
      </div>
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
import { computed, defineAsyncComponent, inject, ref } from "vue";
import { getSplitDirection } from "@/utils/layout";

const props = defineProps({
  region: {
    type: Object,
    required: true,
  },
  path: {
    type: Array,
    default: () => [],
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

// Inject the resize context provided by Dashboard.vue.
// null default so DashboardRegion works standalone (e.g. in unit tests).
const resizeCtx = inject("dashboardResize", null);

// Template ref for the split container element (used as the coordinate space
// when reporting a nested drag-start to the Dashboard resize context).
const splitContainerEl = ref(null);

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

const getSubStyle = sub => {
  // During a live drag, use the override from the Dashboard resize context for
  // instant visual feedback without persisting on every pointer move.
  const rawSize = resizeCtx?.dragSizes.value?.[sub.id] ?? sub.size;
  const size = `${rawSize}%`;
  return splitDirection.value === "column"
    ? { height: size, width: "100%" }
    : { width: size, height: "100%" };
};

// Compute handle positions (cumulative %) between adjacent split children.
// Only computed when resizeCtx is available and layout is unlocked.
const subResizeHandles = computed(() => {
  if (!resizeCtx || resizeCtx.regionsLocked.value) return [];
  const subs = props.region.split?.regions;
  if (!subs || subs.length < 2) return [];
  const sizeOf = sub => Number(resizeCtx.dragSizes.value?.[sub.id] ?? sub.size) || 0;
  const handles = [];
  let cumulative = 0;
  for (let i = 0; i < subs.length - 1; i++) {
    cumulative += sizeOf(subs[i]);
    const style =
      splitDirection.value === "column" ? { top: `${cumulative}%` } : { left: `${cumulative}%` };
    handles.push({ firstIndex: i, style });
  }
  return handles;
});
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

/* Split container: fills the region and flows children in the split direction.
   Position:relative so absolute nested resize handles are anchored to it. */
.split-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row; /* overridden by modifier below */
  position: relative;
}
.split-container--row {
  flex-direction: row;
}
.split-container--column {
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

/* ── Nested drag-to-resize handles ─────────────────────────────────────────── */
.subregion-resizer {
  position: absolute;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  /* Handles are positioned absolutely (left/top %) relative to the
     split-container, which is position:relative. */
  flex-shrink: 0;
}
.subregion-resizer--row {
  top: 0;
  bottom: 0;
  width: 28px;
  transform: translateX(-50%);
  cursor: col-resize;
}
.subregion-resizer--column {
  left: 0;
  right: 0;
  height: 28px;
  transform: translateY(-50%);
  cursor: row-resize;
}
.subregion-resizer__grip {
  background: var(--focus);
  border: 1px solid var(--focus-edge);
  border-radius: 999px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 22%, transparent);
}
.subregion-resizer--row .subregion-resizer__grip {
  width: 6px;
  height: 36px;
  max-height: 60%;
}
.subregion-resizer--column .subregion-resizer__grip {
  height: 6px;
  width: 36px;
  max-width: 60%;
}
.subregion-resizer:hover .subregion-resizer__grip,
.subregion-resizer:active .subregion-resizer__grip {
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--focus) 28%, transparent);
}
</style>
