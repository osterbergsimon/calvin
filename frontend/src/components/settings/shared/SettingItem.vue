<template>
  <div class="setting-item">
    <label v-if="label">
      <slot name="label">
        {{ label }}
      </slot>
    </label>
    <div class="setting-control">
      <slot />
    </div>
    <span v-if="help" class="help-text">
      {{ help }}
    </span>
    <span v-if="required" class="required-indicator">*</span>
  </div>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    default: null,
  },
  help: {
    type: String,
    default: null,
  },
  required: {
    type: Boolean,
    default: false,
  },
});
</script>

<style scoped>
.setting-item {
  margin-bottom: 1.5rem;
}

.setting-item label {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.setting-control {
  margin-bottom: 0.5rem;
}

.help-text {
  display: block;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  line-height: 1.4;
}

.required-indicator {
  color: var(--accent-primary);
  margin-left: 0.25rem;
}
</style>
