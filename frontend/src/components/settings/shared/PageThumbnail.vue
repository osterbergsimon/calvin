<!-- frontend/src/components/settings/shared/PageThumbnail.vue -->
<template>
  <div
    class="page-thumb"
    :class="[`page-thumb--${size}`, `is-${orientation}`]"
    :data-orientation="orientation"
    :data-test="dataTest"
    :aria-label="ariaLabel || undefined"
    aria-hidden="false"
  >
    <div class="page-thumb__regions" :class="`dir-${direction}`">
      <span
        v-for="region in regions"
        :key="region.id"
        class="page-thumb__region"
        :class="{ 'is-split': Boolean(region.split) }"
        :style="{ flexGrow: region.size || 1 }"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { getLayoutDirection } from "@/utils/layout";

// A page drawn as its region boxes, in the orientation of the screen that
// shows it (screens-and-kiosks setup §3.2). No live content: the editor's
// region shapes at thumbnail size.
const props = defineProps({
  // A dashboard page from normalizeDashboardScreens().screens.
  page: { type: Object, default: null },
  orientation: { type: String, default: "landscape" },
  // card / page = 96px on the long edge; live = 160px.
  size: { type: String, default: "card" },
  dataTest: { type: String, default: "page-thumbnail" },
  ariaLabel: { type: String, default: "" },
});

const regions = computed(() => {
  const list = props.page?.layout?.regions;
  if (Array.isArray(list) && list.length) return list;
  return [{ id: "placeholder", size: 100 }];
});

const direction = computed(() =>
  props.page?.layout ? getLayoutDirection(props.page.layout, props.orientation) : "row"
);
</script>

<style scoped>
.page-thumb {
  display: flex;
  flex: none;
  box-sizing: border-box;
  padding: 3px;
  border: 1.5px solid var(--ink-2);
  border-radius: 5px;
  background: var(--bg-0);
}
.page-thumb__regions {
  display: flex;
  flex: 1 1 auto;
  gap: 3px;
  min-width: 0;
  min-height: 0;
}
.page-thumb__regions.dir-column {
  flex-direction: column;
}
.page-thumb__region {
  flex-basis: 0;
  min-width: 0;
  min-height: 0;
  border-radius: 2px;
  background: color-mix(in srgb, var(--focus) 22%, var(--bg-1));
}
.page-thumb__region.is-split {
  background: color-mix(in srgb, var(--ink-3) 25%, var(--bg-1));
}
/* 96px on the long edge for cards and page rows. */
.page-thumb--card.is-landscape,
.page-thumb--page.is-landscape {
  width: 96px;
  height: 54px;
}
.page-thumb--card.is-portrait,
.page-thumb--page.is-portrait {
  width: 54px;
  height: 96px;
}
/* The live preview beside the Display rows. */
.page-thumb--live.is-landscape {
  width: 160px;
  height: 90px;
}
.page-thumb--live.is-portrait {
  width: 90px;
  height: 160px;
}
</style>
