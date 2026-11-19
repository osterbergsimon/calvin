<template>
  <div v-if="!isHidden" class="plugin-field">
    <!-- A group (multi-select-scan) can't be named by `for`, so its visible
         label is a span the chip group points at with aria-labelledby. -->
    <label v-if="ui?.component !== 'multi-select-scan'" :for="fieldId">{{ label }}</label>
    <span v-else :id="`${fieldId}-label`" class="field-label">{{ label }}</span>

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

    <!-- Select: the shared pill, never a native select -->
    <SelectPill
      v-else-if="ui && ui.component === 'select'"
      :id="fieldId"
      :model-value="selectValue"
      :options="selectOptions"
      :aria-label="label"
      @update:model-value="emitSelected"
    />

    <!-- Many of many, listed by a scan that sees the form's config (e.g. a hub's
         devices). The value is one comma-separated string of ids. -->
    <div v-else-if="ui && ui.component === 'multi-select-scan'" class="scan-multi">
      <div class="scan-multi__row">
        <!-- aria-disabled, not disabled: a focused Scan keeps focus while it runs -->
        <Button
          variant="secondary"
          :aria-disabled="multiScanning ? 'true' : undefined"
          :aria-busy="multiScanning ? 'true' : undefined"
          :aria-describedby="hintId"
          @click="runMultiScan"
        >
          {{ multiScanning ? "Scanning…" : "Scan" }}
        </Button>
      </div>
      <ChipMultiSelect
        v-if="multiOptions.length"
        :model-value="selectedIds"
        :options="multiOptions"
        :aria-labelledby="`${fieldId}-label`"
        :aria-describedby="hintId"
        @update:model-value="emitSelectedIds"
      />
      <div class="scan-multi__live" role="status" aria-live="polite">
        <InlineNote v-if="multiScanNote" tone="err">{{ multiScanNote }}</InlineNote>
      </div>
    </div>

    <!-- Select with scan button — fetches options from the backend -->
    <div v-else-if="ui && ui.component === 'select-scan'" class="scan-select">
      <div class="scan-select-row">
        <SelectPill
          class="scan-select-pill"
          :id="fieldId"
          :model-value="selectValue"
          :options="scanSelectOptions"
          :display-label="fieldValue ? '' : scanPlaceholder"
          :aria-label="label"
          @update:model-value="emitSelected"
        />
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
    <span v-if="descriptionText" :id="hintId" class="help-text">{{ descriptionText }}</span>

    <!-- Extra author help text and links -->
    <span v-if="ui && (ui.help_text || ui.help_link)" class="help-text">
      <span v-if="ui.help_text">{{ ui.help_text }}</span>
      <ExternalLink
        v-if="ui.help_link"
        :href="ui.help_link"
        style="color: var(--focus-text); text-decoration: underline"
      >
        {{ ui.help_link }}
      </ExternalLink>
    </span>
  </div>
</template>

<script setup>
import ExternalLink from "@/components/ui/ExternalLink.vue";
import { computed, nextTick, onMounted, ref } from "vue";
import axios from "axios";
import SelectPill from "@/components/ui/SelectPill.vue";
import Button from "@/components/ui/Button.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { scanWithConfig } from "@/services/pluginsApi";
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
  // The config the settings form holds (as Test sends it), for scans that need
  // the address and key; `instanceId` lets the server fill a blank key.
  formConfig: {
    type: Object,
    default: () => ({}),
  },
  instanceId: {
    type: String,
    default: undefined,
  },
});

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
// The hint line's id, so a control can point at it with aria-describedby.
const hintId = computed(() => (descriptionText.value ? `${fieldId.value}-hint` : undefined));

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

// SelectPill matches the selection with ===, and the stored value is a string
// (see emitSelected), so option values are compared as strings too. A native
// select coerced both sides the same way.
const toOption = option => ({
  value: String(option.value),
  label: option.label || String(option.value),
});

const selectValue = computed(() => {
  const value = fieldValue.value;
  return value === null || value === undefined || value === "" ? null : String(value);
});

const selectOptions = computed(() => (ui.value?.options || []).map(toOption));

