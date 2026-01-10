<template>
  <div class="settings-tab">
    <div v-if="title" class="tab-header">
      <h3>{{ title }}</h3>
      <p v-if="description" class="tab-description">
        {{ description }}
      </p>
    </div>
    <div class="tab-content">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    default: null,
  },
});
</script>

<style scoped>
.settings-tab {
  width: 100%;
}

.tab-header {
  margin-bottom: 1.5rem;
}

.tab-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tab-description {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.tab-content {
  width: 100%;
}
</style>
