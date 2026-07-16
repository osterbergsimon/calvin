<template>
  <div class="plugin-field">
    <label>{{ (schema && typeof schema === "object" && schema.description) || fieldKey }}</label>

    <!-- Directory input (no browse button - directory browser removed) -->
    <div v-if="ui && ui.component === 'directory'" class="directory-input">
      <input
        type="text"
        :value="fieldValue"
        :placeholder="ui.placeholder || 'Enter directory path...'"
        class="form-input"
        @input="$emit('update', $event.target.value)"
      />
    </div>

    <!-- Text input -->
    <input
      v-else-if="ui && ui.component === 'input'"
      type="text"
      :value="fieldValue"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Password input -->
    <input
      v-else-if="ui && ui.component === 'password'"
      type="password"
      :value="fieldValue"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Number input -->
    <input
      v-else-if="ui && ui.component === 'number'"
      type="number"
      :value="fieldValue"
      :min="ui.validation?.min"
      :max="ui.validation?.max"
      :step="numberStep"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Select dropdown -->
    <select
      v-else-if="ui && ui.component === 'select'"
      :value="fieldValue"
      class="form-input"
      @change="$emit('update', $event.target.value)"
    >
      <option v-for="option in ui.options" :key="option.value" :value="option.value">
        {{ option.label || option.value }}
      </option>
    </select>

    <!-- Select with scan button — fetches options from the backend -->
    <div v-else-if="ui && ui.component === 'select-scan'" class="scan-select">
      <div class="scan-select-row">
        <select
          :value="fieldValue"
          class="form-input"
          @change="$emit('update', $event.target.value)"
        >
          <option value="" disabled>
            {{
              scanning
                ? "Scanning…"
                : scannedOptions.length
                  ? "— Select device —"
                  : "— Click Scan to discover —"
            }}
          </option>
          <option
            v-if="fieldValue && !scannedOptions.find(o => o.value === fieldValue)"
            :value="fieldValue"
          >
            {{ fieldValue }}
          </option>
          <option v-for="opt in scannedOptions" :key="opt.value" :value="opt.value">
            {{ opt.label || opt.value }}
          </option>
        </select>
        <button type="button" class="btn-secondary" :disabled="scanning" @click="runScan">
          {{ scanning ? "Scanning…" : "Scan" }}
        </button>
      </div>
      <span v-if="scanError" class="scan-error">{{ scanError }}</span>
    </div>

    <!-- Textarea -->
    <textarea
      v-else-if="ui && ui.component === 'textarea'"
      :value="fieldValue"
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
        :checked="isChecked"
        class="checkbox-input"
        @change="$emit('update', $event.target.checked)"
      />
      <span class="checkbox-text">
        {{ ui && ui.help_text ? ui.help_text : (schema && schema.description) || fieldKey }}
      </span>
    </label>

    <!-- Fallback: Default input based on schema type -->
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'string'"
      type="text"
      :value="fieldValue"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'password'"
      type="password"
      :value="fieldValue"
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
        style="color: var(--focus); text-decoration: underline"
      >
        {{ ui.help_link }}
      </a>
    </span>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import axios from "axios";

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
    type: [String, Boolean, Number, Object],
    default: "",
  },
});

defineEmits(["update"]);

const ui = computed(() => {
  return props.schema && typeof props.schema === "object" ? props.schema.ui : null;
});

// `<input type="number">` defaults to step=1, which rejects decimals (e.g.
// geographic coordinates) as a stepMismatch on form submit. Derive step from
// the declared type — decimals for "number", whole numbers for "integer" — and
// let an explicit ui.step (or ui.validation.step) override.
const numberStep = computed(() => {
  const explicit = ui.value?.step ?? ui.value?.validation?.step;
  if (explicit != null) return explicit;
  return props.schema?.type === "integer" ? "1" : "any";
});

// Config values are bare scalars in the 1.0 contract; callers resolve
// schema defaults before passing a value in.
const fieldValue = computed(() => props.value);

const isChecked = computed(() => {
  const value = fieldValue.value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
});

const scannedOptions = ref([]);
const scanning = ref(false);
const scanError = ref(null);

async function runScan() {
  scanning.value = true;
  scanError.value = null;
  try {
    const res = await axios.get(`/api/plugins/${props.pluginId}/scan`, {
      params: { field: props.fieldKey },
    });
    scannedOptions.value = res.data.options || [];
    if (!scannedOptions.value.length) {
      scanError.value = res.data.error || "No devices found";
    }
  } catch {
    scanError.value = "Scan failed";
  } finally {
    scanning.value = false;
  }
}
</script>

<style scoped>
.plugin-field {
  margin-bottom: 1rem;
}

.plugin-field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--ink);
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
  background: var(--bg-0);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-2);
  border-color: var(--focus);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--focus);
}

.form-input::placeholder {
  color: var(--ink-2);
}

.help-text {
  font-size: 0.875rem;
  color: var(--ink-2);
  margin-top: 0.5rem;
  display: block;
}

.help-text a {
  color: var(--focus);
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
  color: var(--ink);
  font-size: 0.9rem;
}

.scan-select-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.scan-select-row .form-input {
  flex: 1;
}

.scan-error {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-error, #e05555);
}
</style>
