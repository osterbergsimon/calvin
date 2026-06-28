<template>
  <section :id="`section-${id}`" class="settings-section">
    <div class="settings-section__eyebrow">{{ title }}</div>
    <div class="settings-section__panel"><slot /></div>
  </section>
</template>
<script setup>
defineProps({ id: { type: String, required: true }, title: { type: String, required: true } });
</script>
<style scoped>
.settings-section { scroll-margin-top: 1rem; }
.settings-section__eyebrow { font-family: var(--font-data); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-3); margin: 1.25rem 0.25rem 0.5rem; }
.settings-section__panel { background: var(--bg-1); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
</style>
