<template>
  <div class="ins">
    <div class="ins-mode">
      <h3 class="ins-title">Region</h3>
      <span class="ins-sub">· in {{ screen.name }}</span>
    </div>

    <template v-if="region.split">
      <SettingGroup title="Split region">
        <SettingRow label="Sub-region direction" stacked>
          <SegmentedControl
            :model-value="splitDir"
            :options="[
              { value: 'row', label: 'Side-by-side' },
              { value: 'column', label: 'Stacked' },
            ]"
            aria-label="Sub-region direction"
            @update:model-value="$emit('toggle-sub-direction')"
          />
        </SettingRow>
        <div v-if="canAddSub" class="ins-actions">
          <Button size="sm" :icon="mdiPlus" @click="$emit('add-sub')">{{ addSubLabel }}</Button>
        </div>
        <div class="ins-note">
          <InlineNote>
            This region is split into sub-regions. Select a sub-region to set its content.
          </InlineNote>
        </div>
      </SettingGroup>
    </template>

    <template v-else>
      <SettingGroup title="Shows">
        <SettingRow label="Component" stacked>
          <div class="picker">
            <Button
              class="picker-trigger"
              variant="secondary"
              :icon="kindIcon"
              :aria-expanded="pickerOpen"
              @click="pickerOpen = !pickerOpen"
            >
              {{ componentLabel }}
              <span class="picker-caret" aria-hidden="true">▾</span>
            </Button>
            <Card v-if="pickerOpen" class="picker-menu">
              <TextField
                v-model="search"
                class="picker-search"
                label="Filter components"
                type="search"
                hide-label
                placeholder="Filter components"
              />
              <Button
                v-for="opt in filtered"
                :key="opt.value"
                variant="ghost"
                size="sm"
                class="picker-option"
                @click="choose(opt)"
              >
                <span class="picker-option-label">{{ opt.label }}</span>
                <span
                  v-if="opt.pluginName && opt.pluginName !== opt.label"
                  class="picker-option-type"
                >
                  {{ opt.pluginName }}
                </span>
              </Button>
              <InlineNote v-if="filtered.length === 0">No matches</InlineNote>
              <!-- F4: with no services yet the menu only offers Calendar/Photos;
                   say where web services come from instead of hiding them. -->
              <div v-if="!hasServices" class="picker-add">
                <Button
                  variant="ghost"
                  size="sm"
                  class="picker-option"
                  data-test="picker-add-service"
                  @click="addService"
                >
                  <span class="picker-option-label">＋ Add a web service…</span>
                  <span class="picker-option-type">
                    Web pages and dashboards, from Content › Web pages &amp; services
                  </span>
                </Button>
              </div>
            </Card>
          </div>
        </SettingRow>

        <SettingRow v-if="sourceOptions.length" label="Sources" stacked>
          <ChipMultiSelect
            :model-value="sourceSelection"
            :options="sourceChipOptions"
            aria-label="Sources"
            @update:model-value="onSourcesChange"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup v-if="region.kind === 'calendar'" title="Calendar">
        <SettingRow label="View" stacked>
          <SegmentedControl
            :model-value="region.view?.mode || 'month'"
            :options="[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]"
            aria-label="Calendar view"
            @update:model-value="v => $emit('patch-view', { mode: v })"
          />
        </SettingRow>
        <SettingRow
          label="Rolling window"
          description="Start from today instead of the calendar month"
        >
          <ToggleSwitch
            :model-value="region.view?.rolling === true"
            aria-label="Rolling window"
            @update:model-value="v => $emit('patch-view', { rolling: v })"
          />
        </SettingRow>
        <SettingRow v-if="region.view?.rolling" label="Weeks ahead">
          <NumberStepper
            :model-value="region.view?.weeks ?? 4"
            :min="1"
            :max="12"
            aria-label="Weeks ahead"
            @update:model-value="v => $emit('patch-view', { weeks: v })"
          />
        </SettingRow>
        <SettingRow label="Week numbers" description="Show the week number beside each week">
          <ToggleSwitch
            :model-value="region.view?.weekNumbers === true"
            aria-label="Week numbers"
            @update:model-value="v => $emit('patch-view', { weekNumbers: v })"
          />
        </SettingRow>
        <SettingRow label="Events per day">
          <SelectPill
            :model-value="eventDensityModel"
            :options="eventDensityOptions"
            aria-label="Events per day"
            @update:model-value="setEventDensity"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup v-else-if="region.kind === 'photos'" title="Photos">
        <SettingRow label="Fit photos">
          <SelectPill
            :model-value="photoFitModel"
            :options="photoFitOptions"
            aria-label="Fit photos"
            @update:model-value="v => $emit('patch-view', { fit: v })"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup v-else-if="region.kind === 'service'" title="Service">
        <SettingRow label="When tapped" stacked>
          <SegmentedControl
            :model-value="region.view?.linkAction || 'handoff'"
            :options="[
              { value: 'handoff', label: 'Handoff' },
              { value: 'embed', label: 'Embed' },
              { value: 'off', label: 'Off' },
            ]"
            aria-label="Service link action"
            @update:model-value="v => $emit('patch-view', { linkAction: v })"
          />
        </SettingRow>
      </SettingGroup>
    </template>

    <SettingGroup v-if="isSub" title="Split">
      <SettingRow label="Sub-region direction" stacked>
        <SegmentedControl
          :model-value="splitDir"
          :options="[
            { value: 'row', label: 'Side-by-side' },
            { value: 'column', label: 'Stacked' },
          ]"
          aria-label="Sub-region direction"
          @update:model-value="$emit('toggle-sub-direction')"
        />
      </SettingRow>
      <div v-if="canAddSub" class="ins-actions">
        <Button size="sm" :icon="mdiPlus" @click="$emit('add-sub')">{{ addSubLabel }}</Button>
      </div>
      <div class="ins-note">
        <InlineNote>
          This region is one cell of a split. Add more to build rows and columns.
        </InlineNote>
      </div>
    </SettingGroup>

    <SettingGroup title="Arrange">
      <div class="ins-note">
        <InlineNote>
          Size <strong>{{ region.size }}%</strong> — drag the divider in the preview to resize.
        </InlineNote>
      </div>
      <div class="ins-actions">
        <Button v-if="splittable || region.split" size="sm" @click="$emit('toggle-split')">
          {{ region.split ? "Unsplit" : "Split region" }}
        </Button>
        <Button variant="danger" size="sm" :disabled="!canRemove" @click="$emit('remove')">
          Remove region
        </Button>
      </div>
      <div class="ins-actions ins-actions--back">
        <Button variant="link" size="sm" :icon="mdiChevronLeft" @click="$emit('deselect')">
          Back to page settings
        </Button>
      </div>
    </SettingGroup>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { mdiCalendarBlankOutline, mdiChevronLeft, mdiImageOutline, mdiPlus, mdiWeb } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { filterComponentOptions } from "@/utils/componentPicker";

