<template>
  <ul
    ref="listEl"
    class="item-list calvin-plugin-list calvin-plugin-list--scroll"
    :class="shadeClass"
    :style="clampStyle"
  >
    <li
      v-for="(item, i) in items"
      :key="keyFor(item, i)"
      class="item-list__row"
      :class="{
        'calvin-plugin-row': true,
        'item-list__row--clickable': isClickable(urlFor(item), itemLinkAction),
        'calvin-plugin-clickable': isClickable(urlFor(item), itemLinkAction),
      }"
      @click="openLink(urlFor(item), itemLinkAction)"
    >
      <span v-if="timestampFor(item)" class="item-list__timestamp">{{ timestampFor(item) }}</span>
      <div class="item-list__body">
        <span v-if="labelFor(item)" class="item-list__label">{{ labelFor(item) }}</span>
        <span v-if="valueFor(item)" class="item-list__value">{{ valueFor(item) }}</span>
      </div>
    </li>
    <li v-if="items.length === 0" class="item-list__empty calvin-plugin-empty">
      {{ schema.empty_text || "Nothing to show yet." }}
    </li>
  </ul>
  <HandoffOverlay v-if="overlay?.kind === 'handoff'" :url="overlay.url" @close="closeOverlay" />
  <EmbedOverlay
    v-else-if="overlay?.kind === 'embed'"
    :url="overlay.url"
    @close="closeOverlay"
    @fallback="fallbackToHandoff"
  />
</template>

<script setup>
defineOptions({ inheritAttrs: false });

import { computed, ref } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";
import { useLinkOpen } from "../../../composables/useLinkOpen";
import { useFitScroll } from "../../../composables/useFitScroll.js";
import HandoffOverlay from "../overlays/HandoffOverlay.vue";
import EmbedOverlay from "../overlays/EmbedOverlay.vue";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  linkAction: { type: String, default: null },
});

const { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff } = useLinkOpen(
  () => props.linkAction
);

const items = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

const listEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(listEl, {
  axis: "block",
  itemSelector: ".item-list__row",
  data: () => props.data,
});

const itemSpec = computed(() => props.schema.item || {});
const itemLinkAction = computed(() => itemSpec.value.link_action);

function pick(item, pathKey, literalKey, formatKey) {
  const spec = itemSpec.value;
  const raw = spec[pathKey] ? resolvePath(item, spec[pathKey]) : spec[literalKey];
  return formatKey ? applyFormat(raw, spec[formatKey]) : raw;
}

const labelFor = item => pick(item, "label_path", "label", "label_format");
const valueFor = item => pick(item, "value_path", "value", "value_format");
const timestampFor = item => pick(item, "timestamp_path", "timestamp", "timestamp_format");
const urlFor = item =>
  itemSpec.value.click_url_path ? resolvePath(item, itemSpec.value.click_url_path) : null;

// Stable content key so keyed diffs don't misplay transitions when items
// prepend/reorder on refresh. Falls back to index when nothing identifying exists.
const keyFor = (item, i) => {
  const sig = [timestampFor(item), labelFor(item), valueFor(item)]
    .filter(v => v != null && v !== "")
    .join("|");
  return sig || i;
};
</script>

<style scoped>
.item-list__row {
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  flex-shrink: 0;
  scroll-snap-align: start;
}

.item-list__row--clickable {
  cursor: pointer;
}

/* timestamps are data: tabular mono column so entries align like a log */
.item-list__timestamp {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 0.8em;
  font-weight: 500;
  color: var(--ink-3);
  min-width: 80px;
  flex-shrink: 0;
}

.item-list__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.item-list__label {
  color: var(--ink);
  font-weight: 600;
  font-size: 0.95em;
  line-height: 1.35;
}

.item-list__value {
  color: var(--ink-2);
  font-size: 0.85em;
  line-height: 1.35;
}
</style>
