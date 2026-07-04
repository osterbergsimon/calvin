<template>
  <div
    class="kbt"
    :class="{ 'kbt--conflict': conflict, 'kbt--empty': !action, 'kbt--hint-open': hintOpen }"
  >
    <div class="kbt-key">{{ keyLabel }}</div>
    <div class="kbt-action">{{ action ? actionLabel(action) : "unassigned" }}</div>
    <div class="kbt-actions">
      <button
        class="kbt-btn"
        data-role="edit"
        :aria-label="`Change ${keyLabel}`"
        @click="$emit('edit')"
      >
        ✎
      </button>
      <button
        v-if="action"
        class="kbt-btn"
        data-role="clear"
        :aria-label="`Clear ${keyLabel}`"
        @click="$emit('clear')"
      >
        ×
      </button>
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
        !
      </button>
      <span class="kbt-hint" role="tooltip">{{ conflictHint }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { actionLabel } from "@/utils/keyboardActionsCatalog";
import { formatKeyLabel } from "@/utils/keyCode";

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
  border-radius: 8px;
  min-height: var(--touch-target);
}
.kbt--empty {
  border-style: dashed;
}
.kbt--conflict {
  border-color: var(--warn);
}
.kbt-key {
  font-family: var(--font-data);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--ink);
}
.kbt-action {
  font-size: 0.75rem;
  color: var(--ink-2);
  text-align: center;
  line-height: 1.2;
}
.kbt-actions {
  display: flex;
  gap: 6px;
}
.kbt-btn {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink-2);
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  cursor: pointer;
}
.kbt-btn:hover {
  border-color: var(--focus);
  color: var(--ink);
}
.kbt-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
/* Conflict badge — a tappable "!" that reveals the hint on touch;
   hover/focus reveal it for pointer & keyboard users (see below). */
.kbt-conflict-badge {
  position: absolute;
  top: 5px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  font-family: var(--font-data);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  color: var(--focus-ink);
  background: var(--warn);
  border: none;
  border-radius: 50%;
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
  font-size: 0.72rem;
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
