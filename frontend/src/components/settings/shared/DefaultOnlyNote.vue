<!-- frontend/src/components/settings/shared/DefaultOnlyNote.vue -->
<template>
  <p class="default-only__note" data-test="default-only-note">Applies to every screen</p>
</template>

<script setup>
// Marks a Default row that no screen can override (Default-is-a-screen §3):
// Timezone, the reboot combo, and the keyboard layout rows.
</script>

<style scoped>
.default-only__note {
  margin: 0.15rem 0 0;
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--ink-3);
}
</style>
