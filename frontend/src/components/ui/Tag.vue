<template>
  <span class="tag" :class="[tone, { count }]">
    <svg v-if="icon" class="tag__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="icon" />
    </svg>
    <slot />
  </span>
</template>

<script setup>
defineProps({
  tone: {
    type: String,
    default: "neutral",
    validator: value => ["neutral", "ok", "warn", "err", "focus"].includes(value),
  },
  // Tabular mono digits, min-width = height, centred.
  count: { type: Boolean, default: false },
  // An @mdi/js path, drawn before the text.
  icon: { type: String, default: null },
});
</script>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--tag-gap);
  height: var(--tag-height);
  padding: 0 var(--tag-pad-x);
  border: 1px solid var(--line);
  border-radius: var(--tag-radius);
  background: transparent;
  color: var(--ink-2);
  font: var(--tag-weight) var(--tag-fs) / 1 var(--font-ui);
  white-space: nowrap;
}

.tag__icon {
  flex: 0 0 auto;
  width: var(--tag-icon);
  height: var(--tag-icon);
  fill: currentColor;
}

.tag.ok {
  color: color-mix(in srgb, var(--ok) var(--tag-ink), var(--ink));
  background: color-mix(in srgb, var(--ok) var(--tag-tint), transparent);
  border-color: color-mix(in srgb, var(--ok) var(--tag-edge), var(--line));
}

.tag.warn {
  color: color-mix(in srgb, var(--warn) var(--tag-ink), var(--ink));
  background: color-mix(in srgb, var(--warn) var(--tag-tint), transparent);
  border-color: color-mix(in srgb, var(--warn) var(--tag-edge), var(--line));
}

.tag.err {
  color: color-mix(in srgb, var(--err) var(--tag-ink), var(--ink));
  background: color-mix(in srgb, var(--err) var(--tag-tint), transparent);
  border-color: color-mix(in srgb, var(--err) var(--tag-edge), var(--line));
}

.tag.focus {
  color: color-mix(in srgb, var(--focus) var(--tag-ink), var(--ink));
  background: color-mix(in srgb, var(--focus) var(--tag-tint), transparent);
  border-color: color-mix(in srgb, var(--focus) var(--tag-edge), var(--line));
}

.tag.count {
  justify-content: center;
  min-width: var(--tag-height);
  padding: 0 var(--space-2xs);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
</style>
