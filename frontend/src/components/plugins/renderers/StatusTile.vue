<template>
  <div class="status-tile" :class="statusClass">
    <span v-if="icon" class="status-tile__icon">{{ icon }}</span>
    <span v-if="label" class="status-tile__label">{{ label }}</span>
    <span v-if="hasValue" class="status-tile__value">{{ value }}</span>
    <span v-if="unit" class="status-tile__unit">{{ unit }}</span>
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

const scopedData = computed(() =>
  props.schema.data_path ? resolvePath(props.data, props.schema.data_path) : props.data
);

const icon = computed(() =>
  props.schema.icon_path ? resolvePath(scopedData.value, props.schema.icon_path) : props.schema.icon
);

const label = computed(() =>
  props.schema.label_path
    ? resolvePath(scopedData.value, props.schema.label_path)
    : props.schema.label
);

const value = computed(() => {
  const raw = props.schema.value_path
    ? resolvePath(scopedData.value, props.schema.value_path)
    : props.schema.value;
  return applyFormat(raw, props.schema.value_format);
});

const hasValue = computed(
  () => value.value !== undefined && value.value !== null && value.value !== ""
);

const unit = computed(() =>
  props.schema.unit_path ? resolvePath(scopedData.value, props.schema.unit_path) : props.schema.unit
);

const statusClass = computed(() => {
  const status = props.schema.status_path
    ? resolvePath(scopedData.value, props.schema.status_path)
    : props.schema.status;
  if (!status) return null;
  return `status-tile--${status}`;
});
</script>

<style scoped>
.status-tile {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.status-tile__icon {
  font-size: 1.1em;
  line-height: 1;
}

.status-tile__label {
  color: var(--text-secondary);
  font-weight: 500;
}

.status-tile__value {
  font-weight: 600;
}

.status-tile__unit {
  color: var(--text-secondary);
  font-size: 0.85em;
}

.status-tile--ok {
  color: var(--accent-success, #2ecc71);
}

.status-tile--warn {
  color: var(--accent-warning, #f39c12);
}

.status-tile--error {
  color: var(--accent-error, #e74c3c);
}
</style>
