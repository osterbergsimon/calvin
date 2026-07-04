<template>
  <button
    type="button"
    class="icon-btn"
    :class="[
      `icon-btn--${variant}`,
      `icon-btn--${size}`,
      `icon-btn--${shape}`,
      { 'icon-btn--active': active },
    ]"
    :disabled="disabled"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  variant: {
    type: String,
    default: "default",
    validator: v => ["default", "primary", "ghost", "danger"].includes(v),
  },
  size: {
    type: String,
    default: "sm",
    // "custom" is an escape-hatch: the consumer drives the box/font via the
    // --icon-size / --icon-font CSS vars (e.g. the touchControlSize cluster).
    validator: v => ["sm", "md", "lg", "custom"].includes(v),
  },
  shape: {
    type: String,
    default: "square",
    validator: v => ["square", "circle"].includes(v),
  },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
</script>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    color 0.2s;
}
.icon-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* sizes */
.icon-btn--sm {
  min-width: 1.75rem;
  height: 1.75rem;
  font-size: 1.05rem;
}
.icon-btn--md {
  min-width: var(--touch-target);
  height: var(--touch-target);
  font-size: var(--fs-xl);
}
.icon-btn--lg {
  min-width: var(--control-height);
  height: var(--control-height);
  font-size: 1.5rem;
}
/* Escape-hatch size: consumer supplies --icon-size / --icon-font (set on the
   button or any ancestor, inherited through the cascade). Used by the
   touchControlSize-driven region cluster, whose 36/42/50px don't map to sm/md/lg. */
.icon-btn--custom {
  min-width: var(--icon-size);
  height: var(--icon-size);
  font-size: var(--icon-font);
}

/* shapes */
.icon-btn--square {
  border-radius: var(--radius-sm);
}
.icon-btn--circle {
  border-radius: 50%;
}

/* variants */
.icon-btn--default {
  background: var(--bg-2);
  border-color: var(--line);
  color: var(--ink);
}
.icon-btn--default:hover {
  border-color: var(--focus-edge);
}
.icon-btn--primary {
  background: var(--focus);
  border-color: var(--focus);
  color: var(--focus-ink);
}
.icon-btn--primary:hover {
  filter: brightness(1.08);
}
.icon-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--ink-2);
}
.icon-btn--ghost:hover {
  background: var(--bg-2);
  color: var(--ink);
}
.icon-btn--danger {
  background: var(--bg-2);
  border-color: var(--line);
  color: var(--err);
}
.icon-btn--danger:hover {
  border-color: var(--err);
}

/* lit/toggled modifier — intended for default & ghost toggles */
.icon-btn--active {
  color: var(--focus);
  border-color: var(--focus-edge);
}

@media (prefers-reduced-motion: reduce) {
  .icon-btn {
    transition: none;
  }
}
</style>
