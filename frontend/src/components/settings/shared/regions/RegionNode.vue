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
          @select="emit('select', $event)"
          @resize="emit('resize', $event)"
        />
        <button
          v-if="i < region.split.regions.length - 1"
          type="button"
          class="sre-resizer"
          :class="splitDir === 'row' ? 'col' : 'row'"
          aria-label="Resize sub-regions"
          @pointerdown.stop="onResize(i, $event)"
        >
          <span class="grip" />
        </button>
      </template>
    </div>
    <div v-else class="sre-region-face">
      <span class="sre-region-emoji">{{ emoji }}</span>
      <span class="sre-region-name">{{ title }}</span>
      <span class="sre-region-size">{{ region.size }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { getSplitDirection } from "@/utils/layout";

const props = defineProps({
  region: { type: Object, required: true },
  path: { type: Array, default: () => [] },
  parentDirection: { type: String, default: "row" },
  selectedId: { type: String, default: null },
  layoutDir: { type: String, required: true },
});
const emit = defineEmits(["select", "resize"]);

const containerEl = ref(null);
const splitDir = computed(() => getSplitDirection(props.region.split, props.parentDirection));
const emoji = computed(() =>
  props.region.kind === "calendar" ? "📅" : props.region.kind === "photos" ? "🖼️" : "🌐"
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
  border-radius: 5px;
  cursor: pointer;
  overflow: hidden;
  transition:
    box-shadow 0.15s,
    filter 0.15s;
}
.sre-region.kind-calendar {
  background: color-mix(in srgb, var(--region-calendar) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-calendar) 55%, transparent);
}
.sre-region.kind-photos {
  background: color-mix(in srgb, var(--region-photos) 15%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-photos) 55%, transparent);
}
.sre-region.kind-service {
  background: color-mix(in srgb, var(--region-service) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-service) 55%, transparent);
}
.sre-region.is-split {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-soft);
}
.sre-region.is-active {
  filter: brightness(1.08);
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
/* The device screen is always a dark, lit surface regardless of the app theme,
   so on-screen text is fixed light rather than theme-driven --ink. */
.sre-region-emoji {
  font-size: 1.2rem;
  filter: saturate(1.05);
}
.sre-region-name {
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: rgba(240, 244, 248, 0.92);
  letter-spacing: 0.01em;
}
.sre-region-size {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: var(--fs-micro);
  color: rgba(240, 244, 248, 0.55);
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
