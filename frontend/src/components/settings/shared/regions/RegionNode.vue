<template>
  <div
    class="sre-region"
    :class="[
      region.split ? 'is-split' : `kind-${region.kind}`,
      { 'is-active': region.id === selectedId },
    ]"
    :style="{ flex: `${region.size} ${region.size} 0` }"
    tabindex="0"
    :data-region-id="region.id"
    @click.stop="emit('select', region.id)"
    @keydown.enter.prevent="emit('select', region.id)"
  >
    <div v-if="region.split" ref="containerEl" class="sre-subsplit" :class="`dir-${splitDir}`">
      <template v-for="(sub, i) in region.split.regions" :key="sub.id">
        <RegionNode
          :region="sub"
          :path="[...path, i]"
          :parent-direction="splitDir"
          :selected-id="selectedId"
          :layout-dir="layoutDir"
          :coarse="coarse"
          :narrow="narrow"
          @select="emit('select', $event)"
          @resize="emit('resize', $event)"
        />
        <button
          v-if="i < region.split.regions.length - 1"
          type="button"
          class="sre-resizer"
          :class="splitDir === 'row' ? 'col' : 'row'"
          :style="coarse ? { flex: '0 0 28px' } : null"
          aria-label="Resize sub-regions"
          @pointerdown.stop="onResize(i, $event)"
        >
          <span class="grip" />
        </button>
      </template>
    </div>
    <div v-else class="sre-region-face">
      <svg v-if="!narrow" class="sre-region-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="icon" fill="currentColor" />
      </svg>
      <span class="sre-region-name">{{ title }}</span>
      <span v-if="!narrow" class="sre-region-size">{{ region.size }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { mdiCalendarBlankOutline, mdiImageOutline, mdiWeb } from "@mdi/js";
import { getSplitDirection } from "@/utils/layout";

const props = defineProps({
  region: { type: Object, required: true },
  path: { type: Array, default: () => [] },
  parentDirection: { type: String, default: "row" },
  selectedId: { type: String, default: null },
  layoutDir: { type: String, required: true },
  // Coarse pointers get a 28px-across resizer hit area (§4).
  coarse: { type: Boolean, default: false },
  // Under 320px the device only has room for the region name (§2).
  narrow: { type: Boolean, default: false },
});
const emit = defineEmits(["select", "resize"]);

const containerEl = ref(null);
const splitDir = computed(() => getSplitDirection(props.region.split, props.parentDirection));
const icon = computed(() =>
  props.region.kind === "calendar"
    ? mdiCalendarBlankOutline
    : props.region.kind === "photos"
      ? mdiImageOutline
      : mdiWeb
);
const title = computed(() =>
  props.region.kind === "calendar"
    ? "Calendar"
    : props.region.kind === "photos"
      ? "Photos"
      : "Service"
);
const onResize = (firstIndex, event) =>
  emit("resize", {
    containerId: props.region.id,
    firstIndex,
    event,
    direction: splitDir.value,
    el: containerEl.value,
  });
</script>

<style scoped>
.sre-region {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  border-radius: var(--radius-xs);
  cursor: pointer;
  overflow: hidden;
  transition:
    box-shadow 0.15s,
    filter 0.15s;
}
/* Regions are neutral theme surfaces (D3): the kind is recognisable from its
   icon and label, never from a colour. Neutral also keeps the focus colour
   meaning "selected" — the only colour a region uses. */
.sre-region.kind-calendar,
.sre-region.kind-photos,
.sre-region.kind-service {
  background: var(--bg-2);
  box-shadow: inset 0 0 0 1px var(--line);
}
.sre-region.is-split {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-soft);
}
.sre-region.is-active {
  background: color-mix(in srgb, var(--focus) 12%, var(--bg-2));
  box-shadow:
    inset 0 0 0 2px var(--focus),
    0 0 0 2px var(--focus-glow);
  z-index: 2;
}
.sre-subsplit {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
  min-height: 0;
  padding: 2px;
}
.sre-subsplit.dir-row {
  flex-direction: row;
}
.sre-subsplit.dir-column {
  flex-direction: column;
}
.sre-region-face {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.3rem;
  text-align: center;
  pointer-events: none;
}
/* Region tiles are theme surfaces in every mode, so they use the theme ink
   (not the fixed device-screen ink of the bezel). */
.sre-region-icon {
  width: 1.25rem; /* 20px */
  height: 1.25rem;
  color: var(--ink-2);
}
.sre-region-name {
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.sre-region-size {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: var(--fs-micro);
  color: var(--ink-3);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
.sre-resizer {
  position: relative;
  flex: 0 0 6px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  padding: 0;
  touch-action: none;
}
.sre-resizer.col {
  cursor: col-resize;
}
.sre-resizer.row {
  cursor: row-resize;
  width: 100%;
  flex-basis: 6px;
}
.sre-resizer .grip {
  width: 4px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--focus) 55%, transparent);
}
.sre-resizer.row .grip {
  width: 34px;
  height: 4px;
}
.sre-resizer:hover .grip,
.sre-resizer:focus-visible .grip {
  background: var(--focus);
}
</style>
