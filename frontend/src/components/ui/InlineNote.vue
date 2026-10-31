<template>
  <p class="inline-note" :class="`inline-note--${toneClass}`">
    <span class="inline-note__text"><slot /></span>
    <span v-if="$slots.action" class="inline-note__action"><slot name="action" /></span>
  </p>
</template>

<script setup>
import { computed } from "vue";

// The one-line note under a row: a hint, a warning or an error. Settings blocks
// use it instead of styling their own paragraph (docs/design/frontend-doctrine.md
// §3.1), so every hint in a panel has the same size and ink.
const props = defineProps({
  tone: {
    type: String,
    default: "neutral",
    // ok is for a note that confirms something; status colours never decorate,
    // so a plugin type or a category is not a tone.
    validator: value => ["neutral", "ok", "warn", "err"].includes(value),
  },
});

const toneClass = computed(() =>
  ["neutral", "ok", "warn", "err"].includes(props.tone) ? props.tone : "neutral"
);
</script>

<style scoped>
.inline-note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--gap-tight) var(--gap-inline);
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-2);
}

.inline-note__text {
  min-width: 0;
}

.inline-note__action {
  display: inline-flex;
  align-items: center;
}

.inline-note--ok {
  color: var(--ok-text);
}

.inline-note--warn {
  color: var(--warn-text);
}

.inline-note--err {
  color: var(--err-text);
}
</style>
