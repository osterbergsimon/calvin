<template>
  <div class="card-grid calvin-plugin-grid" :style="gridStyle">
    <article v-for="(card, idx) in cards" :key="idx" class="card-grid__card calvin-plugin-surface">
      <header v-if="cardTitle(card)" class="card-grid__title">{{ cardTitle(card) }}</header>
      <ul v-if="cardItems(card).length" class="card-grid__items calvin-plugin-list">
        <li
          v-for="(item, j) in cardItems(card)"
          :key="j"
          class="card-grid__item calvin-plugin-row"
          :class="{
            'card-grid__item--clickable': itemUrl(item),
            'calvin-plugin-clickable': itemUrl(item),
          }"
          @click="open(itemUrl(item))"
        >
          <span v-if="itemLabel(item)" class="card-grid__item-label">{{ itemLabel(item) }}</span>
          <span v-if="itemValue(item)" class="card-grid__item-value">{{ itemValue(item) }}</span>
        </li>
      </ul>
      <p v-else class="card-grid__empty calvin-plugin-empty">
        {{ schema.empty_text || "Nothing planned." }}
      </p>
    </article>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

const cards = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

const gridStyle = computed(() => {
  const cols = props.schema.layout?.columns;
  if (typeof cols === "number") {
    return { gridTemplateColumns: `repeat(${cols}, 1fr)` };
  }
  if (cols === "auto-square") {
    const n = Math.max(cards.value.length, 1);
    const c = Math.max(Math.ceil(Math.sqrt(n)), 1);
    return { gridTemplateColumns: `repeat(${c}, 1fr)` };
  }
  if (typeof cols === "string" && cols.startsWith("auto-fit-")) {
    const min = cols.slice("auto-fit-".length);
    return { gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` };
  }
  return { gridTemplateColumns: "1fr" };
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

function open(url) {
  if (url) window.open(url, "_blank", "noopener");
}
</script>

<style scoped>
.card-grid {
  overflow: hidden;
}

.card-grid__card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow: hidden;
}

/* card title = the readout microlabel: one label voice everywhere */
.card-grid__title {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--line-soft);
}

.card-grid__item {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  border-radius: 2px;
}

.card-grid__item--clickable {
  cursor: pointer;
}

.card-grid__item-label {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
  min-width: 70px;
  flex-shrink: 0;
}

.card-grid__item-value {
  flex: 1;
  color: var(--ink);
  font-size: 0.95rem;
  line-height: 1.35;
  word-break: break-word;
}

.card-grid__empty {
  margin: 0;
  text-align: left;
  padding: 0.5rem 0;
}
</style>
