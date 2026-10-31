<template>
  <section class="card">
    <header v-if="title || $slots.action" class="card__header">
      <h3 v-if="title" class="card__title">{{ title }}</h3>
      <div v-if="$slots.action" class="card__action"><slot name="action" /></div>
    </header>
    <slot />
  </section>
</template>

<script setup>
// A raised surface inside a page or another card (docs/design/frontend-doctrine.md
// §3): the card radius role, one border, never its own control styles. Settings
// panels and list rows have their own blocks; Card is for the rest.
defineProps({
  title: { type: String, default: "" },
});
</script>

<style scoped>
.card {
  padding: var(--gap-4);
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
}

.card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline);
  margin-bottom: var(--gap-stack);
}

.card__title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  color: var(--ink);
}

.card__action {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-inline);
  margin-left: auto;
}
</style>
