<template>
  <div
    class="clock-bar-chip"
    :class="[`clock-bar-chip--${kind}`, { 'is-editable': editable, 'is-selected': selected }]"
    :data-part-id="partId"
    :data-zone="zone"
  >
    <button
      v-if="editable"
      type="button"
      class="clock-bar-chip__hit"
      :aria-label="label"
      :aria-pressed="selected ? 'true' : 'false'"
      @click.stop="$emit('select', partId)"
    />
    <span class="clock-bar-chip__body" :inert="editable || undefined"><slot /></span>
  </div>
</template>

<script setup>
// The clock bar's own chip wrapper (§7 item 4): the editor gets focus,
// selection and a drag handle without a second renderer. On the dashboard
// `editable` is false, so this adds no layout, no focus stop and no inertness.
defineOptions({ name: "ClockBarPartChip" });

defineProps({
  partId: { type: String, required: true },
  kind: { type: String, default: "part" },
  label: { type: String, default: "" },
  zone: { type: String, default: "" },
  selected: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
});

defineEmits(["select"]);
</script>

<style scoped>
.clock-bar-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.clock-bar-chip.is-editable {
  border-radius: var(--radius-control);
  outline: 1px dashed transparent;
  outline-offset: 2px;
}

.clock-bar-chip.is-editable:hover {
  outline-color: color-mix(in srgb, var(--focus) 40%, transparent);
}

.clock-bar-chip.is-editable.is-selected {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.clock-bar-chip__body {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

/* The real button sits over the part: the part underneath is inert while the
   editor is open, so its own controls cannot fire behind the chip. */
.clock-bar-chip__hit {
  position: absolute;
  inset: -2px;
  z-index: var(--z-raised);
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}

.clock-bar-chip__hit:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
