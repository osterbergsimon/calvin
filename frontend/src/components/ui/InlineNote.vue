<template>
  <p class="inline-note" :class="`inline-note--${toneClass}`">
    <span v-if="toneIcon" class="inline-note__icon" aria-hidden="true">
      <svg class="inline-note__glyph" viewBox="0 0 24 24">
        <path :d="toneIcon" fill="currentColor" />
      </svg>
    </span>
    <span class="inline-note__text"><slot /></span>
    <span v-if="$slots.action" class="inline-note__action"><slot name="action" /></span>
  </p>
</template>

<script setup>
import { computed } from "vue";
import { mdiAlert, mdiCheck, mdiCloseCircle } from "@mdi/js";

// The one-line note under a row: a hint, a warning or an error. Settings blocks
// use it instead of styling their own paragraph (docs/design/frontend-doctrine.md
// §3.1), so every hint in a panel has the same size and ink.
//
// Status is never colour alone: ok/warn/err carry a decorative 14px icon before
// the text (the themes audit's D2 rule). The word still says what the state is,
// and the icon is aria-hidden so a screen reader hears the sentence once.
const props = defineProps({
  tone: {
    type: String,
    default: "neutral",
    // ok is for a note that confirms something; status colours never decorate,
    // so a plugin type or a category is not a tone.
    validator: value => ["neutral", "ok", "warn", "err"].includes(value),
  },
});

const TONE_ICONS = {
  ok: mdiCheck,
  warn: mdiAlert,
  err: mdiCloseCircle,
};

const toneClass = computed(() =>
  ["neutral", "ok", "warn", "err"].includes(props.tone) ? props.tone : "neutral"
);

const toneIcon = computed(() => TONE_ICONS[toneClass.value] || null);
</script>

<style scoped>
.inline-note {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
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

.inline-note__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  /* 14px, centred on the first line of the note. */
  margin-top: 0.1rem;
}

.inline-note__glyph {
  width: 0.875rem;
  height: 0.875rem;
  fill: currentColor;
}

.inline-note__action {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-tight) var(--gap-inline);
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
