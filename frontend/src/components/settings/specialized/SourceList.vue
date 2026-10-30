<template>
  <div class="source-list">
    <div v-if="addLabel" class="sl-add-row">
      <button
        type="button"
        class="sl-add"
        :disabled="addDisabled"
        :title="addDisabled ? addDisabledHint : ''"
        @click="$emit('add')"
      >
        {{ addLabel }}
      </button>
    </div>

    <p v-if="rows.length === 0" class="sl-empty">{{ emptyText }}</p>

    <draggable
      v-else
      class="sl-rows"
      :model-value="rows"
      :animation="200"
      :disabled="!drag"
      handle=".sl-grip"
      item-key="id"
      @update:model-value="handleOrderChange"
    >
      <template #item="{ element: row }">
        <div
          class="sl-row"
          :class="{
            'sl-row--off': !row.enabled,
            'sl-row--focus': isHighlighted(row),
            'sl-row--error': row.error,
          }"
          :data-source-id="row.id"
        >
          <span v-if="drag" class="sl-grip" title="Drag to reorder" aria-hidden="true">⠿</span>
          <span
            v-if="row.running !== undefined"
            class="sl-dot"
            :class="row.error ? 'sl-dot--err' : row.running ? 'sl-dot--on' : 'sl-dot--off'"
            :title="row.error || (row.running ? 'Running' : 'Stopped')"
          />
          <div class="sl-text">
            <span class="sl-name">{{ row.name }}</span>
            <span class="sl-provider" :class="{ 'sl-provider--err': row.error }">
              {{ row.error || providerLine(row) }}
            </span>
            <slot name="meta" :row="row" />
          </div>

          <slot name="extra" :row="row" />

          <ToggleSwitch
            :model-value="!!row.enabled"
            :aria-label="`Show ${row.name}`"
            @update:model-value="v => $emit('toggle', row, v)"
          />
          <button type="button" class="sl-action" @click="$emit('edit', row)">Edit</button>
          <div class="sl-more">
            <button
              type="button"
              class="sl-more-btn"
              :aria-label="`More actions for ${row.name}`"
              :aria-expanded="openMenuId === row.id ? 'true' : 'false'"
              @click="toggleMenu(row.id)"
            >
              ⋯
            </button>
            <div v-if="openMenuId === row.id" class="sl-menu" role="menu">
              <button type="button" class="sl-menu-item" role="menuitem" @click="askRemove(row)">
                Remove
              </button>
            </div>
          </div>
        </div>
      </template>
    </draggable>

    <ConfirmModal
      :show="!!pendingRemove"
      :title="removeTitle"
      :message="removePrompt"
      confirm-text="Remove"
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import draggable from "vuedraggable";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import { providerLine } from "@/utils/instanceSummary";

// The one list every Content section uses (§3.1). It knows nothing about
// plugins: the section hands it rows shaped by buildSourceRow and decides
// whether order matters (drag) and what the Add button says.
const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  drag: {
    type: Boolean,
    default: false,
  },
  addLabel: {
    type: String,
    default: "",
  },
  addDisabled: {
    type: Boolean,
    default: false,
  },
  addDisabledHint: {
    type: String,
    default: "",
  },
  emptyText: {
    type: String,
    default: "No sources yet.",
  },
  // A newly saved source, or every row of a provider, pulses once.
  highlightId: {
    type: String,
    default: "",
  },
  highlightProvider: {
    type: String,
    default: "",
  },
  removeTitle: {
    type: String,
    default: "Remove source",
  },
  removeMessage: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(["add", "toggle", "edit", "remove", "order-change"]);

const openMenuId = ref(null);
const pendingRemove = ref(null);
const activeHighlight = ref("");

const isHighlighted = row => {
  if (!activeHighlight.value) return false;
  return row.id === activeHighlight.value || row.providerId === activeHighlight.value;
};

const highlight = value => {
  if (!value) return;
  activeHighlight.value = value;
  setTimeout(() => {
    if (activeHighlight.value === value) activeHighlight.value = "";
  }, 1500);
};

watch(
  () => props.highlightId,
  value => highlight(value),
  { immediate: true }
);
watch(
  () => props.highlightProvider,
  value => highlight(value),
  { immediate: true }
);

const toggleMenu = id => {
  openMenuId.value = openMenuId.value === id ? null : id;
};

const askRemove = row => {
  openMenuId.value = null;
  pendingRemove.value = row;
};

const removePrompt = computed(() => {
  const row = pendingRemove.value;
  if (!row) return "";
  if (props.removeMessage) return props.removeMessage(row);
  return `Remove ${row.name}?`;
});

const confirmRemove = () => {
  const row = pendingRemove.value;
  pendingRemove.value = null;
  if (row) emit("remove", row);
};

const cancelRemove = () => {
  pendingRemove.value = null;
};

const handleOrderChange = newOrder => {
  if (!props.drag) return;
  emit("order-change", newOrder);
};

onBeforeUnmount(() => {
  activeHighlight.value = "";
});
</script>

<style scoped>
.source-list {
  width: 100%;
}

.sl-add-row {
  display: flex;
  justify-content: flex-end;
  padding: 0.875rem 1rem 0.5rem;
}

.sl-add {
  min-height: var(--touch-target);
  padding: 0 1.25rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.sl-add:hover:not(:disabled) {
  filter: brightness(1.06);
}
.sl-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sl-add:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.sl-empty {
  margin: 0;
  padding: 1.5rem 1rem;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--ink-3);
}

.sl-rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0 1rem 1rem;
}

.sl-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: var(--touch-target);
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  flex-wrap: wrap;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.sl-row--off {
  opacity: 0.6;
}
.sl-row--focus {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 30%, transparent);
}

.sl-grip {
  color: var(--ink-3);
  font-size: 1rem;
  line-height: 1;
  cursor: grab;
  user-select: none;
}
.sl-grip:active {
  cursor: grabbing;
}

.sl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sl-dot--on {
  background: var(--ok);
}
.sl-dot--off {
  background: var(--ink-3);
}
.sl-dot--err {
  background: var(--err);
}

.sl-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 6rem;
  flex: 1;
}
.sl-name {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-provider {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-provider--err {
  color: var(--err);
}

.sl-action {
  padding: 0.35rem 0.7rem;
  min-height: var(--touch-target);
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}
.sl-action:hover {
  border-color: var(--focus);
  color: var(--ink);
}
.sl-action:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.sl-more {
  position: relative;
}
.sl-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target);
  height: var(--touch-target);
  padding: 0;
  background: transparent;
  color: var(--ink-2);
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
.sl-more-btn:hover {
  border-color: var(--line);
  color: var(--ink);
}
.sl-more-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.sl-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  z-index: 20;
  min-width: 9rem;
  padding: 0.25rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 6px 18px var(--shadow);
}
.sl-menu-item {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: transparent;
  color: var(--err);
  border: 0;
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}
.sl-menu-item:hover {
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .sl-row {
    transition: none;
  }
}
</style>
