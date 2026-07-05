<template>
  <div class="ap calvin-plugin-surface" role="dialog" aria-label="Choose keyboard action">
    <header class="ap-head">
      <span class="ap-key">{{ keyCode }}</span>
      <span class="ap-arrow">→</span>
      <span class="ap-lbl">choose an action</span>
      <IconButton variant="ghost" label="Cancel" @click="$emit('close')">×</IconButton>
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
        :data-group="group.id"
      >
        <!-- Collapsible header for lower tiers (Jump / per-mode / Legacy) -->
        <button
          v-if="isCollapsible(group)"
          class="ap-group-toggle"
          :data-group-toggle="group.id"
          :aria-expanded="isOpen(group)"
          @click="toggle(group)"
        >
          <span class="ap-chevron">{{ isOpen(group) ? "▾" : "▸" }}</span>
          <span class="ap-group-toggle-label">{{ group.label }}</span>
          <span class="ap-group-count">{{ group.actions.length }}</span>
        </button>
        <!-- Static header for the recommended / primary tiers -->
        <h4 v-else class="ap-group-title">
          <span v-if="group.tier === 'recommended'" class="ap-star">★</span>
          {{ group.label }}
        </h4>

        <template v-if="isOpen(group)">
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
        </template>
      </section>
      <p v-if="visibleGroups.length === 0" class="ap-empty">No matching actions.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import { ACTION_GROUPS } from "@/utils/keyboardActionsCatalog";

defineProps({
  keyCode: { type: String, required: true },
  currentAction: { type: String, default: null },
});
defineEmits(["select", "close"]);

const query = ref("");
const searching = computed(() => query.value.trim() !== "");

// Lower tiers (Jump to a screen / per-mode / Legacy) collapse behind a
// disclosure; Generic (recommended) and Navigation (primary) stay open.
const openGroups = ref(new Set());
const isCollapsible = group => group.tier === "collapsed";
// Collapsible groups are closed until opened, but a search forces every
// matching group open so results are never hidden.
const isOpen = group => !isCollapsible(group) || searching.value || openGroups.value.has(group.id);
const toggle = group => {
  const next = new Set(openGroups.value);
  next.has(group.id) ? next.delete(group.id) : next.add(group.id);
  openGroups.value = next;
};

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
.ap-search {
  margin: 10px 14px 6px;
  padding: 7px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  font-family: var(--font-ui);
}
.ap-search:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
.ap-group-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 8px 0 4px;
  padding: 6px 4px;
  background: none;
  border: none;
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  min-height: var(--touch-target);
}
.ap-group-toggle:hover {
  color: var(--ink);
}
.ap-group-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.ap-chevron {
  width: 12px;
  color: var(--ink-2);
}
.ap-group-toggle-label {
  flex: 1;
  text-align: left;
}
.ap-group-count {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
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
  min-height: var(--touch-target);
}
.ap-group--reco .ap-opt {
  border-color: var(--focus);
}
.ap-opt:hover {
  border-color: var(--focus);
}
.ap-opt:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
