<template>
  <div class="ins">
    <div class="ins-mode"><span class="chip region">Region</span> in “{{ screen.name }}”</div>

    <template v-if="region.split">
      <section class="ins-group">
        <h3 class="ins-h">Split region</h3>
        <div class="ins-field">
          <span class="ins-label">Sub-region direction</span>
          <SegmentedControl
            :model-value="splitDir"
            :options="[
              { value: 'row', label: 'Side-by-side' },
              { value: 'column', label: 'Stacked' },
            ]"
            aria-label="Sub-region direction"
            @update:model-value="$emit('toggle-sub-direction')"
          />
        </div>
        <div class="btn-row">
          <button v-if="canAddSub" type="button" class="link-btn" @click="$emit('add-sub')">
            {{ addSubLabel }}
          </button>
        </div>
        <p class="ins-help">
          This region is split into sub-regions. Select a sub-region to set its content.
        </p>
      </section>
    </template>

    <template v-else>
      <section class="ins-group">
        <h3 class="ins-h">Shows</h3>
        <div class="picker">
          <button
            type="button"
            class="picker-trigger"
            :aria-expanded="pickerOpen"
            @click="pickerOpen = !pickerOpen"
          >
            <span class="picker-emoji">{{ kindEmoji }}</span>
            {{ componentLabel }}
            <span class="picker-caret">▾</span>
          </button>
          <div v-if="pickerOpen" class="picker-menu">
            <input
              v-model="search"
              class="picker-search"
              type="search"
              placeholder="Filter components"
            />
            <button
              v-for="opt in filtered"
              :key="opt.value"
              type="button"
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
            </button>
            <p v-if="filtered.length === 0" class="picker-empty">No matches</p>
          </div>
        </div>

        <div v-if="sourceOptions.length" class="sources">
          <span class="ins-label">Sources</span>
          <label class="source">
            <input
              type="checkbox"
              :checked="(region.instanceIds || []).length === 0"
              @change="$emit('clear-sources')"
            />
            All sources
          </label>
          <label v-for="src in sourceOptions" :key="src.id" class="source">
            <input
              type="checkbox"
              :checked="(region.instanceIds || []).includes(src.id)"
              @change="$emit('toggle-source', src.id, $event.target.checked)"
            />
            {{ src.name }}
          </label>
        </div>
      </section>

      <section v-if="region.kind === 'calendar'" class="ins-group">
        <h3 class="ins-h">Calendar</h3>
        <div class="ins-field">
          <span class="ins-label">View</span>
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
        </div>
        <div class="switch-row">
          <div>
            <div class="s-label">Rolling window</div>
            <div class="s-help">Start from today instead of the calendar month</div>
          </div>
          <ToggleSwitch
            :model-value="region.view?.rolling === true"
            aria-label="Rolling window"
            @update:model-value="v => $emit('patch-view', { rolling: v })"
          />
        </div>
        <div v-if="region.view?.rolling" class="ins-field row">
          <span class="ins-label">Weeks ahead</span>
          <NumberStepper
            :model-value="region.view?.weeks ?? 4"
            :min="1"
            :max="12"
            aria-label="Weeks ahead"
            @update:model-value="v => $emit('patch-view', { weeks: v })"
          />
        </div>
      </section>

      <section v-else-if="region.kind === 'service'" class="ins-group">
        <h3 class="ins-h">Service</h3>
        <div class="ins-field">
          <span class="ins-label">When tapped</span>
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
        </div>
      </section>
    </template>

    <section v-if="isSub" class="ins-group">
      <h3 class="ins-h">Split</h3>
      <div class="ins-field">
        <span class="ins-label">Sub-region direction</span>
        <SegmentedControl
          :model-value="splitDir"
          :options="[
            { value: 'row', label: 'Side-by-side' },
            { value: 'column', label: 'Stacked' },
          ]"
          aria-label="Sub-region direction"
          @update:model-value="$emit('toggle-sub-direction')"
        />
      </div>
      <div class="btn-row">
        <button v-if="canAddSub" type="button" class="link-btn" @click="$emit('add-sub')">
          {{ addSubLabel }}
        </button>
      </div>
      <p class="ins-help">
        This region is one cell of a split. Add more to build rows and columns.
      </p>
    </section>

    <section class="ins-group">
      <h3 class="ins-h">Arrange</h3>
      <p class="ins-help sz">
        Size <strong>{{ region.size }}%</strong> — drag the divider in the preview to resize.
      </p>
      <div class="btn-row">
        <button
          v-if="splittable || region.split"
          type="button"
          class="link-btn"
          @click="$emit('toggle-split')"
        >
          {{ region.split ? "Unsplit" : "Split region" }}
        </button>
        <button
          type="button"
          class="link-btn danger"
          :disabled="!canRemove"
          @click="$emit('remove')"
        >
          Remove region
        </button>
      </div>
      <button type="button" class="link-btn back" @click="$emit('deselect')">
        ◂ Back to screen settings
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
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

