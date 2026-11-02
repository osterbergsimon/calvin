<template>
  <Tag class="setting-scope-chip">This screen</Tag>
</template>

<script setup>
import Tag from "@/components/ui/Tag.vue";
// The scope chip for a row that only changes the browser you are holding
// (settings copy audit §2). Every row without it applies to all screens, so
// the default row carries no marker. The label is fixed: the chip IS the
// statement, and the row's description never repeats "this device".
</script>

<style scoped>
.setting-scope-chip {
  margin-left: var(--space-sm);
  vertical-align: 2px;
}
</style>
