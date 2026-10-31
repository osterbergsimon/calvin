<!-- frontend/src/components/settings/shared/DefaultEditNote.vue -->
<template>
  <p v-if="visible" class="default-note" data-test="default-override-note" role="status">
    <span class="default-note__text">{{ sentence }}</span>
    <button
      type="button"
      class="default-note__action"
      data-test="default-note-change"
      @click="emit('change-them-too', setting)"
    >
      Change them too
    </button>
    <button
      type="button"
      class="default-note__dismiss"
      aria-label="Dismiss"
      @click="emit('dismiss')"
    >
      ×
    </button>
  </p>
</template>

<script setup>
import { computed } from "vue";
import { SCREEN_SETTING_LABELS, joinNames } from "@/utils/screenOverrides";

// Under the Default row that was just changed: which screens will not pick the
// change up because they have their own value (Default-is-a-screen §5).
const props = defineProps({
  // { key, names } while a note is showing, otherwise null.
  note: { type: Object, default: null },
  // The row this note belongs to.
  setting: { type: String, required: true },
});
const emit = defineEmits(["change-them-too", "dismiss"]);

const visible = computed(() => props.note?.key === props.setting && props.note.names.length > 0);
const sentence = computed(() => {
  const names = props.note?.names || [];
  const label = SCREEN_SETTING_LABELS[props.setting] || props.setting;
  if (names.length === 1) return `${names[0]} keeps its own ${label}.`;
  return `${joinNames(names)} keep their own ${label}.`;
});
</script>

<style scoped>
.default-note {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  margin: 0;
  padding: 0.45rem 1.25rem 0.65rem;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-2);
  background: var(--bg-2);
  border-top: 1px solid var(--line-soft);
}
.default-note__action {
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: inherit;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.default-note__dismiss {
  margin-left: auto;
  padding: 0 0.25rem;
  background: none;
  border: none;
  color: var(--ink-3);
  font-family: var(--font-ui);
  font-size: var(--fs-base);
  line-height: 1;
  cursor: pointer;
}
.default-note__action:focus-visible,
.default-note__dismiss:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
