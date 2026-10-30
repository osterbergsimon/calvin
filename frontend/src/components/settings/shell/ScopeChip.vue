<template>
  <span class="setting-scope-chip device-chip">This screen</span>
</template>

<script setup>
// The scope chip for a row that only changes the browser you are holding
// (settings copy audit §2). Every row without it applies to all screens, so
// the default row carries no marker. The label is fixed: the chip IS the
// statement, and the row's description never repeats "this device".
</script>

<style scoped>
.setting-scope-chip {
  display: inline-block;
  margin-left: 8px;
  padding: 0 6px;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
  font-weight: 500;
  vertical-align: 2px;
  white-space: nowrap;
}
</style>
