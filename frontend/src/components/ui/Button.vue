<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, `btn--${shape}`, { 'btn--icon-only': iconOnly }]"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    :aria-label="label || undefined"
  >
    <span v-if="icon || $slots.icon" class="btn__icon" aria-hidden="true">
      <slot name="icon">
        <svg class="btn__glyph" viewBox="0 0 24 24">
          <path :d="icon" fill="currentColor" />
        </svg>
      </slot>
    </span>
    <span v-if="!iconOnly" class="btn__label">
      <template v-if="loading && loadingLabel">{{ loadingLabel }}</template>
      <slot v-else />
    </span>
  </button>
</template>

<script setup>
// The one text button of the frontend doctrine (docs/design/frontend-doctrine.md
// §3). Variants: primary (orange, one per region), secondary (default),
// ghost, danger (text tone; filled only inside a destructive confirm) and
// link. Sizes: md (--control-height) and sm (--touch-target). Icon-only uses
// `icon-only` + `label` (the accessible name) — IconButton remains the
// dedicated square/circle control for dense chrome.
defineProps({
  variant: {
    type: String,
    default: "secondary",
    validator: value => ["primary", "secondary", "ghost", "danger", "link"].includes(value),
  },
  size: {
    type: String,
    default: "md",
    validator: value => ["md", "sm"].includes(value),
  },
  type: {
    type: String,
    default: "button",
    validator: value => ["button", "submit", "reset"].includes(value),
  },
  // `pill` is for a status-shaped control (the connection pill); everything
  // else is the standard --radius-control rectangle.
  shape: {
    type: String,
    default: "default",
    validator: value => ["default", "pill"].includes(value),
  },
  disabled: { type: Boolean, default: false },
  // Loading disables the control and marks it aria-busy. Pass the verb + "…"
  // as loadingLabel ("Saving…"); the doctrine has no spinner inside a control.
  loading: { type: Boolean, default: false },
  loadingLabel: { type: String, default: "" },
  // Accessible name, required when the button has no text.
  label: { type: String, default: "" },
  // An @mdi/js path drawn before the label.
  icon: { type: String, default: null },
  iconOnly: { type: Boolean, default: false },
});
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-tight);
  padding: 0 var(--gap-4);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.btn--pill {
  border-radius: var(--radius-round);
}

.btn--md {
  min-height: var(--control-height);
}

.btn--sm {
  min-height: var(--touch-target);
  padding-inline: var(--gap-3);
}

.btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--ink) 4%, var(--bg-2));
}

.btn__icon {
  display: inline-flex;
  flex: 0 0 auto;
}

.btn__glyph {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}

/* Variants */
.btn--primary {
  color: var(--focus-ink);
  background: var(--focus);
  border-color: var(--focus);
}

.btn--primary:not(:disabled):hover {
  background: color-mix(in srgb, var(--focus) 88%, var(--ink));
  border-color: color-mix(in srgb, var(--focus) 88%, var(--ink));
}

.btn--ghost {
  color: var(--ink-2);
  background: transparent;
  border-color: transparent;
}

.btn--ghost:not(:disabled):hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.btn--danger {
  color: var(--err-text);
  background: var(--bg-2);
  border-color: var(--line);
}

.btn--danger:not(:disabled):hover {
  border-color: var(--err);
}

.btn--link {
  min-height: 0;
  padding: 0;
  font-weight: var(--weight-body);
  color: var(--ink);
  background: transparent;
  border-color: transparent;
  border-radius: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn--link:not(:disabled):hover {
  color: var(--focus-text);
  background: transparent;
}

/* Icon-only: a square target with no label. */
.btn--icon-only {
  padding-inline: 0;
}

.btn--md.btn--icon-only {
  width: var(--control-height);
}

.btn--sm.btn--icon-only {
  width: var(--touch-target);
}

.btn--link.btn--icon-only {
  width: auto;
}

@media (prefers-reduced-motion: reduce) {
  .btn {
    transition: none;
  }
}
</style>
