<template>
  <div class="kbt" :class="{ 'kbt--conflict': conflict, 'kbt--empty': !action }">
    <div class="kbt-key">{{ keyLabel }}</div>
    <div class="kbt-action">{{ action ? actionLabel(action) : "unassigned" }}</div>
    <div class="kbt-actions">
      <button
        class="kbt-btn"
        data-role="edit"
        :aria-label="`Change ${keyLabel}`"
        @click="$emit('edit')"
      >
        ✎
      </button>
      <button
        v-if="action"
        class="kbt-btn"
        data-role="clear"
        :aria-label="`Clear ${keyLabel}`"
        @click="$emit('clear')"
      >
        ×
      </button>
    </div>
    <span v-if="conflict" class="kbt-conflict-dot" title="This action is also bound to another key"
      >●</span
    >
  </div>
</template>

<script setup>
import { computed } from "vue";
import { actionLabel } from "@/utils/keyboardActionsCatalog";

const props = defineProps({
  keyCode: { type: String, required: true },
  action: { type: String, default: null },
  conflict: { type: Boolean, default: false },
});
defineEmits(["edit", "clear"]);

const keyLabel = computed(() => props.keyCode.replace(/^KEY_/, ""));
</script>

<style scoped>
.kbt {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  min-height: 44px;
}
.kbt--empty {
  border-style: dashed;
}
.kbt--conflict {
  border-color: var(--warn);
}
.kbt-key {
  font-family: var(--font-data);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--ink);
}
.kbt-action {
  font-size: 0.75rem;
  color: var(--ink-2);
  text-align: center;
  line-height: 1.2;
}
.kbt-actions {
  display: flex;
  gap: 6px;
}
.kbt-btn {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink-2);
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}
.kbt-btn:hover {
  border-color: var(--focus);
  color: var(--ink);
}
.kbt-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.kbt-conflict-dot {
  position: absolute;
  top: 6px;
  right: 8px;
  color: var(--warn);
  font-size: 0.6rem;
}
</style>
