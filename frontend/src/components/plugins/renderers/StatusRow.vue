<template>
  <span class="status-row">
    <template v-for="(item, i) in items" :key="i">
      <span v-if="i > 0" class="status-row__sep">{{ separator }}</span>
      <span class="status-row__item" :class="statusClass(item)">
        <span v-if="iconFor(item)" class="status-row__icon">{{ iconFor(item) }}</span>
        <span v-if="labelFor(item)" class="status-row__label">{{ labelFor(item) }}</span>
        <span v-if="hasValue(item)" class="status-row__value">{{ valueFor(item) }}</span>
        <span v-if="unitFor(item)" class="status-row__unit">{{ unitFor(item) }}</span>
      </span>
    </template>
  </span>
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
const separator = computed(() => props.schema.separator ?? "·");

function pick(item, pathKey, literalKey, formatKey) {
  const spec = itemSpec.value;
  const raw = spec[pathKey] ? resolvePath(item, spec[pathKey]) : spec[literalKey];
  return formatKey ? applyFormat(raw, spec[formatKey]) : raw;
}

const iconFor = item => pick(item, "icon_path", "icon");
const labelFor = item => pick(item, "label_path", "label");
const valueFor = item => pick(item, "value_path", "value", "value_format");
const unitFor = item => pick(item, "unit_path", "unit");

function hasValue(item) {
  const v = valueFor(item);
  return v !== undefined && v !== null && v !== "";
}

function statusClass(item) {
  const spec = itemSpec.value;
  const status = spec.status_path ? resolvePath(item, spec.status_path) : spec.status;
  return status ? `status-row__item--${status}` : null;
}
</script>

<style scoped>
.status-row {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  font-size: 0.875rem;
  color: var(--text-secondary);
  padding: 0 0.5rem;
}

.status-row__sep {
  opacity: 0.4;
}

.status-row__item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
}

.status-row__icon {
  font-size: 1em;
  line-height: 1;
}

.status-row__label {
  font-weight: 500;
}

.status-row__value {
  font-weight: 600;
  color: var(--text-primary);
}

.status-row__unit {
  font-size: 0.85em;
}

.status-row__item--ok {
  color: var(--accent-success, #2ecc71);
}

.status-row__item--warn {
  color: var(--accent-warning, #e0a84b);
}

.status-row__item--error {
  color: var(--accent-error, #e05c5c);
}
</style>
