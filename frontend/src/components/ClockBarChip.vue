<template>
  <div
    v-if="editable"
    class="clock-bar-chip"
    :class="{ 'is-selected': selected }"
    role="button"
    tabindex="0"
    :aria-label="label"
    :aria-pressed="selected ? 'true' : 'false'"
    :data-part-id="partId"
    :data-zone="zone"
    :data-index="index"
    @click.stop="$emit('select', partId)"
    @keydown.enter.prevent="$emit('select', partId)"
    @keydown.space.prevent="$emit('select', partId)"
    @keydown.left.prevent="$emit('move', { partId, direction: 'left' })"
    @keydown.right.prevent="$emit('move', { partId, direction: 'right' })"
    @keydown.up.prevent="$emit('move', { partId, direction: 'up' })"
    @keydown.down.prevent="$emit('move', { partId, direction: 'down' })"
  >
    <slot />
  </div>
  <slot v-else />
</template>

<script setup>
// A part in the editor's stage. In the real bar it disappears and the part
// renders exactly as it does on the dashboard; in the editor it becomes the
// focusable, selectable chip (docs/design/2026-11-04-clock-bar-editor.md §7.4).
defineOptions({ name: "ClockBarChip" });
defineProps({
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  partId: { type: String, required: true },
  zone: { type: String, default: "" },
  index: { type: Number, default: 0 },
  count: { type: Number, default: 1 },
  label: { type: String, default: "" },
});
defineEmits(["select", "move"]);
</script>

<style scoped>
.clock-bar-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-1);
  min-height: 2.5rem;
  padding: 0.15rem 0.45rem;
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--ink-3) 55%, transparent);
  border-radius: var(--radius-control);
  color: inherit;
  font: inherit;
  cursor: grab;
  touch-action: none;
}

.clock-bar-chip.is-selected {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 35%, transparent);
}

.clock-bar-chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
