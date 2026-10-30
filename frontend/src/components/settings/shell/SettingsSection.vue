<template>
  <section :id="`section-${id}`" class="settings-section">
    <div class="settings-section__head">
      <div class="settings-section__eyebrow">{{ title }}</div>
      <slot name="action" />
    </div>
    <div class="settings-section__panel"><slot /></div>
  </section>
</template>
<script setup>
defineProps({ id: { type: String, required: true }, title: { type: String, required: true } });
</script>
<style scoped>
.settings-section {
  scroll-margin-top: 1rem;
}
.settings-section__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 1.25rem 0.25rem 0.5rem;
}
.settings-section__eyebrow {
  flex: 1;
  min-width: 0;
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.settings-section__panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  overflow: hidden;
}
</style>
