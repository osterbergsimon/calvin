<template>
  <div class="ins">
    <div class="ins-mode"><span class="chip screen">Screen</span> settings</div>

    <section class="ins-group">
      <h3 class="ins-h">Screen</h3>
      <label class="ins-field">
        <span class="ins-label">Name</span>
        <input
          class="ins-input"
          type="text"
          :value="screen.name"
          aria-label="Screen name"
          @change="$emit('rename', $event.target.value)"
        />
      </label>

      <div class="ins-field">
        <span class="ins-label">Layout <span v-if="isCustom" class="tag">Custom</span></span>
        <div class="presets">
          <button
            v-for="p in presets"
            :key="p.value"
            type="button"
            class="preset"
            :class="{ active: screen.layout.preset === p.value }"
            :aria-label="p.label"
            @click="$emit('preset', p.value)"
          >
            <span class="mini"><i v-for="n in p.cols" :key="n" /></span>
            <span class="preset-label">{{ p.short }}</span>
          </button>
        </div>
      </div>

      <div class="ins-field">
        <span class="ins-label">Region direction</span>
        <SegmentedControl
          :model-value="layoutDir"
          :options="[
            { value: 'row', label: 'Side-by-side' },
            { value: 'column', label: 'Stacked' },
          ]"
          aria-label="Region direction"
          @update:model-value="$emit('toggle-direction')"
        />
        <p class="ins-help">
          How this screen’s regions are cut — independent of the physical orientation.
        </p>
      </div>
    </section>

    <section class="ins-group">
      <h3 class="ins-h">Clock bar</h3>
      <div class="switch-row">
        <div>
          <div class="s-label">Show clock bar</div>
          <div class="s-help">A slim time strip on this screen</div>
        </div>
        <ToggleSwitch
          :model-value="clock.enabled"
          aria-label="Show clock bar"
          @update:model-value="v => $emit('clock-enabled', v)"
        />
      </div>
      <div v-if="clock.enabled" class="ins-field">
        <span class="ins-label">Position</span>
        <SelectPill
          :model-value="positionValue"
          :options="positionOptions"
          aria-label="Clock bar position"
          @update:model-value="v => $emit('clock-position', v)"
        />
        <p class="ins-help">
          Or drag the bar in the preview onto any edge or gap. With 3+ regions,
          each gap is listed so you can pick exactly where it sits.
        </p>
      </div>
      <button v-if="hasOverride" type="button" class="link-btn" @click="$emit('clock-inherit')">
        Inherit global clock bar
      </button>
    </section>

    <section class="ins-group">
      <h3 class="ins-h">This screen</h3>
      <p class="ins-empty">
        Select a region in the preview to set what it shows and how big it is.
      </p>
      <div class="btn-row">
        <button type="button" class="link-btn" :disabled="atMax" @click="$emit('add-region')">
          ＋ Add region
        </button>
        <button type="button" class="link-btn" @click="$emit('duplicate')">Duplicate</button>
        <button
          type="button"
          class="link-btn danger"
          :disabled="!canDelete"
          @click="$emit('delete')"
        >
          Delete screen
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { MAX_TOP_REGIONS } from "@/utils/layout";

const props = defineProps({
  screen: { type: Object, required: true },
  layoutDir: { type: String, required: true },
  clock: { type: Object, required: true },
  canDelete: { type: Boolean, default: true },
});
defineEmits([
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
  { value: "single", label: "Single region", short: "Single", cols: 1 },
  { value: "split_two", label: "Two regions", short: "2", cols: 2 },
  { value: "split_three", label: "Three regions", short: "3", cols: 3 },
  { value: "split_four", label: "Four regions", short: "4", cols: 4 },
];
const isCustom = computed(
  () => !props.screen.layout.preset || props.screen.layout.preset === "custom"
);
const atMax = computed(() => props.screen.layout.regions.length >= MAX_TOP_REGIONS);
const hasOverride = computed(() => Boolean(props.screen.clockBar));

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
      opts.push({ value: i === 0 ? "between" : `between:${i}`, label: `Between ${i + 1} & ${i + 2}` });
    }
  }
  return opts;
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
.chip.screen {
  background: var(--bg-2);
  border: 1px solid var(--line);
  color: var(--ink-2);
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
.ins-label {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
  margin-bottom: var(--space-sm);
}
.ins-help {
  margin: var(--space-sm) 0 0;
  font-size: var(--fs-2xs);
  color: var(--ink-3);
  line-height: 1.35;
}
.ins-input {
  width: 100%;
  height: var(--control-height);
  padding: 0 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-1);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
}
.ins-input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.tag {
  font-size: var(--fs-micro);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-left: 0.4rem;
  padding: 0.08rem 0.4rem;
  border-radius: var(--radius-pill);
  background: var(--focus-glow);
  color: var(--focus);
}
.presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-sm);
}
.preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-sm) var(--space-2xs) var(--space-2xs);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  cursor: pointer;
}
.preset:hover {
  border-color: var(--focus);
}
.preset.active {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px var(--focus-glow);
}
.preset .mini {
  display: flex;
  gap: 2px;
  width: 100%;
  height: 30px;
  padding: 2px;
  border-radius: var(--radius-xs);
  background: var(--bg-2);
}
.preset .mini i {
  flex: 1;
  border-radius: 2px;
  background: color-mix(in srgb, var(--region-calendar) 45%, transparent);
}
.preset-label {
  font-size: var(--fs-micro);
  color: var(--ink-2);
}
.preset.active .preset-label {
  color: var(--focus);
  font-weight: 650;
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
.ins-empty {
  font-size: var(--fs-2xs);
  color: var(--ink-3);
  background: var(--bg-2);
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-md) var(--space-lg);
  line-height: 1.4;
  margin: 0 0 var(--space-lg);
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
</style>
