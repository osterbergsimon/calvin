<template>
  <div class="text-field">
    <label
      class="text-field__label"
      :class="{ 'text-field__label--hidden': hideLabel }"
      :for="fieldId"
      >{{ label }}</label
    >
    <input
      :id="fieldId"
      ref="inputEl"
      class="text-field__input"
      :class="{ 'text-field__input--invalid': error }"
      :type="type"
      :value="modelValue"
      :name="name || undefined"
      :placeholder="placeholder || undefined"
      :autocomplete="autocomplete"
      :autocapitalize="autocapitalize"
      :maxlength="maxlength"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      autocorrect="off"
      spellcheck="false"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="describedBy"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur', $event)"
      @focus="$emit('focus', $event)"
    />
    <InlineNote v-if="error" :id="errorId" class="text-field__note" tone="err">
      {{ error }}
    </InlineNote>
    <InlineNote
      v-else-if="hint || $slots.hint"
      :id="hintId"
      class="text-field__note"
      tone="neutral"
    >
      <slot name="hint">{{ hint }}</slot>
    </InlineNote>
  </div>
</template>

<script setup>
import { computed, ref, useSlots } from "vue";
import InlineNote from "./InlineNote.vue";

// The one text input (docs/design/frontend-doctrine.md §3), built from
// PasswordField's shell: same label, 48px box, error line and aria wiring.
// Secrets stay in PasswordField, numbers in NumberStepper.
let fieldSeq = 0;

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, required: true },
  inputId: { type: String, default: "" },
  type: {
    type: String,
    default: "text",
    validator: value => ["text", "email", "url", "search", "tel"].includes(value),
  },
  name: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  autocomplete: { type: String, default: "off" },
  autocapitalize: { type: String, default: "off" },
  maxlength: { type: [String, Number], default: undefined },
  hint: { type: String, default: "" },
  // Keep the label for assistive tech when a visible label already names the
  // group (e.g. the colour swatch and its hex value share one label).
  hideLabel: { type: Boolean, default: false },
  error: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
});

defineEmits(["update:modelValue", "blur", "focus"]);

const slots = useSlots();
const fallbackId = `text-field-${++fieldSeq}`;
const fieldId = computed(() => props.inputId || fallbackId);
const errorId = computed(() => `${fieldId.value}-error`);
const hintId = computed(() => `${fieldId.value}-hint`);
const describedBy = computed(() => {
  if (props.error) return errorId.value;
  if (props.hint || slots.hint) return hintId.value;
  return undefined;
});

const inputEl = ref(null);

const focus = () => inputEl.value?.focus();
const select = () => inputEl.value?.select();

defineExpose({ focus, select });
</script>

<style scoped>
.text-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.text-field__label {
  margin-bottom: var(--gap-1);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.text-field__label--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  clip: rect(0 0 0 0);
}

.text-field__input {
  width: 100%;
  min-height: var(--control-height);
  padding: 0 var(--gap-3);
  font: var(--weight-body) 1rem var(--font-ui);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}

.text-field__input:hover:not(:disabled) {
  border-color: var(--focus-edge);
}

.text-field__input:focus {
  border-color: var(--focus);
}

.text-field__input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.text-field__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-field__input--invalid {
  border-color: var(--err);
}

.text-field__note {
  margin-top: var(--gap-1);
}

@media (prefers-reduced-motion: reduce) {
  .text-field__input {
    transition: none;
  }
}
</style>
