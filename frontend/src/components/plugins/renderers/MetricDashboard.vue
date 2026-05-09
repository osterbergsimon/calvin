<template>
  <div class="metric-dashboard calvin-plugin-grid" :style="gridStyle">
    <div
      v-for="(metric, i) in metrics"
      :key="i"
      class="metric-dashboard__tile calvin-plugin-metric"
      :class="statusClass(metric)"
    >
      <span v-if="iconFor(metric)" class="metric-dashboard__icon">{{ iconFor(metric) }}</span>
      <span v-if="labelFor(metric)" class="metric-dashboard__label">{{ labelFor(metric) }}</span>
      <span class="metric-dashboard__value">
        {{ valueFor(metric)
        }}<span v-if="unitFor(metric)" class="metric-dashboard__unit">{{ unitFor(metric) }}</span>
      </span>
    </div>
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

const metrics = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

const tileSpec = computed(() => props.schema.tile || {});

const gridStyle = computed(() => {
  const cols = props.schema.layout?.columns;
  if (typeof cols === "number") {
    return { gridTemplateColumns: `repeat(${cols}, 1fr)` };
  }
  if (cols === "auto-square") {
    const n = Math.max(metrics.value.length, 1);
    const c = Math.max(Math.ceil(Math.sqrt(n)), 1);
    return { gridTemplateColumns: `repeat(${c}, 1fr)` };
  }
  return { gridTemplateColumns: "repeat(2, 1fr)" };
});

function pick(metric, pathKey, literalKey, formatKey) {
  const spec = tileSpec.value;
  const raw = spec[pathKey] ? resolvePath(metric, spec[pathKey]) : spec[literalKey];
  return formatKey ? applyFormat(raw, spec[formatKey]) : raw;
}

const iconFor = m => pick(m, "icon_path", "icon");
const labelFor = m => pick(m, "label_path", "label");
const valueFor = m => pick(m, "value_path", "value", "value_format");
const unitFor = m => pick(m, "unit_path", "unit");

function statusClass(metric) {
  const spec = tileSpec.value;
  const status = spec.status_path ? resolvePath(metric, spec.status_path) : spec.status;
  return status ? `metric-dashboard__tile--${status}` : null;
}
</script>

<style scoped>
.metric-dashboard {
}

.metric-dashboard__tile {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
  justify-content: center;
}

.metric-dashboard__icon {
  font-size: 1.75rem;
  line-height: 1;
}

.metric-dashboard__label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-dashboard__value {
  font-size: 1.85rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.metric-dashboard__unit {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 0.25rem;
}

.metric-dashboard__tile--ok {
  border-color: var(--accent-success, #2ecc71);
}

.metric-dashboard__tile--warn {
  border-color: var(--accent-warning, #f39c12);
}

.metric-dashboard__tile--error {
  border-color: var(--accent-error, #e74c3c);
}
</style>
