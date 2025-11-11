<template>
  <div class="plugin-field">
    <label>{{ (schema && typeof schema === 'object' && schema.description) || fieldKey }}</label>
    
    <!-- Directory input with browse button -->
    <div v-if="ui && ui.component === 'directory'" class="directory-input">
      <input
        type="text"
        :value="value"
        :placeholder="ui.placeholder || 'Select directory...'"
        class="form-input"
        @input="$emit('update', $event.target.value)"
      />
      <input
        v-if="ui.browse_button"
        ref="fileInputRef"
        type="file"
        class="file-input-hidden"
        :data-plugin-id="pluginId"
        :data-config-key="fieldKey"
        @change="handleDirectorySelect"
      />
      <button
        v-if="ui.browse_button"
        type="button"
        class="btn-secondary"
        @click="browseDirectory"
      >
        Browse
      </button>
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
    
    <!-- Fallback: Default input based on schema type -->
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'string'"
      type="text"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'password'"
      type="password"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    
    <!-- Help text and links -->
    <span v-if="ui && (ui.help_text || ui.help_link)" class="help-text" style="display: block; margin-top: 0.5rem;">
      <span v-if="ui.help_text">{{ ui.help_text }}</span>
      <a
        v-if="ui.help_link"
        :href="ui.help_link"
        target="_blank"
        rel="noopener noreferrer"
        style="color: var(--accent-color); text-decoration: underline;"
      >
        {{ ui.help_link }}
      </a>
    </span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

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
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update']);

const fileInputRef = ref(null);

const ui = computed(() => {
  return props.schema && typeof props.schema === 'object' ? props.schema.ui : null;
});

const browseDirectory = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  } else {
    // Fallback to querySelector if ref not available
    const targetInput = document.querySelector(
      `input[type="file"][data-plugin-id="${props.pluginId}"][data-config-key="${props.fieldKey}"]`
    );
    if (targetInput) {
      targetInput.click();
    } else {
      console.error(`Could not find file input for ${props.pluginId}.${props.fieldKey}`);
    }
  }
};

const handleDirectorySelect = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    let directoryPath = '';
    
    if (file.path) {
      // Electron environment
      const pathString = file.path;
      const lastSlash = Math.max(pathString.lastIndexOf('/'), pathString.lastIndexOf('\\'));
      if (lastSlash !== -1) {
        directoryPath = pathString.substring(0, lastSlash);
      }
    } else if (file.webkitRelativePath) {
      // When using webkitdirectory
      const parts = file.webkitRelativePath.split('/');
      parts.pop();
      directoryPath = parts.join('/');
    } else {
      alert('Browser security restrictions prevent automatic directory selection. Please enter the directory path manually, or use the file picker to select a file from the desired directory.');
      event.target.value = '';
      return;
    }
    
    if (directoryPath) {
      emit('update', directoryPath);
    }
    
    event.target.value = '';
  }
};
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
</style>

