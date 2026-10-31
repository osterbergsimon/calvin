<template>
  <div class="ins">
    <div class="ins-mode">
      <h3 class="ins-title">{{ clockSelected ? "Clock bar" : "Page" }}</h3>
      <span class="ins-sub">{{ headingSub }}</span>
    </div>

    <SettingRow label="Name" stacked>
      <TextField
        data-test="page-name"
        :model-value="draftName"
        label="Page name"
        hide-label
        @update:model-value="draftName = $event"
        @focus="keepInView"
        @blur="commitName"
        @keydown.enter.prevent="commitName"
      />
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
      <SettingRow label="Show clock bar" description="A slim time strip on this page">
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
});
const emit = defineEmits([
  "rename",
  "preset",
  "add-region",
  "toggle-direction",
  "clock-enabled",
  "clock-position",
  "clock-inherit",
  "duplicate",
  "delete",
]);

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
</style>
