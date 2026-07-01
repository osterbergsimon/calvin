<template>
  <component :is="layout === 'list' ? 'ul' : 'span'" class="status" :class="`status--${layout}`">
    <template v-for="(item, i) in items" :key="i">
      <span v-if="layout === 'row' && i > 0" class="status__sep">{{ separator }}</span>
      <component :is="layout === 'list' ? 'li' : 'span'" class="status__item" :class="statusClass(item)">
        <span v-if="iconFor(item)" class="status__icon">{{ iconFor(item) }}</span>
        <span v-if="labelFor(item)" class="status__label">{{ labelFor(item) }}</span>
        <span v-if="hasValue(item)" class="status__value">{{ valueFor(item) }}</span>
        <span v-if="unitFor(item)" class="status__unit">{{ unitFor(item) }}</span>
      </component>
    </template>
  </component>
</template>

<script setup>
// The consolidated `status` kind — one renderer, three layouts.
//
// Schema:
//   kind: "status"
//   layout: "tile" | "row" | "list"   (default: "tile" in panels, "row" in the statusbar)
//   data_path: JSON path scoping the payload; an array yields one item per
//              element, anything else yields a single item
//   item: { icon, label, value, unit, status } — each key also accepts a
//         `<key>_path` variant resolved against the item, plus `value_format`
//   separator: string between row items (default "·")
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  context: { type: String, default: "panel" },
});

const layout = computed(() => {
  const declared = props.schema.layout;
  if (declared === "tile" || declared === "row" || declared === "list") return declared;
  return props.context === "statusbar" ? "row" : "tile";
});

const items = computed(() => {
  const scoped = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  if (Array.isArray(scoped)) return scoped;
  return scoped === null || scoped === undefined ? [] : [scoped];
});

const itemSpec = computed(() => props.schema.item || {});
const separator = computed(() => props.schema.separator ?? "·");

function pick(item, pathKey, literalKey, formatKey) {
  const spec = itemSpec.value;
  const raw = spec[pathKey] ? resolvePath(item, spec[pathKey]) : spec[literalKey];
  return formatKey ? applyFormat(raw, spec[formatKey]) : raw;
}

const iconFor = (item) => pick(item, "icon_path", "icon");
const labelFor = (item) => pick(item, "label_path", "label");
const valueFor = (item) => pick(item, "value_path", "value", "value_format");
const unitFor = (item) => pick(item, "unit_path", "unit");

function hasValue(item) {
  const v = valueFor(item);
  return v !== undefined && v !== null && v !== "";
}

function statusClass(item) {
  const spec = itemSpec.value;
  const status = spec.status_path ? resolvePath(item, spec.status_path) : spec.status;
  return status ? `status__item--${status}` : null;
}
</script>

<style scoped>
.status {
  color: var(--text-primary);
}

.status--tile {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.95rem;
}

.status--row {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.status--list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status__sep {
  opacity: 0.4;
}

.status__item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
}

.status__icon {
  font-size: 1.1em;
  line-height: 1;
}

.status__label {
  color: var(--text-secondary);
  font-weight: 500;
}

.status__value {
  font-weight: 600;
  color: var(--text-primary);
}

.status__unit {
  color: var(--text-secondary);
  font-size: 0.85em;
}

.status__item--ok {
  color: var(--accent-success, #2ecc71);
}

.status__item--warn {
  color: var(--accent-warning, #f39c12);
}

.status__item--error {
  color: var(--accent-error, #e74c3c);
}
</style>
