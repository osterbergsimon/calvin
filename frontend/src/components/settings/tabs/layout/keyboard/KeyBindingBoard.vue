<template>
  <div class="kb">
    <div class="kb-grid">
      <KeyBindingTile
        v-for="key in boundKeys"
        :key="key"
        :key-code="key"
        :action="mappings[key] || null"
        :conflict="isConflict(key)"
        :conflict-keys="conflictKeysFor(key)"
        @edit="$emit('edit', key)"
        @clear="$emit('clear', key)"
      />
      <button class="kb-add" data-role="add" :disabled="capturing" @click="$emit('add')">
        {{ capturing ? "Press a button…" : "＋ Press a button to bind" }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import KeyBindingTile from "./KeyBindingTile.vue";

const props = defineProps({
  mappings: { type: Object, required: true },
  capturing: { type: Boolean, default: false },
});
defineEmits(["edit", "clear", "add"]);

// Single unified list of bound keys: single-digit keys first (the remote's
// 1–7 read in order), then everything else alphabetically.
const sortRank = key => {
  const label = key.replace(/^KEY_/, "");
  return /^[0-9]$/.test(label) ? [0, label] : [1, label];
};
const boundKeys = computed(() =>
  Object.keys(props.mappings).sort((a, b) => {
    const ra = sortRank(a);
    const rb = sortRank(b);
    return ra[0] - rb[0] || ra[1].localeCompare(rb[1]);
  })
);

// Which keys are bound to each action (excluding "none").
const keysByAction = computed(() => {
  const map = {};
  for (const [key, action] of Object.entries(props.mappings)) {
    if (action && action !== "none") (map[action] ||= []).push(key);
  }
  return map;
});

// An action is in conflict when >1 key maps to it.
const isConflict = key => {
  const action = props.mappings[key];
  return !!action && action !== "none" && (keysByAction.value[action]?.length || 0) > 1;
};

// The other keys sharing this key's action — named in the tile's hint.
const conflictKeysFor = key => {
  const action = props.mappings[key];
  if (!action || action === "none") return [];
  return (keysByAction.value[action] || []).filter(k => k !== key);
};
</script>

<style scoped>
.kb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 8px;
  align-items: stretch;
}
.kb-add {
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  padding: 10px 14px;
  cursor: pointer;
  min-height: var(--touch-target);
}
.kb-add:hover:not(:disabled) {
  border-color: var(--focus);
  color: var(--ink);
}
.kb-add:disabled {
  opacity: 0.7;
  cursor: default;
}
.kb-add:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
