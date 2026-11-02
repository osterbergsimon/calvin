<template>
  <div
    ref="gridEl"
    class="card-grid calvin-plugin-grid"
    :class="shadeClass"
    :style="[gridStyle, clampStyle]"
  >
    <Card
      v-for="(card, idx) in cards"
      :key="cardKey(card, idx)"
      class="card-grid__card"
      :style="cardPadStyle"
    >
      <header v-if="cardTitle(card)" class="card-grid__title">{{ cardTitle(card) }}</header>
      <ul v-if="cardItems(card).length" class="card-grid__items calvin-plugin-list">
        <li
          v-for="(item, j) in cardItems(card)"
          :key="itemKey(item, j)"
          class="card-grid__item calvin-plugin-row"
          :class="{
            'card-grid__item--clickable': isClickable(itemUrl(item), itemLinkAction),
            'calvin-plugin-clickable': isClickable(itemUrl(item), itemLinkAction),
          }"
          @click="openLink(itemUrl(item), itemLinkAction)"
        >
          <span v-if="itemLabel(item)" class="card-grid__item-label">{{ itemLabel(item) }}</span>
          <span v-if="itemValue(item)" class="card-grid__item-value">{{ itemValue(item) }}</span>
        </li>
      </ul>
      <EmptyState
        v-else
        compact
        :inset="false"
        class="card-grid__empty"
        :message="schema.empty_text || 'Nothing planned.'"
      />
    </Card>
    <HandoffOverlay v-if="overlay?.kind === 'handoff'" :url="overlay.url" @close="closeOverlay" />
    <EmbedOverlay
      v-else-if="overlay?.kind === 'embed'"
      :url="overlay.url"
      @close="closeOverlay"
      @fallback="fallbackToHandoff"
    />
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";
import { useLinkOpen } from "../../../composables/useLinkOpen";
import { useFitScroll } from "../../../composables/useFitScroll.js";
import Card from "../../ui/Card.vue";
import EmptyState from "../../ui/EmptyState.vue";
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

const gridEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(gridEl, {
  axis: "block",
  itemSelector: ".card-grid__card",
  data: () => props.data,
});

// A region's card-size control sets --card-pad (styles/cardSizeScale.js); the
// card block owns its inset otherwise. This is the one geometry a plugin panel
// may override, so it stays an inline var rather than a local card style.
const cardPadStyle = { padding: "var(--card-pad, var(--gap-4))" };

const itemLinkAction = computed(() => itemSpec().link_action);

const cards = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

const gridStyle = computed(() => {
  const cols = props.schema.layout?.columns;
  let gridTemplateColumns = "1fr";
  if (typeof cols === "number") {
    gridTemplateColumns = `repeat(${cols}, 1fr)`;
  } else if (cols === "auto-square") {
    const n = Math.max(cards.value.length, 1);
    const c = Math.max(Math.ceil(Math.sqrt(n)), 1);
    gridTemplateColumns = `repeat(${c}, 1fr)`;
  } else if (typeof cols === "string" && cols.startsWith("auto-fit-")) {
    const min = cols.slice("auto-fit-".length);
    // A region's card-size control can override the min via --card-min; the
    // schema's own min stays the fallback so plugins that don't opt in are
    // unchanged.
    gridTemplateColumns = `repeat(auto-fit, minmax(var(--card-min, ${min}px), 1fr))`;
  }
  // max-content keeps each row at its natural (card) height so the grid OVERFLOWS
  // its region instead of squishing rows to title height — that overflow is what
  // the fit-clamp measures and clamps/scrolls.
  return { gridTemplateColumns, gridAutoRows: "max-content" };
});

function cardTitle(card) {
  const cs = props.schema.card || {};
  const raw = cs.title_path ? resolvePath(card, cs.title_path) : cs.title;
  return applyFormat(raw, cs.title_format);
}

function cardItems(card) {
  const cs = props.schema.card || {};
  const slice = cs.items_path ? resolvePath(card, cs.items_path) : [];
  return Array.isArray(slice) ? slice : [];
}

function itemSpec() {
  return props.schema.card?.item || {};
}

function itemLabel(item) {
  const spec = itemSpec();
  const raw = spec.label_path ? resolvePath(item, spec.label_path) : spec.label;
  return applyFormat(raw, spec.label_format);
}

function itemValue(item) {
  const spec = itemSpec();
  const raw = spec.value_path ? resolvePath(item, spec.value_path) : spec.value;
  return applyFormat(raw, spec.value_format);
}

function itemUrl(item) {
  const spec = itemSpec();
  return spec.click_url_path ? resolvePath(item, spec.click_url_path) : null;
}

// Stable content keys so keyed diffs don't misplay transitions when cards or
// their items reorder on refresh. Fall back to index when nothing identifying exists.
function cardKey(card, idx) {
  return cardTitle(card) || idx;
}

function itemKey(item, idx) {
  const sig = [itemLabel(item), itemValue(item)].filter(v => v != null && v !== "").join("|");
  return sig || idx;
}
</script>

<style scoped>
.card-grid {
  overflow: hidden;
}

/* The block owns the surface; the card only lays its own children out and
   stays the fit-clamp's measuring unit. */
.card-grid__card {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  overflow: hidden;
  scroll-snap-align: start;
}

/* card title = the readout microlabel: one label voice everywhere */
.card-grid__title {
  font-family: var(--font-ui);
  font-size: 0.7em;
  font-weight: var(--weight-title);
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-bottom: var(--gap-2);
  border-bottom: 1px solid var(--line-soft);
}

.card-grid__item {
  display: flex;
  align-items: baseline;
  gap: var(--gap-3);
  border-radius: 2px;
}

.card-grid__item--clickable {
  cursor: pointer;
}

.card-grid__item-label {
  font-family: var(--font-ui);
  font-size: 0.7em;
  font-weight: var(--weight-title);
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
  min-width: 70px;
  flex-shrink: 0;
}

.card-grid__item-value {
  flex: 1;
  color: var(--ink);
  font-size: 0.95em;
  line-height: 1.35;
  word-break: break-word;
}
</style>
