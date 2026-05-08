<template>
  <svg
    class="bar-logo"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M18 6.5 A8 8 0 1 0 18 17.5" />
  </svg>
</template>

<script setup>
defineOptions({ name: "BarLogo" });

defineProps({
  size: {
    type: Number,
    default: 20,
  },
});
</script>

<style scoped>
.bar-logo {
  color: var(--text-secondary);
  opacity: 0.6;
  flex-shrink: 0;
}
</style>
