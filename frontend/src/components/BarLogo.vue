<template>
  <svg
    class="bar-logo"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M17 6 A8 8 0 1 0 17 18" />
  </svg>
</template>

<script setup>
defineOptions({ name: "BarLogo" });
</script>

<style scoped>
.bar-logo {
  color: var(--text-secondary);
  opacity: 0.6;
  flex-shrink: 0;
}
</style>
