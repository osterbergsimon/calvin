<template>
  <div class="metric-dashboard calvin-plugin-grid" :style="gridStyle">
    <div
      v-for="(metric, i) in metrics"
      :key="i"
      class="metric-dashboard__tile calvin-plugin-surface calvin-plugin-metric calvin-plugin-readout"
      :class="statusClass(metric)"
    >
      <span class="calvin-plugin-readout__label">
        <span v-if="isAlert(metric)" class="calvin-plugin-lamp" />
        <span v-if="iconFor(metric)" class="metric-dashboard__icon">{{ iconFor(metric) }}</span>
        {{ labelFor(metric) }}
      </span>
      <span class="calvin-plugin-readout__value metric-dashboard__value">
        {{ valueFor(metric)
        }}<span v-if="unitFor(metric)" class="calvin-plugin-readout__unit">{{
          unitFor(metric)
        }}</span>
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

function statusFor(metric) {
  const spec = tileSpec.value;
  return spec.status_path ? resolvePath(metric, spec.status_path) : spec.status;
}

function isAlert(metric) {
  const s = statusFor(metric);
  return s === "warn" || s === "error";
}

function statusClass(metric) {
  const s = statusFor(metric);
  if (s === "warn") return "calvin-plugin-readout--warn";
  if (s === "error") return "calvin-plugin-readout--error";
  return null;
}
</script>

<style scoped>
.metric-dashboard__tile {
  justify-content: center;
  gap: 0.45rem;
}

.metric-dashboard__icon {
  font-size: 1.2em;
  line-height: 1;
}

.metric-dashboard__value {
  font-size: var(--plugin-value-size-lg);
}
</style>
