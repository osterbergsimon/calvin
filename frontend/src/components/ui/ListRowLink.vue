<template>
  <RouterLink :to="to" class="list-row-link" :replace="replace">
    <ListRow :name="name" :meta="meta" :lead="lead" :class="toneClass" chevron>
      <template v-if="$slots.lead" #lead><slot name="lead" /></template>
      <template v-if="$slots.meta" #meta><slot name="meta" /></template>
    </ListRow>
  </RouterLink>
</template>

<script setup>
import { computed } from "vue";
import ListRow from "./ListRow.vue";

// A ListRow that opens a page of its own: phone Settings' category list, a
// screen's sections. A real link (RouterLink), so the phone's back gesture,
// long-press and deep links behave like any other page.
const props = defineProps({
  to: { type: [String, Object], required: true },
  name: { type: String, required: true },
  meta: { type: Array, default: () => [] },
  lead: { type: String, default: "" },
  replace: { type: Boolean, default: false },
  // "danger" for a destructive destination (Remove screen): red name, so it
  // reads apart from the ordinary pages above it.
  tone: { type: String, default: "", validator: v => ["", "danger"].includes(v) },
});

const toneClass = computed(() => (props.tone ? `list-row-link__row--${props.tone}` : ""));
</script>

<style scoped>
.list-row-link {
  display: block;
  color: inherit;
  text-decoration: none;
  border-radius: var(--radius-card);
  -webkit-tap-highlight-color: transparent;
}

.list-row-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.list-row-link :deep(.list-row) {
  min-height: var(--touch-target);
}

.list-row-link:active :deep(.list-row) {
  background: color-mix(in srgb, var(--ink) 8%, var(--bg-2));
}

.list-row-link__row--danger :deep(.list-row__name) {
  color: var(--err-text);
}
</style>
