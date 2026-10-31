<template>
  <div class="where-shows" data-test="where-shows">
    <h4 class="where-shows__title">Where {{ title }} show</h4>
    <template v-if="lines.length">
      <button
        v-for="line in lines"
        :key="line.regionId"
        type="button"
        class="where-shows__row"
        data-test="where-shows-row"
        @click="openLine(line)"
      >
        <span class="where-shows__where">{{ line.pageName }} · {{ line.regionLabel }}</span>
        <span class="where-shows__look">
          {{ line.summary }}
          <template v-if="line.sourceNames.length"> · {{ line.sourceNames.join(", ") }}</template>
        </span>
      </button>
    </template>
    <p v-else class="where-shows__empty">
      Not on any page yet.
      <button type="button" class="where-shows__place" data-test="where-shows-place" @click="place">
        Put it on a page
      </button>
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useRegionEditorRequest } from "@/composables/useRegionEditorRequest";
import { usePlacementRequest } from "@/composables/usePlacementRequest";
import { whereItShows } from "@/utils/whereItShows";

const props = defineProps({
  // 'calendar' | 'photos' | 'service'
  kind: { type: String, required: true },
  // Plural noun for the heading: "calendars" → "Where calendars show".
  title: { type: String, required: true },
  config: { type: Object, default: () => ({}) },
  // { id, name } of this kind's sources, for the region's source filter.
  sources: { type: Array, default: () => [] },
});

const router = useRouter();
const { openRegion } = useRegionEditorRequest();
const { requestPlacement } = usePlacementRequest();

const lines = computed(() => whereItShows(props.config, props.kind, props.sources));

const openEditor = () =>
  router?.replace({ path: "/settings", query: { setting: "dashboard-regions" } });

const openLine = line => {
  openRegion(line.pageId, line.regionId);
  openEditor();
};

// Place mode fills a chosen region with this kind (content & plugins §3.6).
const place = () => {
  requestPlacement({ id: props.kind, name: props.title, kind: props.kind });
  openEditor();
};
</script>

<style scoped>
.where-shows {
  padding: var(--panel-pad-y) var(--panel-pad-x);
  border-top: 1px solid var(--line-soft);
}
.where-shows__title {
  margin: 0 0 var(--space-sm);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}
.where-shows__row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  width: 100%;
  min-height: 44px;
  padding: var(--space-sm) 0;
  border: 0;
  border-top: 1px solid var(--line-soft);
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.where-shows__row:hover .where-shows__where,
.where-shows__row:focus-visible .where-shows__where {
  color: var(--focus-text);
}
.where-shows__row:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.where-shows__where {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 550;
}
.where-shows__look {
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
.where-shows__empty {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.where-shows__place {
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 0;
  background: transparent;
  color: var(--focus-text);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}
.where-shows__place:hover {
  text-decoration: underline;
}
.where-shows__place:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
