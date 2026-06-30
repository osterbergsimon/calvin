<template>
  <div class="setting-item">
    <label v-if="label" :for="inputId || undefined">
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
  inputId: {
    type: String,
    default: null,
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
  color: var(--ink);
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
  font-family: var(--font-ui);
}

.setting-control {
  margin-bottom: 0.5rem;
}

/* Input and select styling to match app */
.setting-item input[type="text"],
.setting-item input[type="number"],
.setting-item input[type="time"],
.setting-item input[type="email"],
.setting-item input[type="url"],
.setting-item select,
.setting-item textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  min-height: 44px;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
  transition: all 0.2s;
}

.setting-item input[type="text"]:focus,
.setting-item input[type="number"]:focus,
.setting-item input[type="time"]:focus,
.setting-item input[type="email"]:focus,
.setting-item input[type="url"]:focus,
.setting-item select:focus,
.setting-item textarea:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}

.setting-item input[type="text"]:hover,
.setting-item input[type="number"]:hover,
.setting-item input[type="time"]:hover,
.setting-item input[type="email"]:hover,
.setting-item input[type="url"]:hover,
.setting-item select:hover,
.setting-item textarea:hover {
  border-color: var(--focus);
}

.setting-item input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
  accent-color: var(--focus);
}

.setting-item select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

.help-text {
  display: block;
  font-size: 0.875rem;
  color: var(--ink-2);
  margin-top: 0.25rem;
  line-height: 1.4;
}

.required-indicator {
  color: var(--focus);
  margin-left: 0.25rem;
}
</style>
