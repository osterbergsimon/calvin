<template>
  <div class="plugin-field">
    <label>{{
      (schema && typeof schema === "object" && schema.description) || fieldKey
    }}</label>

    <!-- Directory input (no browse button - directory browser removed) -->
    <div v-if="ui && ui.component === 'directory'" class="directory-input">
      <input
        type="text"
        :value="value"
        :placeholder="ui.placeholder || 'Enter directory path...'"
        class="form-input"
        @input="$emit('update', $event.target.value)"
      />
    </div>

    <!-- Text input -->
    <input
      v-else-if="ui && ui.component === 'input'"
      type="text"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Password input -->
    <input
      v-else-if="ui && ui.component === 'password'"
      type="password"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Number input -->
    <input
      v-else-if="ui && ui.component === 'number'"
      type="number"
      :value="value"
      :min="ui.min"
      :max="ui.max"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Select dropdown -->
    <select
      v-else-if="ui && ui.component === 'select'"
      :value="value"
      class="form-input"
      @change="$emit('update', $event.target.value)"
    >
      <option
        v-for="option in ui.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label || option.value }}
      </option>
    </select>

    <!-- Textarea -->
    <textarea
      v-else-if="ui && ui.component === 'textarea'"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      rows="3"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Checkbox -->
    <label
      v-else-if="
        (ui && ui.component === 'checkbox') ||
        (schema && typeof schema === 'object' && schema.type === 'boolean')
      "
      class="checkbox-label"
    >
      <input
        type="checkbox"
        :checked="
          value === true || value === 'true' || value === 1 || value === '1'
        "
        class="checkbox-input"
        @change="$emit('update', $event.target.checked)"
      />
      <span class="checkbox-text">
        {{
          ui && ui.help_text
            ? ui.help_text
            : (schema && schema.description) || fieldKey
        }}
      </span>
    </label>

    <!-- Fallback: Default input based on schema type -->
    <input
      v-else-if="
        schema && typeof schema === 'object' && schema.type === 'string'
      "
      type="text"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    <input
      v-else-if="
        schema && typeof schema === 'object' && schema.type === 'password'
      "
      type="password"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Help text and links -->
    <span
      v-if="ui && (ui.help_text || ui.help_link)"
      class="help-text"
      style="display: block; margin-top: 0.5rem"
    >
      <span v-if="ui.help_text">{{ ui.help_text }}</span>
      <a
        v-if="ui.help_link"
        :href="ui.help_link"
        target="_blank"
        rel="noopener noreferrer"
        style="color: var(--accent-color); text-decoration: underline"
      >
        {{ ui.help_link }}
      </a>
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  pluginId: {
    type: String,
    required: true,
  },
  fieldKey: {
    type: String,
    required: true,
  },
  schema: {
    type: Object,
    default: () => ({}),
  },
  value: {
    type: [String, Boolean, Number],
    default: "",
  },
});

defineEmits(["update"]);

const ui = computed(() => {
  return props.schema && typeof props.schema === "object"
    ? props.schema.ui
    : null;
});
</script>

<style scoped>
.plugin-field {
  margin-bottom: 1rem;
}

.plugin-field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
}

.directory-input {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.directory-input .form-input {
  flex: 1;
}

.file-input-hidden {
  display: none;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.form-input::placeholder {
  color: var(--text-secondary);
}

.help-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  display: block;
}

.help-text a {
  color: var(--accent-color);
  text-decoration: underline;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.checkbox-input {
  width: auto;
  margin: 0;
  cursor: pointer;
}

.checkbox-text {
  color: var(--text-primary);
  font-size: 0.9rem;
}
</style>
