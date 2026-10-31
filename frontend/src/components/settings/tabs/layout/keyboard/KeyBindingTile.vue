<template>
  <div
    class="kbt"
    :class="{ 'kbt--conflict': conflict, 'kbt--empty': !action, 'kbt--hint-open': hintOpen }"
  >
    <div class="kbt-key">{{ keyLabel }}</div>
    <div class="kbt-action">{{ action ? actionLabel(action) : "unassigned" }}</div>
    <div class="kbt-actions">
      <IconButton size="md" data-role="edit" :label="`Change ${keyLabel}`" @click="$emit('edit')">
        <svg class="kbt-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="mdiPencil" fill="currentColor" />
        </svg>
      </IconButton>
      <IconButton
        v-if="action"
        size="md"
        data-role="clear"
        :label="`Clear ${keyLabel}`"
        @click="$emit('clear')"
      >
        <svg class="kbt-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="mdiClose" fill="currentColor" />
        </svg>
      </IconButton>
    </div>
    <template v-if="conflict">
      <button
        type="button"
        class="kbt-conflict-badge"
        :aria-label="conflictHint"
        :aria-expanded="hintOpen"
        @click="hintOpen = !hintOpen"
        @blur="hintOpen = false"
      >
        <Tag count tone="warn">!</Tag>
      </button>
      <span class="kbt-hint" role="tooltip">{{ conflictHint }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { mdiClose, mdiPencil } from "@mdi/js";
import IconButton from "@/components/ui/IconButton.vue";
import { actionLabel } from "@/utils/keyboardActionsCatalog";
import { formatKeyLabel } from "@/utils/keyCode";
import Tag from "@/components/ui/Tag.vue";

const props = defineProps({
  keyCode: { type: String, required: true },
  action: { type: String, default: null },
  conflict: { type: Boolean, default: false },
  // Other keys bound to the same action — named in the hint.
  conflictKeys: { type: Array, default: () => [] },
});
defineEmits(["edit", "clear"]);

const keyLabel = computed(() => formatKeyLabel(props.keyCode));

// Tap-to-reveal state for touch; hover/focus reveal is handled in CSS.
const hintOpen = ref(false);

const conflictHint = computed(() => {
  const labels = props.conflictKeys.map(formatKeyLabel);
  if (labels.length === 0) return "Also bound to another key.";
  const keys =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Same action is also on ${keys}.`;
});
</script>

<style scoped>
.kbt {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  min-height: var(--touch-target);
}
.kbt--empty {
  border-style: dashed;
}
.kbt--conflict {
  border-color: var(--warn-text);
}
.kbt-key {
  font-family: var(--font-data);
  font-weight: var(--weight-title);
  font-size: var(--fs-lg);
  color: var(--ink);
}
.kbt-action {
  font-size: var(--fs-2xs);
  color: var(--ink-2);
  text-align: center;
  line-height: 1.2;
}
.kbt-actions {
  display: flex;
  gap: 6px;
}
.kbt-glyph {
  width: 1em;
  height: 1em;
}
/* Conflict badge — a tappable "!" that reveals the hint on touch;
   hover/focus reveal it for pointer & keyboard users (see below). */
.kbt-conflict-badge {
  position: absolute;
  top: var(--space-3xs);
  right: var(--space-xs);
  padding: 0;
  background: transparent;
  border: 0;
  cursor: help;
}
.kbt-conflict-badge:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Hint bubble — inverted tooltip, high-contrast in either theme. */
.kbt-hint {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 5;
  /* Size to content (not the narrow tile), wrapping only when very long. */
  width: max-content;
  max-width: 14rem;
  padding: 0.35rem 0.5rem;
  background: var(--ink);
  color: var(--bg-1);
  font-family: var(--font-ui);
  font-size: var(--fs-micro);
  line-height: 1.3;
  text-align: center;
  border-radius: var(--radius-xs);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ink) 34%, transparent);
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, 4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  pointer-events: none;
}
/* Little caret pointing down at the tile. */
.kbt-hint::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--ink);
}
.kbt--conflict:hover .kbt-hint,
.kbt--conflict:focus-within .kbt-hint,
.kbt--hint-open .kbt-hint {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .kbt-hint {
    transition: none;
  }
}
</style>