// The saved value stays pickable before (or without) a scan finding it.
const scanSelectOptions = computed(() => {
  const scanned = scannedOptions.value.map(toOption);
  const saved = selectValue.value;
  if (saved !== null && !scanned.some(option => option.value === saved)) {
    return [{ value: saved, label: String(saved) }, ...scanned];
  }
  return scanned;
});

const scanPlaceholder = computed(() => {
  if (scanning.value) return "Scanning…";
  return scannedOptions.value.length ? "— Select device —" : "— Click Scan to discover —";
});

// A native select always reported its value as a string; keep that contract so
// plugin configs don't change type when the control does.
const emit = defineEmits(["update"]);
const emitSelected = value => emit("update", String(value));

// multi-select-scan: ids parsed from the saved string (split, trim, drop
// empties and repeats), so a hand-edited "a, b,," still reads as a and b.
const selectedIds = computed(() => {
  const raw = typeof fieldValue.value === "string" ? fieldValue.value : "";
  return [
    ...new Set(
      raw
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    ),
  ];
});
const multiScanned = ref([]);
const multiScanning = ref(false);
const multiScanNote = ref("");
// Whether a scan has succeeded. Before one, a saved id is all we have to show;
// afterwards an id the scan did not find is called out by name. A failed scan
// proves nothing, so it leaves the saved ids' own labels alone.
const multiScanSucceeded = ref(false);

// Scanned options first; saved ids the scan did not find stay listed (and
// selected) under plain words, so nothing chosen is dropped without the admin
// seeing it.
const multiOptions = computed(() => {
  const scanned = multiScanned.value.map(toOption);
  const known = new Set(scanned.map(option => option.value));
  const missing = selectedIds.value
    .filter(id => !known.has(id))
    .map(id => ({
      value: id,
      label: multiScanSucceeded.value ? "Not found by the last scan" : id,
    }));
  return [...scanned, ...missing];
});

const emitSelectedIds = ids => emit("update", ids.join(","));

// The same note twice (two failed scans) must be announced twice: clear it and
// let the live region render empty before setting it again.
async function setMultiScanNote(text) {
  const repeat = Boolean(text) && multiScanNote.value === text;
  multiScanNote.value = "";
  const stamp = ++multiNoteStamp;
  if (!text) return;
  if (repeat) await nextTick();
  if (stamp === multiNoteStamp) multiScanNote.value = text;
}
let multiNoteStamp = 0;

async function runMultiScan() {
  if (multiScanning.value) return;
  multiScanning.value = true;
  setMultiScanNote("");
  try {
    const res = await scanWithConfig(
      props.pluginId,
      props.fieldKey,
      props.formConfig,
      props.instanceId
    );
    const options = Array.isArray(res?.options) ? res.options : [];
    multiScanned.value = options.filter(option => option && option.value != null);
    // Only a clean answer may relabel saved ids as missing: a thrown request or
    // an error answer says nothing about the devices that are already saved.
    if (!res?.error) multiScanSucceeded.value = true;
    if (!multiScanned.value.length) {
      setMultiScanNote(res?.error || "Nothing found to choose from.");
    }
  } catch (err) {
    setMultiScanNote(
      err?.response?.status === 400
        ? "You changed the address, so type the key again before scanning."
        : "Couldn't scan. Check the settings above, then try again."
    );
  } finally {
    multiScanning.value = false;
  }
}

// Editing an existing instance: the device picker scans once so saved ids show
// their names. Only that field scans — every other field has nothing to scan.
// A failed scan changes nothing, so the saved ids stay selected.
onMounted(() => {
  if (props.instanceId && ui.value?.component === "multi-select-scan") runMultiScan();
});

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
.scan-multi {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
}

.plugin-field {
  margin-bottom: 1rem;
}

.plugin-field label,
.plugin-field .field-label {
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
  transition: all var(--dur) ease;
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
  transition: border-color var(--dur) ease;
}

/* Match the modal's Name control; textareas stay content-sized. */
input.form-input {
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

.scan-select-pill {
  flex: 1;
  min-width: 0;
}

.scan-error {
  display: block;
  margin-top: 0.4rem;
  font-size: var(--fs-xs);
  color: var(--color-error, var(--err-text));
}
</style>
