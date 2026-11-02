<template>
  <div class="field-table" :style="tableStyle" data-test="field-table">
    <div class="field-table__body">
      <div v-if="columns.length" class="field-table__head" data-test="field-table-head">
        <span
          v-for="(column, index) in columns"
          :key="index"
          class="field-table__header"
          :class="{ 'field-table__header--label': index === 0 }"
          >{{ column.label }}</span
        >
      </div>
      <div v-for="(row, index) in rows" :key="row.key ?? index" class="field-table__row">
        <span class="field-table__label">{{ row.label }}</span>
        <div class="field-table__cells">
          <slot :row="row" :index="index" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

// A compact "same fields per row" editor (docs/design/2026-11-01-screen-schedule.md
// §2.2): one header row, then label + controls per row. The screen schedule is
// its first user; any later editor with the same shape reuses it. Row height is
// the touch target, cells sit --gap-inline apart, headers are --text-meta, and
// when the table is narrower than 340px (a 360px viewport) the label stacks
// above its controls.
//
// `columns` describes the header row: [{ label: "On", width: "7rem" }, …]. The
// first column is the row label. A column without `width` takes 1fr, so the row
// shares one grid between the header and every row (cells never misalign).
const props = defineProps({
  // Each row needs a `label`; an optional `key` keeps object identity stable.
  rows: { type: Array, required: true },
  columns: { type: Array, default: () => [] },
  // The day-label column in the schedule table is 4.5rem, fitting 390px.
  labelWidth: { type: String, default: "4.5rem" },
});

const tableStyle = computed(() => {
  const widths = props.columns.slice(1).map(column => column.width || "minmax(0, 1fr)");
  return {
    "--field-table-columns": `${props.labelWidth} ${widths.join(" ") || "minmax(0, 1fr)"}`,
  };
});
</script>

<style scoped>
/* The query container is the outer block; keeping the flex column and the
   grid inside it lets the tracks shrink (a container on the flex column made
   Chromium size them at max-content and overflow the phone). */
.field-table {
  container-type: inline-size;
}

.field-table__body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
  padding: 0 var(--panel-pad-x) var(--panel-pad-y);
}

.field-table__head,
.field-table__row {
  display: grid;
  /* The row is a flex child: without min-width: 0 it refuses to shrink below
     its tracks' min-content and the table scrolls sideways on a phone. */
  min-width: 0;
  grid-template-columns: var(--field-table-columns);
  align-items: center;
  gap: var(--gap-inline);
}

.field-table__head {
  padding-bottom: var(--gap-1);
}

.field-table__header {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  font-weight: var(--weight-strong);
  color: var(--ink-2);
}

.field-table__row {
  min-height: var(--touch-target);
}

.field-table__label {
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

/* The slot's children land directly in the row's grid columns; anything it
   marks as spanning (the "Off all day" copy) crosses the remaining cells. */
.field-table__cells {
  display: contents;
}

.field-table :slotted(.field-table__span) {
  grid-column: span 2;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink-3);
}

.field-table :slotted(.field-table__note) {
  grid-column: 1 / -1;
}

/* When the table is too narrow for a label and two time fields (a 360px
   viewport leaves ~328px inside the panel), stack. The query is on the
   table's own box, so a narrow two-pane detail stacks even on a wide screen. */
@container (max-width: 340px) {
  .field-table__head {
    display: none;
  }

  .field-table__row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--gap-1);
  }

  .field-table__cells {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-inline);
  }

  .field-table :slotted(.field-table__span) {
    flex: 1 1 100%;
  }

  .field-table :slotted(.field-table__note) {
    flex: 1 1 100%;
  }
}
</style>
