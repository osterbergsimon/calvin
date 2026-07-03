<template>
  <div class="kb">
    <p class="kb-head">Your buttons</p>
    <div class="kb-board">
      <KeyBindingTile
        v-for="key in DEVICE_KEYS"
        :key="key"
        :key-code="key"
        :action="mappings[key] || null"
        :conflict="isConflict(key)"
        @edit="$emit('edit', key)"
        @clear="$emit('clear', key)"
      />
    </div>

    <div class="kb-other">
      <p class="kb-head">Other keys · {{ otherKeys.length }}</p>
      <div class="kb-other-list">
        <KeyBindingTile
          v-for="key in otherKeys"
          :key="key"
          :key-code="key"
          :action="mappings[key] || null"
          :conflict="isConflict(key)"
          @edit="$emit('edit', key)"
          @clear="$emit('clear', key)"
        />
        <button class="kb-add" data-role="add" :disabled="capturing" @click="$emit('add')">
          {{ capturing ? "Press a button…" : "＋ Press a button to bind" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import KeyBindingTile from "./KeyBindingTile.vue";

const DEVICE_KEYS = ["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7"];

const props = defineProps({
  mappings: { type: Object, required: true },
  capturing: { type: Boolean, default: false },
});
defineEmits(["edit", "clear", "add"]);

const otherKeys = computed(() =>
  Object.keys(props.mappings)
    .filter(k => !DEVICE_KEYS.includes(k))
    .sort()
);

// An action is in conflict when >1 key maps to it (excluding "none").
const actionCounts = computed(() => {
  const counts = {};
  for (const action of Object.values(props.mappings)) {
    if (action && action !== "none") counts[action] = (counts[action] || 0) + 1;
  }
  return counts;
});

const isConflict = key => {
  const action = props.mappings[key];
  return !!action && action !== "none" && actionCounts.value[action] > 1;
};
</script>

<style scoped>
.kb-head {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
  margin: 4px 0 8px;
}
.kb-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 8px;
}
.kb-other {
  margin-top: 16px;
}
.kb-other-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: stretch;
}
.kb-other-list .kbt {
  min-width: 96px;
}
.kb-add {
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  padding: 10px 14px;
  cursor: pointer;
  min-height: 44px;
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
