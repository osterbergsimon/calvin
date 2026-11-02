<template>
  <svg class="direction-split-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <!-- column layout = regions stacked → two rows; row layout = side by side → two columns -->
    <template v-if="direction === 'column'">
      <rect x="4" y="3.5" width="12" height="5.5" rx="1.6" />
      <rect x="4" y="11" width="12" height="5.5" rx="1.6" />
    </template>
    <template v-else>
      <rect x="3.5" y="4" width="5.5" height="12" rx="1.6" />
      <rect x="11" y="4" width="5.5" height="12" rx="1.6" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  direction: {
    type: String,
    required: true,
    validator: v => ["row", "column"].includes(v),
  },
});
</script>

<style scoped>
.direction-split-icon {
  display: block;
  /* em-based so it tracks the IconButton's font-size (and the Settings-UI-size zoom). */
  width: 1.05em;
  height: 1.05em;
}
</style>
