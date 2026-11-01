<template>
  <div
    class="screens-layout"
    :class="{
      'screens--detail': detail,
      'screens--two-pane': detail && !narrow,
      'screens--single-pane': detail && narrow,
    }"
  >
    <div class="screens-layout__list"><slot name="list" /></div>
    <div v-if="detail" class="screens-layout__detail" data-test="screens-detail">
      <slot />
    </div>
  </div>
</template>

<script setup>
// The Screens category's two-pane layout (docs/design/frontend-doctrine.md §4):
// the list sits beside the selected page on a kiosk-width screen, and the list
// hides on a phone so the page gets the whole width. Layout only — the category
// itself carries no style block.
defineProps({
  detail: { type: Boolean, default: false },
  narrow: { type: Boolean, default: false },
});
</script>

<style scoped>
.screens-layout {
  display: block;
}

.screens--two-pane {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--gap-6);
  align-items: start;
}

.screens--single-pane .screens-layout__list {
  display: none;
}

.screens-layout__list,
.screens-layout__detail {
  min-width: 0;
}

/* Stacked screen rows keep their breathing room without a per-feature class. */
.screens-layout__list :deep(.screens-list-items) > * + * {
  margin-top: var(--gap-3);
}

/* A note at the end of a panel gets the panel's own inset. */
.screens-layout__detail :deep(.screens-saved) {
  margin: var(--panel-pad-y) var(--panel-pad-x);
}
</style>
