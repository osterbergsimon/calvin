<template>
  <div class="ins">
    <div v-if="!hideHeading" class="ins-mode">
      <h3 class="ins-title heading-title">{{ clockSelected ? "Clock bar" : "Page" }}</h3>
      <span class="ins-sub">{{ headingSub }}</span>
    </div>

    <div class="ins-field">
      <TextField
        data-test="page-name"
        :model-value="draftName"
        label="Page name"
        :hint="shownOn.moreThanOne ? 'Every screen that shows this page uses this name.' : ''"
        @update:model-value="draftName = $event"
        @focus="keepInView"
        @blur="commitName"
        @keydown.enter.prevent="commitName"
      />
    </div>

    <SettingRow label="Shown on" data-test="shown-on-row">
      <template #description>
        <InlineNote :tone="shownOn.tone" data-test="shown-on-summary">
          {{ shownOn.summary }}
        </InlineNote>
        <InlineNote v-if="shownOnNotice" tone="ok" data-test="shown-on-notice">
          {{ shownOnNotice }}
          <template #action>
            <Button variant="link" size="sm" data-test="also-show-on" @click="changeOpen = true">
              Also show on…
            </Button>
          </template>
        </InlineNote>
        <InlineNote v-if="shownOnError" tone="err" role="alert" data-test="shown-on-error">
          {{ shownOnError }}
        </InlineNote>
      </template>
      <Popover v-model="changeOpen" label="Screens showing this page" role="group">
        <template #trigger="{ attrs }">
          <Button v-bind="attrs" size="sm" data-test="change-shown-on">Change…</Button>
        </template>
        <div class="ins-targets" role="group" aria-label="Screens showing this page">
          <SettingRow
            v-for="target in shownOn.targets"
            :key="target.id"
            class="ins-target-row"
            :label="target.label"
            :description="target.meta"
            flush
          >
            <ToggleSwitch
              :model-value="target.shows"
              :aria-label="`Show this page on ${target.label}`"
              @update:model-value="$emit('toggle-target', target.id, $event)"
            />
          </SettingRow>
        </div>
      </Popover>
    </SettingRow>

    <SettingRow label="Layout" stacked>
      <template #label-extra>
        <Tag v-if="isCustom" class="ins-tag">Custom</Tag>
      </template>
      <SegmentedControl
        :model-value="screen.layout.preset || ''"
        :options="presets"
        aria-label="Layout"
        @update:model-value="$emit('preset', $event)"
      />
    </SettingRow>

    <SettingRow label="Region direction" stacked>
      <template #description>
        <InlineNote>
          How this page’s regions are cut — independent of the physical orientation.
        </InlineNote>
      </template>
      <SegmentedControl
        :model-value="layoutDir"
        :options="[
          { value: 'row', label: 'Side-by-side' },
          { value: 'column', label: 'Stacked' },
        ]"
        aria-label="Region direction"
        @update:model-value="$emit('toggle-direction')"
      />
    </SettingRow>

    <SettingGroup title="Clock bar">
      <SettingRow
        class="ins-toggle-row"
        label="Show clock bar"
        description="A slim time strip on this page"
      >
        <ToggleSwitch
          :model-value="clock.enabled"
          aria-label="Show clock bar"
          @update:model-value="v => $emit('clock-enabled', v)"
        />
      </SettingRow>
      <SettingRow v-if="clock.enabled" label="Position" stacked>
        <template #description>
          <InlineNote>
            Or drag the bar in the preview onto any edge or gap. With 3+ regions, each gap is listed
            so you can pick exactly where it sits.
          </InlineNote>
        </template>
        <SelectPill
          :model-value="positionValue"
          :options="positionOptions"
          aria-label="Clock bar position"
          @update:model-value="v => $emit('clock-position', v)"
        />
      </SettingRow>
      <SettingRow v-if="clock.enabled" label="Look" stacked>
        <template #description>
          <InlineNote>The parts, their order and their sizes.</InlineNote>
        </template>
        <Button size="sm" data-test="edit-clock-bar-look" @click="$emit('clock-design')">
          Edit clock bar look…
        </Button>
      </SettingRow>
      <ScopeLine
        v-if="hasOverride"
        class="ins-scope"
        overridden
        reset-test="clock-inherit"
        @reset="$emit('clock-inherit')"
      />
    </SettingGroup>

    <SettingGroup title="This page">
      <div class="ins-note">
        <InlineNote>
          Select a region in the preview to set what it shows and how big it is.
        </InlineNote>
      </div>
      <div class="ins-actions">
        <Button size="sm" :icon="mdiPlus" :disabled="atMax" @click="$emit('add-region')">
          Add region
        </Button>
        <Button size="sm" @click="$emit('duplicate')">Duplicate</Button>
        <Button v-if="hideLabel" size="sm" data-test="hide-page-btn" @click="$emit('hide')">
          {{ hideLabel }}
        </Button>
        <Button size="sm" variant="danger" :disabled="!canDelete" @click="$emit('delete')">
          Delete page
        </Button>
      </div>
    </SettingGroup>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { mdiPlus } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import Popover from "@/components/ui/Popover.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { MAX_TOP_REGIONS } from "@/utils/layout";

