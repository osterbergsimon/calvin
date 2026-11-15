<template>
  <div class="setting-row-stack"><slot /></div>
</template>
<script setup>
// Rows that a child component renders itself (RebootCombo, KeyboardTab) arrive
// as a fragment, so SettingRow's own `.setting-row + .setting-row` divider
// stops at the boundary. This wrapper carries the divider for its first row and
// between two stacks, the way the shell owns settings visuals
// (docs/design/frontend-doctrine.md §3.1) — a category composes rows, it does
// not style them.
</script>
<style scoped>
.setting-row + .setting-row-stack,
.setting-row-stack + .setting-row-stack {
  border-top: 1px solid var(--line-soft);
}
</style>
