<template>
  <div class="pi-wrap">
    <div class="pi-header">
      <h4 class="pi-title">
        {{ instanceLabelPlural }}
        <span v-if="instances.length > 0" class="pi-count">{{ instances.length }}</span>
      </h4>
      <button type="button" class="pi-btn-add" @click="$emit('add-instance')">
        + Add {{ instanceLabel.toLowerCase() }}
      </button>
    </div>

    <p v-if="instances.length === 0" class="pi-empty">
      No {{ instanceLabelPlural.toLowerCase() }} yet. Add one to get started.
    </p>

    <draggable
      v-else
      class="pi-list"
      :model-value="instances"
      :animation="200"
      handle=".pi-drag"
      item-key="id"
      @update:model-value="handleOrderChange"
    >
      <template #item="{ element: instance }">
        <div class="pi-item" :class="{ 'pi-item--off': !instance.enabled }">
          <span class="pi-drag" title="Drag to reorder" aria-hidden="true">⠿</span>
          <span
            v-if="instance.running !== undefined"
            class="pi-dot"
            :class="instance.running ? 'pi-dot--on' : 'pi-dot--off'"
            :title="instance.running ? 'Running' : 'Stopped'"
          />
          <div class="pi-info">
            <span class="pi-name">{{ instance.name }}</span>
            <span v-if="getInstanceSummary && getInstanceSummary(instance)" class="pi-summary">{{
              getInstanceSummary(instance)
            }}</span>
          </div>
          <ToggleSwitch
            :model-value="!!instance.enabled"
            :aria-label="`Enable ${instance.name}`"
            @update:model-value="v => handleToggle(instance.id, v)"
          />
          <button
            type="button"
            class="pi-action"
            title="Edit"
            @click="$emit('edit-instance', instance)"
          >
            Edit
          </button>
          <button
            type="button"
            class="pi-action pi-action--danger"
            title="Delete"
            @click="handleDelete(instance.id, instance.name)"
          >
            Delete
          </button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup>
import { computed } from "vue";
import draggable from "vuedraggable";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
  instances: {
    type: Array,
    required: true,
    default: () => [],
  },
  getInstanceSummary: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits([
  "add-instance",
  "edit-instance",
  "delete-instance",
  "toggle-instance",
  "order-change",
]);

const instanceLabelMap = {
  calendar: "Source",
  image: "Source",
  backend: "Instance",
  service: "Instance",
};

const instanceLabel = computed(
  () => props.plugin.instance_label || instanceLabelMap[props.plugin.type] || "Instance"
);

const instanceLabelPlural = computed(() => {
  const label = instanceLabel.value;
  return label.endsWith("s") ? label : label + "s";
});

const handleToggle = (instanceId, enabled) => emit("toggle-instance", instanceId, enabled);

const handleDelete = (instanceId, instanceName) => {
  if (!confirm(`Delete "${instanceName}"? This cannot be undone.`)) return;
  emit("delete-instance", instanceId);
};

const handleOrderChange = newOrder => emit("order-change", newOrder);
</script>

<style scoped>
/* Spacing/divider is owned by the parent (.pc-body) so a plugin with no global
   settings doesn't get a floating divider above its instance list. */
.pi-wrap {
  margin-top: 0;
}

.pi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}
.pi-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink);
}
.pi-count {
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
.pi-btn-add {
  padding: 0.4rem 0.85rem;
  min-height: 44px;
  background: var(--bg-1);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s;
}
.pi-btn-add:hover {
  border-color: var(--focus);
}
.pi-btn-add:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.pi-empty {
  margin: 0;
  padding: 1rem;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink-3);
}

.pi-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.pi-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
  transition: border-color 0.15s;
}
.pi-item:hover {
  border-color: color-mix(in srgb, var(--focus) 45%, var(--line));
}
.pi-item--off {
  opacity: 0.6;
}
.pi-drag {
  cursor: grab;
  color: var(--ink-3);
  font-size: 1rem;
  line-height: 1;
  user-select: none;
}
.pi-drag:active {
  cursor: grabbing;
}
.pi-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pi-dot--on {
  background: var(--ok);
}
.pi-dot--off {
  background: var(--ink-3);
}
.pi-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}
.pi-name {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pi-summary {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pi-action {
  padding: 0.35rem 0.7rem;
  min-height: 44px;
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
.pi-action:hover {
  border-color: var(--focus);
  color: var(--ink);
}
.pi-action:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pi-action--danger:hover {
  border-color: var(--err);
  color: var(--err);
  background: color-mix(in srgb, var(--err) 8%, transparent);
}
</style>
