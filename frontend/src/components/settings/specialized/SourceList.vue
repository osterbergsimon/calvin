<template>
  <div class="source-list">
    <div v-if="addLabel" class="sl-add-row">
      <Button
        class="sl-add"
        :variant="rows.length === 0 ? 'primary' : 'secondary'"
        :disabled="addDisabled"
        :title="addDisabled ? addDisabledHint : ''"
        @click="$emit('add')"
      >
        {{ addLabel }}
      </Button>
    </div>

    <InlineNote v-if="rows.length === 0" class="sl-empty">{{ emptyText }}</InlineNote>

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
        <ListRow
          class="sl-row"
          :name="row.name"
          :meta="rowMeta(row)"
          :selected="isHighlighted(row)"
          :disabled="!row.enabled"
          :data-source-id="row.id"
        >
          <template #lead>
            <span class="sl-lead">
              <span v-if="drag" class="sl-grip" title="Drag to reorder" aria-hidden="true">⠿</span>
              <span
                v-if="row.running !== undefined"
                class="sl-dot"
                :class="row.error ? 'sl-dot--err' : row.running ? 'sl-dot--on' : 'sl-dot--off'"
                :title="row.error || (row.running ? 'Working' : 'Off')"
              />
            </span>
          </template>

          <div v-if="$slots.meta" class="sl-meta"><slot name="meta" :row="row" /></div>

          <template #actions>
            <slot name="extra" :row="row" />
            <ToggleSwitch
              :model-value="!!row.enabled"
              :aria-label="`Show ${row.name}`"
              @update:model-value="v => $emit('toggle', row, v)"
            />
            <Button class="sl-action" variant="secondary" size="sm" @click="$emit('edit', row)">
              Edit
            </Button>
            <div class="sl-more">
              <IconButton
                class="sl-more-btn"
                variant="ghost"
                size="md"
                :label="`More actions for ${row.name}`"
                :aria-expanded="openMenuId === row.id ? 'true' : 'false'"
                @click="toggleMenu(row.id)"
              >
                ⋯
              </IconButton>
              <div v-if="openMenuId === row.id" class="sl-menu" role="menu">
                <Button
                  class="sl-menu-item"
                  variant="danger"
                  size="sm"
                  role="menuitem"
                  @click="askRemove(row)"
                >
                  Remove
                </Button>
              </div>
            </div>
          </template>
        </ListRow>
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
import Button from "@/components/ui/Button.vue";
import IconButton from "@/components/ui/IconButton.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
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

const rowMeta = row => [{ text: row.error || providerLine(row), tone: row.error ? "err" : "" }];

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
  padding: var(--panel-pad-y) var(--panel-pad-x) var(--gap-stack);
}

.sl-empty {
  padding: var(--panel-pad-y) var(--panel-pad-x);
  justify-content: center;
  text-align: center;
}

.sl-rows {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  padding: 0 var(--panel-pad-x) var(--panel-pad-y);
}

.sl-lead {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-tight);
}

.sl-grip {
  color: var(--ink-3);
  font-size: var(--text-label);
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
  border-radius: var(--radius-round);
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

.sl-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-tight) var(--gap-inline);
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.sl-more {
  position: relative;
}

.sl-menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--gap-tight));
  z-index: var(--z-raised);
  min-width: 9rem;
  padding: var(--gap-1);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-1);
}

.sl-menu-item {
  width: 100%;
  justify-content: flex-start;
}
</style>
