<template>
  <div class="setting-group" :class="{ 'setting-group--list': list }">
    <h3 class="setting-group__title">{{ title }}</h3>
    <slot />
  </div>
</template>

<script setup>
// A sub-heading inside a settings panel (docs/design/frontend-doctrine.md §3.1):
// sentence case at the label role, replacing the hand-written uppercase labels
// that used to live inside individual cards. The rows below keep their own
// SettingRow inset, so the heading lines up with their text.
//
// `list`: the group holds items rather than SettingRows (ListRows and the
// blocks that belong to one, like a QR card): the group then gives them the
// panel inset and the list gap, so a settings tab needs no CSS of its own.
defineProps({
  title: { type: String, required: true },
  list: { type: Boolean, default: false },
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

.setting-group--list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  padding-bottom: var(--panel-pad-y);
}

.setting-group--list :slotted(*) {
  margin-inline: var(--panel-pad-x);
}
</style>
