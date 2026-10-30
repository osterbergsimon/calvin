<template>
  <div class="setting-row" :class="{ 'setting-row--stacked': stacked }">
    <div class="setting-row__info">
      <div class="setting-row__label">
        <span v-if="statusDot" class="setting-row__dot" aria-hidden="true"></span>
        {{ label }}<slot name="label-extra" />
      </div>
      <slot name="description">
        <p v-if="description" class="setting-row__desc">{{ description }}</p>
      </slot>
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
  // A small --ok dot before the label (e.g. "Signed in on this device").
  statusDot: { type: Boolean, default: false },
});
</script>
<style scoped>
.setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  row-gap: 0.75rem;
  min-height: 4.5rem; /* 72px */
  padding: 0.75rem 1.25rem;
}
.setting-row + .setting-row {
  border-top: 1px solid var(--line-soft);
}
.setting-row__info {
  min-width: 0;
}
.setting-row__label {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 500;
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
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
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
</style>
