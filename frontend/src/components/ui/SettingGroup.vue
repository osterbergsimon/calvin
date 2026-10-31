<template>
  <div class="setting-group">
    <h3 class="setting-group__title">{{ title }}</h3>
    <slot />
  </div>
</template>

<script setup>
// A sub-heading inside a settings panel (docs/design/frontend-doctrine.md §3.1):
// sentence case at the label role, replacing the hand-written uppercase labels
// that used to live inside individual cards. The rows below keep their own
// SettingRow inset, so the heading lines up with their text.
defineProps({
  title: { type: String, required: true },
});
</script>

<style scoped>
.setting-group__title {
  margin: 0;
  padding: var(--panel-pad-y) var(--panel-pad-x) 0;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}
</style>
