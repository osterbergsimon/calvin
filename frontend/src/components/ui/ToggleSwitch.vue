<template>
  <button
    type="button"
    class="tog"
    role="switch"
    :class="{ on: modelValue }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="toggle"
  />
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ariaLabel: { type: String, default: null },
  // An unavailable setting stays in place but cannot be switched.
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);
const toggle = () => emit("update:modelValue", !props.modelValue);
</script>

<style scoped>
.tog {
  width: var(--toggle-w);
  height: var(--toggle-h);
  /* The track must never be squeezed below the touch target by a flex row
     (the source list's actions on a phone did exactly that). */
  min-width: var(--toggle-w);
  flex: 0 0 auto;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--switch-track-off);
  position: relative;
  cursor: pointer;
  transition: background var(--dur);
}
/* The touch target: the visible track stays 44x24, but a transparent ::before
   grows the tappable box to --touch-target in both directions, centred on the
   track. It does not grow sideways (the track is already --toggle-w), so in a
   tight row -- the schedule table's switch column sits --gap-inline from the
   time fields -- it can only reach the row's own padding, never a neighbour. */
.tog::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--touch-target);
  min-height: var(--touch-target);
  transform: translateY(-50%);
}
.tog::after {
  content: "";
  position: absolute;
  top: var(--toggle-inset);
  left: var(--toggle-inset);
  width: var(--toggle-knob);
  height: var(--toggle-knob);
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: var(--switch-knob-shadow);
  transition: transform var(--dur);
}
.tog.on {
  background: var(--focus);
}
.tog.on::after {
  transform: translateX(var(--toggle-travel));
  background: var(--switch-knob-on);
}
.tog:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tog:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .tog,
  .tog::after {
    transition: none;
  }
}
/* Windows High Contrast drops the track fill and the knob. A system-colour
   border and knob keep off and on apart, and Highlight/HighlightText carry the
   on state without relying on the accent. */
@media (forced-colors: active) {
  .tog {
    border: 1px solid ButtonText;
  }
  .tog::after {
    background: ButtonText;
  }
  .tog.on {
    background: Highlight;
  }
  .tog.on::after {
    background: HighlightText;
  }
}
</style>
