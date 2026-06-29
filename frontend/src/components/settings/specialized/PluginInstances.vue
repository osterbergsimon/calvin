<template>
  <div class="plugin-instances">
    <div class="instances-header">
      <h4 class="config-section-title">
        {{ instanceLabelPlural }}
        <span v-if="instances.length > 0" class="instance-count"> ({{ instances.length }}) </span>
      </h4>
      <button
        class="btn-add-instance"
        :title="`Add new ${instanceLabel}`"
        @click="$emit('add-instance')"
      >
        + Add {{ instanceLabel }}
      </button>
    </div>

    <div v-if="instances.length === 0" class="empty-instances">
      <p class="help-text">
        No {{ instanceLabelPlural.toLowerCase() }} configured. Click "Add {{ instanceLabel }}" to
        create one.
      </p>
    </div>

    <div v-else class="instances-list">
      <draggable
        :model-value="instances"
        :animation="200"
        handle=".instance-drag-handle"
        item-key="id"
        @update:model-value="handleOrderChange"
      >
        <template #item="{ element: instance }">
          <div class="instance-item" :class="{ disabled: !instance.enabled }">
            <div class="instance-info">
              <div class="instance-header">
                <span class="instance-drag-handle" title="Drag to reorder"> ⋮⋮ </span>
                <span
                  v-if="instance.running !== undefined"
                  class="running-indicator"
                  :class="{
                    running: instance.running,
                    stopped: !instance.running,
                  }"
                  :title="
                    instance.running ? '● Green: Instance is running' : '○ Red: Instance is stopped'
                  "
                >
                  {{ instance.running ? "●" : "○" }}
                </span>
                <h5>{{ instance.name }}</h5>
              </div>
              <div
                v-if="getInstanceSummary && getInstanceSummary(instance)"
                class="instance-details"
              >
                <div class="instance-detail-item">
                  <span class="instance-detail-value">{{ getInstanceSummary(instance) }}</span>
                </div>
              </div>
            </div>
            <div class="instance-actions">
              <label
                class="toggle-switch-small"
                :title="
                  instance.enabled ? 'Disable and stop instance' : 'Enable and start instance'
                "
              >
                <input
                  type="checkbox"
                  :checked="instance.enabled"
                  @change="handleToggle(instance.id, $event.target.checked)"
                />
                <span class="slider-small" />
              </label>
              <button
                class="btn-icon-only btn-action"
                title="Edit instance"
                @click="$emit('edit-instance', instance)"
              >
                ✏️
              </button>
              <button
                class="btn-icon-only btn-action btn-action-danger"
                title="Delete instance"
                @click="handleDelete(instance.id, instance.name)"
              >
                🗑️
              </button>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import draggable from "vuedraggable";

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
  calendar: "Calendar Source",
  image: "Image Source",
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

const handleToggle = (instanceId, enabled) => {
  emit("toggle-instance", instanceId, enabled);
};

const handleDelete = (instanceId, instanceName) => {
  if (!confirm(`Delete "${instanceName}"? This cannot be undone.`)) return;
  emit("delete-instance", instanceId);
};

const handleOrderChange = newOrder => {
  emit("order-change", newOrder);
};
</script>

<style scoped>
.plugin-instances {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}

.instances-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.config-section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
  font-family: var(--font-ui);
}

.instance-count {
  font-weight: normal;
  color: var(--ink-2);
  font-size: 0.9rem;
}

.btn-add-instance {
  padding: 0.5rem 1rem;
  min-height: 44px;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.875rem;
  font-family: var(--font-ui);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-instance:hover {
  border-color: var(--focus);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-add-instance:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.empty-instances {
  padding: 1rem;
  text-align: center;
}

.instances-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.instance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.instance-item:hover {
  border-color: var(--focus);
  background: var(--bg-2);
}

.instance-item.disabled {
  opacity: 0.6;
}

.instance-info {
  flex: 1;
}

.instance-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.instance-drag-handle {
  cursor: grab;
  color: var(--ink-3);
  font-size: 1rem;
  user-select: none;
}

.instance-drag-handle:active {
  cursor: grabbing;
}

.running-indicator {
  font-size: 1rem;
  line-height: 1;
}

.running-indicator.running {
  color: var(--ok);
}

.running-indicator.stopped {
  color: var(--err);
}

.instance-header h5 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink);
}

.instance-details {
  margin-top: 0.25rem;
}

.instance-detail-item {
  font-size: 0.85rem;
  color: var(--ink-2);
}

.instance-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-switch-small {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.toggle-switch-small input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider-small {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ink-3);
  transition: 0.4s;
  border-radius: 20px;
}

.slider-small:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .slider-small {
  background-color: var(--focus);
}

input:checked + .slider-small:before {
  transform: translateX(16px);
}

.btn-action {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.375rem;
  min-height: 44px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: var(--bg-2);
  border-color: var(--focus);
}

.btn-action:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-action-danger {
  color: var(--err);
}

.btn-action-danger:hover {
  background: color-mix(in srgb, var(--err) 10%, transparent);
  border-color: var(--err);
}

.help-text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ink-2);
  line-height: 1.4;
}
</style>
