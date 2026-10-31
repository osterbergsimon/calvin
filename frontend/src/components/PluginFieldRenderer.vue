<template>
  <div v-if="!isHidden" class="plugin-field">
    <label :for="fieldId">{{ label }}</label>

    <!-- Directory input (no browse button - directory browser removed) -->
    <div v-if="ui && ui.component === 'directory'" class="directory-input">
      <input
        :id="fieldId"
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
      :id="fieldId"
      type="text"
      :value="fieldValue"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Password input -->
    <input
      v-else-if="ui && ui.component === 'password'"
      :id="fieldId"
      type="password"
      :value="fieldValue"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Number input -->
    <input
      v-else-if="ui && ui.component === 'number'"
      :id="fieldId"
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
      :id="fieldId"
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
          :id="fieldId"
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
      :id="fieldId"
      :value="fieldValue"
      :placeholder="ui.placeholder"
      class="form-input"
      rows="3"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Boolean: the shared on/off toggle, never a native checkbox -->
    <ToggleSwitch
      v-else-if="isBoolean"
      :id="fieldId"
      :model-value="isChecked"
      :aria-label="label"
      @update:model-value="$emit('update', $event)"
    />

    <!-- Fallback: Default input based on schema type -->
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'string'"
      :id="fieldId"
      type="text"
      :value="fieldValue"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    <input
      v-else-if="schema && typeof schema === 'object' && schema.type === 'password'"
      :id="fieldId"
      type="password"
      :value="fieldValue"
      :placeholder="ui?.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- The schema description is the hint line under the field -->
    <span v-if="descriptionText" class="help-text">{{ descriptionText }}</span>

    <!-- Extra author help text and links -->
    <span v-if="ui && (ui.help_text || ui.help_link)" class="help-text">
      <span v-if="ui.help_text">{{ ui.help_text }}</span>
      <a
        v-if="ui.help_link"
        :href="ui.help_link"
        target="_blank"
        rel="noopener noreferrer"
        style="color: var(--focus-text); text-decoration: underline"
      >
        {{ ui.help_link }}
      </a>
    </span>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import axios from "axios";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import { fieldLabel, isHiddenField } from "@/utils/pluginFields";

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

// `label` is the form label; without one the key is humanised. The description
// is a hint line — it was historically used as the label, which read like a
// sentence and left the field unnamed (CLV-74).
const label = computed(() => fieldLabel(props.fieldKey, props.schema));
const descriptionText = computed(() => {
  const description = props.schema?.description;
  return typeof description === "string" ? description.trim() : "";
});
const isHidden = computed(() => isHiddenField(props.fieldKey, props.schema));
const isBoolean = computed(
  () => ui.value?.component === "checkbox" || props.schema?.type === "boolean"
);
const fieldId = computed(() =>
  `plugin-field-${props.pluginId}-${props.fieldKey}`.replace(/[^a-zA-Z0-9_-]/g, "-")
);

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
  font-size: var(--text-body);
  font-weight: var(--weight-title);
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
  border-radius: var(--radius-xs);
  padding: 0.75rem 1.5rem;
  font-size: var(--fs-md);
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
  border-radius: var(--radius-xs);
  background: var(--bg-2);
  color: var(--ink);
  font-size: var(--fs-md);
  transition: border-color 0.2s ease;
}

/* Match the modal's Name control; textareas stay content-sized. */
input.form-input,
select.form-input {
  height: var(--control-height);
}

.form-input:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 22%, transparent);
}

.form-input::placeholder {
  color: var(--ink-2);
}

.help-text {
  display: block;
  margin-top: var(--gap-1);
  font-size: var(--text-meta);
  line-height: normal;
  color: var(--ink-2);
}

.help-text a {
  color: var(--focus-text);
  text-decoration: underline;
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
  font-size: var(--fs-xs);
  color: var(--color-error, var(--err-text));
}
</style>