const props = defineProps({
  screen: { type: Object, required: true },
  layoutDir: { type: String, required: true },
  clock: { type: Object, required: true },
  clockSelected: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: true },
  // The phone sheet bar already names the selection, so it hides this heading.
  hideHeading: { type: Boolean, default: false },
  // Which targets show this page (Default and each screen), plus the summary
  // copy for the Shown on row.
  shownOn: {
    type: Object,
    default: () => ({ summary: "All screens", tone: "neutral", targets: [], moreThanOne: false }),
  },
  // "Shown on Kitchen only." after adding a page from a screen.
  shownOnNotice: { type: String, default: "" },
  shownOnError: { type: String, default: "" },
  // Empty when the page cannot be hidden from the current scope.
  hideLabel: { type: String, default: "" },
});
const emit = defineEmits([
  "rename",
  "preset",
  "add-region",
  "toggle-direction",
  "clock-enabled",
  "clock-position",
  "clock-design",
  "clock-inherit",
  "duplicate",
  "delete",
  "hide",
  "toggle-target",
]);
const changeOpen = ref(false);

const presets = [
  { value: "single", label: "Single" },
  { value: "split_two", label: "Two" },
  { value: "split_three", label: "Three" },
  { value: "split_four", label: "Four" },
];
const headingSub = computed(() =>
  props.clockSelected ? `· on ${props.screen.name}` : `· ${props.screen.name}`
);
const isCustom = computed(
  () => !props.screen.layout.preset || props.screen.layout.preset === "custom"
);
const atMax = computed(() => props.screen.layout.regions.length >= MAX_TOP_REGIONS);
const hasOverride = computed(() => Boolean(props.screen.clockBar));

// The name commits on blur or Enter, like the old `@change` input, so typing
// does not write the config on every character.
const draftName = ref(props.screen.name);
watch(
  () => props.screen.name,
  name => (draftName.value = name)
);
const commitName = () => {
  if (draftName.value !== props.screen.name) emit("rename", draftName.value);
};

// On a kiosk the on-screen keyboard can cover the field being edited; keep it
// in view without scrolling the whole dialog to the top (§5).
const keepInView = event => {
  const el = event?.target;
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "nearest" });
  }
};

// The resolved position ("top" | … | "between" | "between:N") already matches
// the option values below verbatim, so no remapping is needed for selection.
const positionValue = computed(() => props.clock.position);
const positionOptions = computed(() => {
  const opts = [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ];
  const n = props.screen.layout.regions.length;
  if (n === 2) {
    opts.push({ value: "between", label: "Between" });
  } else if (n > 2) {
    // With 3+ regions there are multiple gaps — name each so it's pickable
    // without dragging. Gap 0 uses the bare "between" alias.
    for (let i = 0; i < n - 1; i++) {
      opts.push({
        value: i === 0 ? "between" : `between:${i}`,
        label: `Between ${i + 1} & ${i + 2}`,
      });
    }
  }
  return opts;
});
</script>

<style scoped>
.ins-mode {
  display: flex;
  align-items: baseline;
  gap: var(--gap-1);
  padding: var(--gap-4) var(--panel-pad-x) 0;
  margin-bottom: var(--gap-3);
}
.ins-sub {
  font-size: var(--text-meta);
  color: var(--ink-3);
}
.ins-field {
  padding: var(--panel-pad-y) var(--panel-pad-x);
}
/* Keep every toggle on the right of its label; a long description wraps
   instead of pushing the switch onto the next line. */
.ins-toggle-row :deep(.setting-row__info) {
  flex: 1 1 0;
}
.ins-toggle-row :deep(.setting-row__control) {
  flex: 0 0 auto;
}
.ins-tag {
  margin-left: var(--gap-1);
}
.ins-scope {
  padding: var(--panel-pad-y) var(--panel-pad-x);
}
.ins-note {
  padding: 0 var(--panel-pad-x) var(--gap-3);
}
.ins-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2);
  padding: var(--panel-pad-y) var(--panel-pad-x) var(--gap-5);
}
.ins-targets {
  min-width: 16rem;
  padding: var(--gap-1) 0;
}
.ins-target-row + .ins-target-row {
  border-top: 1px solid var(--line-soft);
}
</style>
