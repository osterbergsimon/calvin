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

/* Pair a screen: the field and its button share one line, the field taking
   the room and the button sitting on the field's bottom edge. On a phone the
   field takes all the room that is left; a wider list caps it at 14rem so the
   pair says what it does without turning into a search bar. */
.screens-layout :deep(.screens-pair-form) {
  display: flex;
  align-items: flex-end;
  gap: var(--gap-inline);
}

.screens-layout :deep(.screens-pair-form .text-field) {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 14rem;
}

@media (--bp-phone) {
  .screens-layout :deep(.screens-pair-form .text-field) {
    max-width: none;
  }
}
</style>
