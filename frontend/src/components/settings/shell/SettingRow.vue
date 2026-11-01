<template>
  <div
    class="setting-row"
    :class="{ 'setting-row--stacked': stacked, 'setting-row--flush': flush }"
  >
    <div class="setting-row__info">
      <div class="setting-row__label">
        <span v-if="statusDot" class="setting-row__dot" aria-hidden="true"></span>
        {{ label }}<slot name="label-extra" />
      </div>
      <div v-if="description || $slots.description" class="setting-row__desc">
        <slot name="description">{{ description }}</slot>
      </div>
    </div>
    <div class="setting-row__control"><slot /></div>
  </div>
</template>
<script setup>
defineProps({
  label: { type: String, required: true },
  description: { type: String, default: "" },
  // Stack the control full-width below the label instead of beside it.
  // Use for wide embedded editors that must not be sized by their own content.
  stacked: { type: Boolean, default: false },
  // A dialog body already pads its content, so its rows must not add the
  // settings-panel inset on top (CLV-80).
  flush: { type: Boolean, default: false },
  // A small --ok dot before the label (e.g. "Signed in on this device").
  statusDot: { type: Boolean, default: false },
});
</script>
<style scoped>
.setting-row {
  display: flex;
  /* Side by side at every width a control up to half the row fits: a long
     description wraps in the left column instead of pushing the control below
     it (docs/design/2026-11-01-screen-schedule.md §4). `stacked` is the opt-in
     for wide controls — chip groups, tables, sliders with a preview. */
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  row-gap: 0.75rem;
  min-height: 4.5rem; /* 72px */
  padding: var(--panel-pad-y) var(--panel-pad-x);
}
.setting-row + .setting-row,
.where-shows + .setting-row {
  border-top: 1px solid var(--line-soft);
}
.setting-row__info {
  flex: 1 1 auto;
  min-width: 0;
}
.setting-row__label {
  font-family: var(--font-ui);
  font-size: var(--fs-base);
  font-weight: var(--weight-strong);
  color: var(--ink);
}
.setting-row__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  vertical-align: middle;
  border-radius: 50%;
  background: var(--ok);
}
.setting-row__desc {
  margin: 0.2rem 0 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-2);
}
/* Slot content (a ScopeLine, an InlineNote) sits on the same description line
   without the browser's paragraph margins. */
.setting-row__desc :slotted(*) {
  display: block;
  margin: 0;
}
.setting-row__control {
  /* A control with intrinsic width (a row of chips, a stepper) must be allowed
     to shrink on a phone: flex-shrink: 0 sized it to max-content and pushed the
     whole settings page 55px wider than a 390px screen (CLV-66). */
  flex-shrink: 1;
  min-width: 0;
  max-width: 100%;
}

.setting-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
}
.setting-row--stacked .setting-row__control {
  flex-shrink: 1;
  width: 100%;
  min-width: 0;
}

.setting-row--flush {
  padding: 0;
}

/* Let the label column shrink before the control wraps below it, so two
   dialog rows with a toggle keep the same label-left / toggle-right layout. */
.setting-row--flush .setting-row__info {
  flex: 1 1 0;
}

/* A phone stacks the control under the label, as every other row does. */
@media (--bp-phone) {
  .setting-row {
    flex-wrap: wrap;
  }
}
</style>
