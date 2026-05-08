<template>
  <div class="card-grid calvin-plugin-grid dashboard-renderer-grid" :style="gridStyle">
    <article
      v-for="(card, idx) in cards"
      :key="idx"
      class="card-grid__card calvin-plugin-surface dashboard-renderer-card"
    >
      <header v-if="cardTitle(card)" class="card-grid__title">{{ cardTitle(card) }}</header>
      <ul v-if="cardItems(card).length" class="card-grid__items">
        <li
          v-for="(item, j) in cardItems(card)"
          :key="j"
          class="card-grid__item"
          :class="{
            'card-grid__item--clickable': itemUrl(item),
            'calvin-plugin-clickable': itemUrl(item),
            'dashboard-renderer-clickable': itemUrl(item),
          }"
          @click="open(itemUrl(item))"
        >
          <span v-if="itemLabel(item)" class="card-grid__item-label">{{ itemLabel(item) }}</span>
          <span v-if="itemValue(item)" class="card-grid__item-value">{{ itemValue(item) }}</span>
        </li>
      </ul>
      <p v-else class="card-grid__empty calvin-plugin-empty dashboard-renderer-empty">
        {{ schema.empty_text || "—" }}
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

.card-grid__title {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary);
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-grid__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.card-grid__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid transparent;
}

.card-grid__item--clickable {
  cursor: pointer;
}

.card-grid__item-label {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--accent-primary);
  text-transform: capitalize;
  min-width: 70px;
}

.card-grid__item-value {
  flex: 1;
  color: var(--text-primary);
  font-size: 0.9rem;
  word-break: break-word;
}

.card-grid__empty {
  color: var(--text-secondary);
  font-style: italic;
  margin: 0;
}
</style>
