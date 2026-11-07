<template>
  <span
    class="bar-logo"
    :class="{ 'bar-logo--vertical': vertical }"
    :style="sizeStyle"
    aria-label="Calvin"
  >
    CAL<span class="bar-logo__dot">·</span>VIN
  </span>
</template>

<script setup>
import { computed } from "vue";

defineOptions({ name: "BarLogo" });
const props = defineProps({
  // Stack the wordmark vertically for the left/right side bars.
  vertical: { type: Boolean, default: false },
  // A px size from the clock bar design. null keeps the CSS token (today's M).
  sizePx: { type: Number, default: null },
});
const sizeStyle = computed(() => (props.sizePx != null ? { fontSize: `${props.sizePx}px` } : null));
</script>

<style scoped>
/* Matches the Settings shell wordmark (SettingsTopBar) so the brand reads the
   same on the dashboard bar and in Settings. */
.bar-logo {
  font-family: var(--font-display);
  font-size: var(--fs-base);
  font-weight: var(--weight-title);
  letter-spacing: 0.08em;
  color: var(--ink);
  user-select: none;
  flex-shrink: 0;
  white-space: nowrap;
}

.bar-logo__dot {
  color: var(--focus-text);
}

.bar-logo--vertical {
  writing-mode: vertical-rl;
  letter-spacing: 0.12em;
}
</style>
