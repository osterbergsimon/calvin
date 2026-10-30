<template>
  <div class="password-field">
    <label class="password-field__label" :for="fieldId">{{ label }}</label>
    <div class="password-field__box">
      <input
        :id="fieldId"
        ref="inputEl"
        class="password-field__input"
        :class="{ 'password-field__input--invalid': error }"
        :type="type === 'password' && !revealed ? 'password' : 'text'"
        :value="modelValue"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :autocapitalize="autocapitalize"
        :maxlength="maxlength"
        autocorrect="off"
        spellcheck="false"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="$emit('blur', $event)"
      />
      <button
        v-if="showToggle && type === 'password'"
        type="button"
        class="password-field__toggle"
        :aria-pressed="revealed ? 'true' : 'false'"
        :aria-controls="fieldId"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        @mousedown.prevent
        @click="$emit('update:revealed', !revealed)"
      >
        {{ revealed ? "Hide" : "Show" }}
      </button>
    </div>
    <p v-if="error" :id="errorId" class="password-field__error">{{ error }}</p>
    <p v-else-if="hint || $slots.hint" :id="hintId" class="password-field__hint">
      <slot name="hint">{{ hint }}</slot>
    </p>
  </div>
</template>

<script setup>
import { computed, ref, useSlots } from "vue";

let fieldSeq = 0;

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, required: true },
  autocomplete: { type: String, default: "current-password" },
  // "text" for a visible one-off value such as the setup code; no Show toggle then.
  type: { type: String, default: "password" },
  autocapitalize: { type: String, default: "off" },
  maxlength: { type: [String, Number], default: undefined },
  hint: { type: String, default: "" },
  error: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  // v-model:revealed so one toggle can drive two fields (setup's two passwords).
  revealed: { type: Boolean, default: false },
  showToggle: { type: Boolean, default: true },
  inputId: { type: String, default: "" },
});

defineEmits(["update:modelValue", "update:revealed", "blur"]);

const slots = useSlots();
const fallbackId = `password-field-${++fieldSeq}`;
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
.password-field {
  min-width: 0;
}
.password-field__label {
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ink);
}
.password-field__box {
  position: relative;
}
.password-field__input {
  width: 100%;
  height: var(--control-height);
  padding: 0 4.75rem 0 0.875rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  /* 1rem, not --fs-control: iOS zooms on inputs under 16px. */
  font: 1rem var(--font-ui);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.password-field__input:hover:not(:disabled) {
  border-color: var(--focus-edge);
}
.password-field__input:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}
.password-field__input:disabled {
  opacity: 0.55;
}
.password-field__input--invalid {
  border-color: var(--err);
}
.password-field__toggle {
  position: absolute;
  top: 2px;
  right: 2px;
  height: calc(var(--control-height) - 4px);
  min-width: var(--touch-target);
  padding: 0 0.875rem;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  border-radius: 6px;
  font: 500 var(--fs-control) var(--font-ui);
  cursor: pointer;
}
.password-field__toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.password-field__hint {
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.password-field__error {
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  color: var(--err);
}
</style>
