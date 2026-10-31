<template>
  <div class="ap">
    <header class="ap-head">
      <span class="ap-key">{{ keyCode }}</span>
      <span class="ap-arrow">→</span>
      <span class="ap-lbl">choose an action</span>
    </header>

    <TextField
      v-model="query"
      class="ap-search"
      label="Search actions"
      type="search"
      placeholder="Search actions…"
      hide-label
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
        <h4 v-else class="ap-group-title heading-group">
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
import TextField from "@/components/ui/TextField.vue";
import { ACTION_GROUPS } from "@/utils/keyboardActionsCatalog";

// The content of the "choose an action" Dialog (KeyboardTab supplies the
// shell); this component owns the search and the grouped list, not an overlay.
defineProps({
  keyCode: { type: String, required: true },
  currentAction: { type: String, default: null },
});
defineEmits(["select"]);

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
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}
.ap-head {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  padding: 0 0 var(--gap-3);
  border-bottom: 1px solid var(--line);
}
.ap-key {
  font-family: var(--font-data);
  font-weight: var(--weight-title);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--gap-1) var(--gap-3);
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
  margin: var(--gap-3) 0 var(--gap-2);
}
.ap-scroll {
  overflow-y: auto;
  padding-bottom: var(--gap-3);
}
.ap-group-title {
  margin: var(--gap-4) 0 var(--gap-1);
  display: flex;
  align-items: center;
  gap: var(--gap-1);
}
.ap-star {
  color: var(--warn-text);
}
.ap-group-toggle {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  width: 100%;
  margin: var(--gap-2) 0 var(--gap-1);
  padding: var(--gap-1) 0;
  background: none;
  border: none;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
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
  width: 0.75rem;
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
  gap: var(--gap-1);
  padding: var(--gap-2) var(--gap-3);
  margin-bottom: var(--gap-1);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
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
  font-size: var(--text-caption);
  color: var(--ink-2);
}
.ap-empty {
  color: var(--ink-2);
  padding: var(--gap-3) 0;
}
</style>
