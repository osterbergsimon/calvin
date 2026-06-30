<template>
  <span class="bar-logo" :class="{ 'bar-logo--vertical': vertical }" aria-label="Calvin">
    CAL<span class="bar-logo__dot">·</span>VIN
  </span>
</template>

<script setup>
defineOptions({ name: "BarLogo" });
defineProps({
  // Stack the wordmark vertically for the left/right side bars.
  vertical: { type: Boolean, default: false },
});
</script>

<style scoped>
/* Matches the Settings shell wordmark (SettingsTopBar) so the brand reads the
   same on the dashboard bar and in Settings. */
.bar-logo {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
  user-select: none;
  flex-shrink: 0;
  white-space: nowrap;
}

.bar-logo__dot {
  color: var(--focus);
}

.bar-logo--vertical {
  writing-mode: vertical-rl;
  letter-spacing: 0.12em;
}
</style>