const pickerOpen = ref(false);
const search = ref("");
const filtered = computed(() => filterComponentOptions(props.componentOptions, search.value));
const choose = opt => {
  emit("set-component", opt);
  pickerOpen.value = false;
  search.value = "";
};

const kindEmoji = computed(() =>
  props.region.kind === "calendar" ? "📅" : props.region.kind === "photos" ? "🖼️" : "🌐"
);
const componentLabel = computed(() => {
  if (props.region.kind === "calendar") return "Calendar";
  if (props.region.kind === "photos") return "Photos";
  const opt = props.componentOptions.find(
    o => o.instanceIds?.[0] === props.region.instanceIds?.[0]
  );
  return opt?.label || "Service";
});

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
</script>

<style scoped>
.ins {
  padding: var(--space-xl) var(--space-xl) var(--space-3xl);
}
.ins-mode {
  font-size: var(--fs-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: var(--space-lg);
}
.chip {
  padding: 0.12rem 0.5rem;
  border-radius: var(--radius-pill);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.chip.region {
  background: var(--focus-glow);
  color: var(--focus);
}
.ins-group {
  margin-bottom: var(--space-3xl);
}
.ins-h {
  margin: 0 0 var(--space-lg);
  font-size: var(--fs-2xs);
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.ins-field {
  display: block;
  margin-bottom: var(--space-lg);
}
.ins-field.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}
.ins-label {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
  margin-bottom: var(--space-sm);
}
.ins-field.row .ins-label {
  margin-bottom: 0;
}
.ins-help {
  margin: var(--space-sm) 0 0;
  font-size: var(--fs-2xs);
  color: var(--ink-3);
  line-height: 1.35;
}
.ins-help.sz {
  margin: 0 0 var(--space-md);
}
.ins-help.sz strong {
  color: var(--ink);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}

.picker {
  position: relative;
}
.picker-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-1);
  color: var(--ink);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.picker-trigger:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.picker-caret {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--fs-2xs);
}
.picker-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--bg-1);
  box-shadow: 0 12px 32px var(--shadow);
}
.picker-search {
  width: 100%;
  margin-bottom: 6px;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  color: var(--ink);
}
.picker-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.picker-option:hover {
  background: var(--bg-2);
}
.picker-option-type {
  font-size: var(--fs-micro);
  color: var(--ink-3);
}
.picker-empty {
  padding: 0.5rem;
  color: var(--ink-3);
  font-size: var(--fs-2xs);
}

.sources {
  margin-top: var(--space-lg);
}
.source {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0;
  font-size: var(--fs-sm);
  color: var(--ink);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  padding: var(--space-sm) 0;
}
.s-label {
  font-size: var(--fs-sm);
  font-weight: 550;
  color: var(--ink);
}
.s-help {
  font-size: var(--fs-2xs);
  color: var(--ink-3);
  margin-top: 0.1rem;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}
.link-btn {
  font-size: var(--fs-xs);
  font-weight: 550;
  padding: var(--space-2xs) var(--space-md);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  color: var(--ink-2);
  cursor: pointer;
}
.link-btn:hover:not(:disabled) {
  border-color: var(--focus);
  color: var(--focus);
}
.link-btn.danger:hover:not(:disabled) {
  border-color: var(--err);
  color: var(--err);
}
.link-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.link-btn.back {
  margin-top: var(--space-md);
  width: 100%;
}
</style>
