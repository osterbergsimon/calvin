<template>
  <!-- list: the quiet table — label left, value right, hairline rows -->
  <ul v-if="layout === 'list'" class="status status--list calvin-plugin-list">
    <li
      v-for="(item, i) in items"
      :key="i"
      class="status__line calvin-plugin-row"
      :class="readoutClass(item)"
    >
      <span class="status__line-label calvin-plugin-readout__label">
        <span v-if="isAlert(item)" class="calvin-plugin-lamp" />
        <span v-if="iconFor(item)" class="status__icon">{{ iconFor(item) }}</span>
        {{ labelFor(item) }}
      </span>
      <span class="status__line-value calvin-plugin-readout__value">
        {{ valueFor(item)
        }}<span v-if="unitFor(item)" class="status__line-unit">{{ unitFor(item) }}</span>
      </span>
    </li>
  </ul>

  <!-- row: inline instrument strip with hairline dividers (statusbar default) -->
  <span v-else-if="layout === 'row'" class="status status--row">
    <span v-for="(item, i) in items" :key="i" class="status__cell" :class="readoutClass(item)">
      <span v-if="isAlert(item)" class="calvin-plugin-lamp" />
      <span v-if="iconFor(item)" class="status__icon">{{ iconFor(item) }}</span>
      <span v-if="labelFor(item)" class="status__cell-label calvin-plugin-readout__label">
        {{ labelFor(item) }}
      </span>
      <span v-if="hasValue(item)" class="status__cell-value calvin-plugin-readout__value">
        {{ valueFor(item)
        }}<span v-if="unitFor(item)" class="status__cell-unit">{{ unitFor(item) }}</span>
      </span>
    </span>
  </span>

  <!-- tile: full readouts, side by side -->
  <div v-else class="status status--tile">
    <div
      v-for="(item, i) in items"
      :key="i"
      class="calvin-plugin-readout"
      :class="readoutClass(item)"
    >
      <span class="calvin-plugin-readout__label">
        <span v-if="isAlert(item)" class="calvin-plugin-lamp" />
        <span v-if="iconFor(item)" class="status__icon">{{ iconFor(item) }}</span>
        {{ labelFor(item) }}
      </span>
      <span v-if="hasValue(item)" class="calvin-plugin-readout__value">
        {{ valueFor(item)
        }}<span v-if="unitFor(item)" class="calvin-plugin-readout__unit">{{ unitFor(item) }}</span>
      </span>
    </div>
  </div>
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
//         `<key>_path` variant resolved against the item, plus `value_format`.
//         status values: "ok" (renders monochrome) | "warn" | "error"
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

function statusFor(item) {
  const spec = itemSpec.value;
  return spec.status_path ? resolvePath(item, spec.status_path) : spec.status;
}

// Color appears only when something needs attention: "ok" stays monochrome.
// The tint itself lives in the plugin readout vocabulary (main.css), so no
// layout draws its own warning or error colours.
function isAlert(item) {
  const s = statusFor(item);
  return s === "warn" || s === "error";
}

function readoutClass(item) {
  const s = statusFor(item);
  if (s === "warn") return "calvin-plugin-readout--warn";
  if (s === "error") return "calvin-plugin-readout--error";
  return null;
}
</script>

<style scoped>
/* tile: readouts side by side */
.status--tile {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--gap-4) var(--gap-8);
}

/* row: inline strip, hairline dividers between cells */
.status--row {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.status__cell {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0 0.65rem;
  white-space: nowrap;
}

.status__cell:first-child {
  padding-left: 0;
}

.status__cell:last-child {
  padding-right: 0;
}

.status__cell + .status__cell {
  border-left: 1px solid var(--line-soft);
}

/* Scale the microlabel with content only in a scaled panel — StatusRenderer also
   renders in the statusbar (non-scaled), where the label must keep its fixed rem. */
.schema-renderer__body--scaled .status__cell-label {
  font-size: 0.7em;
}

/* The readout vocabulary owns the type and colour; these rules only set the
   small variant the compact layouts use. */
.status__cell-value,
.status__line-value {
  font-size: var(--plugin-value-size-sm);
}

.status__cell-unit,
.status__line-unit {
  font-size: 0.75em;
  font-weight: var(--weight-strong);
  color: var(--ink-3);
  margin-left: 0.1em;
}

/* list rows */
.status--list {
  width: 100%;
}

.status__line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--gap-4);
  min-width: 0;
}

.status__icon {
  font-size: 1.1em;
  line-height: 1;
}

/* the lamp sits on the baseline row of whatever it's in */
.calvin-plugin-lamp {
  align-self: center;
}
</style>
