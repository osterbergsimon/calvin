<template>
  <div class="where-shows" data-test="where-shows">
    <SettingGroup :title="`Where ${title} show`">
      <div class="where-shows__body">
        <template v-if="lines.length">
          <Button
            v-for="line in lines"
            :key="line.regionId"
            variant="ghost"
            class="where-shows__row"
            data-test="where-shows-row"
            @click="openLine(line)"
          >
            <span class="where-shows__lines">
              <span class="where-shows__where">{{ line.pageName }} · {{ line.regionLabel }}</span>
              <span class="where-shows__look">{{ lookLabel(line) }}</span>
            </span>
          </Button>
        </template>
        <InlineNote v-else>
          Not on any page yet.
          <template #action>
            <Button variant="link" data-test="where-shows-place" @click="place">
              Put it on a page
            </Button>
          </template>
        </InlineNote>
      </div>
    </SettingGroup>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
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

const lookLabel = line => [line.summary, line.sourceNames.join(", ")].filter(Boolean).join(" · ");

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
  padding-bottom: var(--panel-pad-y);
  border-top: 1px solid var(--line-soft);
}

.where-shows__body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-tight);
  padding: var(--gap-2) var(--panel-pad-x) 0;
}

.where-shows__row {
  width: 100%;
  justify-content: flex-start;
  padding-inline: 0;
  text-align: left;
}

.where-shows__lines {
  display: flex;
  flex-direction: column;
  gap: var(--gap-tight);
  min-width: 0;
}

.where-shows__where {
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.where-shows__look {
  font-size: var(--text-meta);
  color: var(--ink-2);
}
</style>