const props = defineProps({
  region: { type: Object, required: true },
  screen: { type: Object, required: true },
  layoutDir: { type: String, required: true },
  componentOptions: { type: Array, default: () => [] },
  sourceOptions: { type: Array, default: () => [] },
  context: { type: Object, default: null },
});
const emit = defineEmits([
  "patch-view",
  "set-component",
  "toggle-source",
  "clear-sources",
  "toggle-split",
  "toggle-sub-direction",
  "add-sub",
  "remove",
  "deselect",
]);

const router = useRouter();
const pickerOpen = ref(false);
const search = ref("");
const hasServices = computed(() => props.componentOptions.some(o => o.kind === "service"));
// Leaves the region editor for the Service plugins tab (Settings re-routes on ?setting=).
const addService = () => {
  pickerOpen.value = false;
  router?.replace({ path: "/settings", query: { setting: "plugins-services" } });
};
const filtered = computed(() => filterComponentOptions(props.componentOptions, search.value));
const choose = opt => {
  emit("set-component", opt);
  pickerOpen.value = false;
  search.value = "";
};

const kindIcon = computed(() =>
  props.region.kind === "calendar"
    ? mdiCalendarBlankOutline
    : props.region.kind === "photos"
      ? mdiImageOutline
      : mdiWeb
);
const componentLabel = computed(() => {
  if (props.region.kind === "calendar") return "Calendar";
  if (props.region.kind === "photos") return "Photos";
  const opt = props.componentOptions.find(
    o => o.instanceIds?.[0] === props.region.instanceIds?.[0]
  );
  return opt?.label || "Service";
});

/* --- sources -------------------------------------------------------------
 * An empty `instanceIds` means "all sources"; an explicit list means only
 * those. The chip group mirrors that: the All sources chip is selected while
 * the list is empty. Every interaction still emits at most one toggle, because
 * each update rebuilds the layout from the current config. */
