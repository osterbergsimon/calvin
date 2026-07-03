<template>
  <div class="ap calvin-plugin-surface" role="dialog" aria-label="Choose keyboard action">
    <header class="ap-head">
      <span class="ap-key">{{ keyCode }}</span>
      <span class="ap-arrow">→</span>
      <span class="ap-lbl">choose an action</span>
      <button class="ap-close" aria-label="Cancel" @click="$emit('close')">×</button>
    </header>

    <input
      v-model="query"
      class="ap-search"
      type="text"
      placeholder="Search actions…"
      aria-label="Search actions"
    />

    <div class="ap-scroll">
      <section
        v-for="group in visibleGroups"
        :key="group.id"
        class="ap-group"
        :class="{ 'ap-group--reco': group.tier === 'recommended' }"
      >
        <h4 class="ap-group-title">
          <span v-if="group.tier === 'recommended'" class="ap-star">★</span>
          {{ group.label }}
        </h4>
        <button
          v-for="a in group.actions"
          :key="a.value"
          class="ap-opt"
          :class="{ 'ap-opt--current': a.value === currentAction }"
          :data-action="a.value"
          @click="$emit('select', a.value)"
        >
          <span class="ap-opt-label">{{ a.label }}</span>
          <span v-if="a.description" class="ap-opt-desc">{{ a.description }}</span>
        </button>
      </section>
      <p v-if="visibleGroups.length === 0" class="ap-empty">No matching actions.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { ACTION_GROUPS } from "@/utils/keyboardActionsCatalog";

defineProps({
  keyCode: { type: String, required: true },
  currentAction: { type: String, default: null },
});
defineEmits(["select", "close"]);

const query = ref("");

const visibleGroups = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return ACTION_GROUPS;
  return ACTION_GROUPS.map(g => ({
    ...g,
    actions: g.actions.filter(
      a => a.label.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)
    ),
  })).filter(g => g.actions.length > 0);
});
</script>

<style scoped>
.ap {
  width: 100%;
  max-width: 440px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.ap-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-2);
}
.ap-key {
  font-family: var(--font-data);
  font-weight: 700;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 12px;
  color: var(--ink);
}
.ap-arrow {
  color: var(--ink-2);
}
.ap-lbl {
  color: var(--ink-2);
  flex: 1;
}
.ap-close {
  background: none;
  border: none;
  color: var(--ink-2);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.ap-search {
  margin: 10px 14px 6px;
  padding: 7px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  font-family: var(--font-ui);
}
.ap-scroll {
  overflow-y: auto;
  padding: 4px 14px 12px;
}
.ap-group-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
  margin: 12px 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ap-star {
  color: var(--warn);
}
.ap-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  gap: 2px;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  min-height: 44px;
}
.ap-group--reco .ap-opt {
  border-color: var(--focus);
}
.ap-opt:hover {
  border-color: var(--focus);
}
.ap-opt--current {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.ap-opt-desc {
  font-size: 0.72rem;
  color: var(--ink-2);
}
.ap-empty {
  color: var(--ink-2);
  padding: 12px 4px;
}
</style>
