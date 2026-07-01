<template>
  <ul class="item-list calvin-plugin-list calvin-plugin-list--scroll">
    <li
      v-for="(item, i) in items"
      :key="i"
      class="item-list__row"
      :class="{
        'calvin-plugin-row': true,
        'item-list__row--clickable': urlFor(item),
        'calvin-plugin-clickable': urlFor(item),
      }"
      @click="open(urlFor(item))"
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
</template>

<script setup>
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

const items = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

const itemSpec = computed(() => props.schema.item || {});

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

function open(url) {
  if (url) window.open(url, "_blank", "noopener");
}
</script>

<style scoped>
.item-list__row {
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
}

.item-list__row--clickable {
  cursor: pointer;
}

/* timestamps are data: tabular mono column so entries align like a log */
.item-list__timestamp {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
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
  font-size: 0.95rem;
  line-height: 1.35;
}

.item-list__value {
  color: var(--ink-2);
  font-size: 0.85rem;
  line-height: 1.35;
}
</style>