const ALL_SOURCES = "__all__";
const sourceSelection = computed(() =>
  (props.region.instanceIds || []).length ? props.region.instanceIds : [ALL_SOURCES]
);
const sourceChipOptions = computed(() => [
  { value: ALL_SOURCES, label: "All sources" },
  ...props.sourceOptions.map(source => ({ value: source.id, label: source.name })),
]);
const onSourcesChange = next => {
  const currentIds = props.region.instanceIds || [];
  const currentAll = currentIds.length === 0;
  const nextAll = next.includes(ALL_SOURCES);
  if (currentAll) {
    if (!nextAll) {
      // Deselecting All sources keeps the shared default (all sources).
      emit("clear-sources");
      return;
    }
    const picked = next.filter(value => value !== ALL_SOURCES);
    // Picking a specific source while All is on narrows to that source.
    picked.forEach(id => emit("toggle-source", id, true));
    return;
  }
  if (nextAll) {
    emit("clear-sources");
    return;
  }
  const nextIds = next.filter(value => value !== ALL_SOURCES);
  for (const source of props.sourceOptions) {
    const was = currentIds.includes(source.id);
    const now = nextIds.includes(source.id);
    if (was !== now) emit("toggle-source", source.id, now);
  }
};

// Context-driven computed properties — provided by ScreenRegionEditor via the
// `context` prop so this component no longer needs to walk the tree itself.
const isSub = computed(() => props.context?.isSub ?? false);
const splitDir = computed(() => props.context?.splitDir ?? props.layoutDir);
const canAddSub = computed(() => props.context?.canAddSub ?? false);
const addSubLabel = computed(() => (splitDir.value === "column" ? "＋ Add row" : "＋ Add column"));

const splittable = computed(() => props.context?.canSplit ?? false);
const canRemove = computed(() => {
  const isTop = props.screen.layout.regions.some(r => r.id === props.region.id);
  if (isTop) return props.screen.layout.regions.length > 1;
  return true; // sub-regions are always removable (min enforced by helper)
});

// --- Per-region display settings (CLV-49) ----------------------------------
// Events per day: an explicit count, or Auto (the day cell's measured height
// decides). Auto is persisted as absent / null, so a new region needs no setup.
const EVENT_DENSITY_VALUES = [1, 2, 3, 4, 6, 8];
const eventDensityOptions = [
  { value: "auto", label: "Auto" },
  ...EVENT_DENSITY_VALUES.map(value => ({ value, label: String(value) })),
];
const eventDensityModel = computed(() => {
  const value = Number(props.region.view?.maxVisibleEvents);
  return Number.isFinite(value) ? value : "auto";
});
const setEventDensity = value => {
  emit("patch-view", {
    maxVisibleEvents: value === "auto" ? undefined : Number(value),
  });
};

// Fit photos: Smart is the default (absent). Crop was the same as Fill and is
// gone from the options.
const photoFitOptions = [
  { value: "smart", label: "Smart" },
  { value: "fit", label: "Whole photo" },
  { value: "fill", label: "Fill" },
  { value: "center", label: "Centre" },
];
const photoFitModel = computed(() => props.region.view?.fit || "smart");
</script>

<style scoped>
.ins-mode {
  display: flex;
  align-items: baseline;
  gap: var(--gap-1);
  padding: var(--gap-4) var(--panel-pad-x) 0;
  margin-bottom: var(--gap-3);
}
.ins-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  color: var(--ink);
}
.ins-sub {
  font-size: var(--text-meta);
  color: var(--ink-3);
}
.picker {
  position: relative;
  width: 100%;
}
.picker-trigger {
  width: 100%;
  justify-content: flex-start;
}
.picker-caret {
  margin-left: var(--gap-2);
  color: var(--ink-3);
}
.picker-menu {
  position: absolute;
  top: calc(100% + var(--gap-1));
  left: 0;
  right: 0;
  z-index: var(--z-raised);
  max-height: 260px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
}
.picker-search {
  margin-bottom: var(--gap-1);
}
.picker-option {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}
.picker-option :deep(.btn__label) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--gap-tight);
}
.picker-option-type {
  font-size: var(--text-caption);
  color: var(--ink-3);
}
.picker-add {
  padding-top: var(--gap-1);
  border-top: 1px solid var(--line-soft);
}
.ins-note {
  padding: 0 var(--panel-pad-x) var(--gap-3);
}
.ins-note strong {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
.ins-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2);
  padding: var(--panel-pad-y) var(--panel-pad-x);
}
.ins-actions--back {
  padding-top: 0;
  padding-bottom: var(--gap-5);
}
</style>
