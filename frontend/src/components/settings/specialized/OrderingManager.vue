<template>
  <div class="ordering-manager">
    <div class="setting-item">
      <p class="help-text">
        Configure the display order of {{ type }} plugins and their instances.
        Drag plugins to reorder them, and drag instances within each plugin to
        reorder instances. Each level can only be reordered within its own
        scope.
      </p>
    </div>

    <div class="ordering-tree">
      <draggable
        :model-value="plugins"
        :animation="200"
        handle=".plugin-drag-handle"
        :group="`${type}-plugins`"
        item-key="id"
        @update:model-value="handlePluginOrderChange"
        @start="handlePluginDragStart"
        @end="handlePluginDragEnd"
      >
        <template #item="{ element: plugin, index }">
          <div class="plugin-tree-item">
            <div class="plugin-tree-header">
              <div class="plugin-order-handle">
                <span class="order-number">{{ index + 1 }}</span>
                <span
                  class="plugin-drag-handle"
                  title="Drag to reorder plugins"
                >
                  ⋮⋮
                </span>
              </div>
              <div class="plugin-info">
                <strong>{{ plugin.name }}</strong>
                <span
                  v-if="pluginInstances[plugin.id]?.length > 0"
                  class="instance-count-badge"
                >
                  {{ pluginInstances[plugin.id].length }}
                  {{
                    pluginInstances[plugin.id].length === 1
                      ? "instance"
                      : "instances"
                  }}
                </span>
              </div>
              <div class="plugin-order-control">
                <label>Order:</label>
                <input
                  :model-value="displayOrders[plugin.id] ?? index"
                  type="number"
                  class="order-input"
                  min="0"
                  @change="handleOrderInputChange(plugin.id, $event)"
                />
              </div>
            </div>

            <!-- Nested instances list -->
            <div
              v-if="pluginInstances[plugin.id]?.length > 0"
              class="plugin-instances-tree"
            >
              <draggable
                :model-value="pluginInstances[plugin.id]"
                :animation="200"
                handle=".instance-drag-handle"
                :group="`${type}-instances`"
                :data-plugin-id="plugin.id"
                item-key="id"
                @update:model-value="
                  handleInstanceOrderChange(plugin.id, $event)
                "
                @start="handleInstanceDragStart(plugin.id)"
                @end="handleInstanceDragEnd(plugin.id)"
              >
                <template #item="{ element: instance }">
                  <div class="instance-tree-item">
                    <div class="instance-tree-header">
                      <span
                        class="instance-drag-handle"
                        title="Drag to reorder instances"
                      >
                        ⋮⋮
                      </span>
                      <span
                        v-if="instance.running !== undefined"
                        class="running-indicator"
                        :class="{
                          running: instance.running,
                          stopped: !instance.running,
                        }"
                        :title="
                          instance.running
                            ? '● Green: Instance is running'
                            : '○ Red: Instance is stopped'
                        "
                      >
                        {{ instance.running ? "●" : "○" }}
                      </span>
                      <span class="instance-name">{{ instance.name }}</span>
                      <span
                        v-if="
                          instance.config &&
                          getInstanceSummary(plugin.id, instance.config)
                        "
                        class="instance-summary"
                      >
                        {{ getInstanceSummary(plugin.id, instance.config) }}
                      </span>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
            <div v-else class="no-instances-message">
              <span class="help-text">No instances configured</span>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup>
import draggable from "vuedraggable";

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => ["service", "image"].includes(value),
  },
  plugins: {
    type: Array,
    required: true,
    default: () => [],
  },
  pluginInstances: {
    type: Object,
    required: true,
    default: () => ({}),
  },
  displayOrders: {
    type: Object,
    default: () => ({}),
  },
  getInstanceSummary: {
    type: Function,
    default: () => null,
  },
});

const emit = defineEmits([
  "plugin-order-change",
  "instance-order-change",
  "order-input-change",
  "plugin-drag-start",
  "plugin-drag-end",
  "instance-drag-start",
  "instance-drag-end",
]);

const handlePluginOrderChange = (newOrder) => {
  emit("plugin-order-change", newOrder);
};

const handleInstanceOrderChange = (pluginId, newOrder) => {
  emit("instance-order-change", pluginId, newOrder);
};

const handleOrderInputChange = (pluginId, event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("order-input-change", pluginId, value);
  }
};

const handlePluginDragStart = () => {
  emit("plugin-drag-start");
};

const handlePluginDragEnd = () => {
  emit("plugin-drag-end");
};

const handleInstanceDragStart = (pluginId) => {
  emit("instance-drag-start", pluginId);
};

const handleInstanceDragEnd = (pluginId) => {
  emit("instance-drag-end", pluginId);
};
</script>

<style scoped>
.ordering-manager {
  width: 100%;
}

.ordering-tree {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plugin-tree-item {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s ease;
  overflow: hidden;
}

.plugin-tree-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 4px var(--shadow);
}

.plugin-tree-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.plugin-order-handle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
}

.order-number {
  font-weight: 600;
  color: var(--accent-primary);
  min-width: 1.5rem;
  text-align: center;
}

.plugin-drag-handle {
  cursor: grab;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--text-tertiary);
  user-select: none;
}

.plugin-drag-handle:active {
  cursor: grabbing;
}

.plugin-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.instance-count-badge {
  padding: 0.25rem 0.5rem;
  background: var(--bg-secondary);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.plugin-order-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plugin-order-control label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.order-input {
  width: 4rem;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.875rem;
  text-align: center;
}

.order-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb), 0.2);
}

.plugin-instances-tree {
  margin-left: 2rem;
  margin-right: 1rem;
  margin-bottom: 0.75rem;
  padding-left: 1rem;
  border-left: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.instance-tree-item {
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.instance-tree-item:hover {
  border-color: var(--accent-primary);
  background: var(--bg-secondary);
}

.instance-tree-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.instance-drag-handle {
  cursor: grab;
  font-size: 1rem;
  line-height: 1;
  color: var(--text-tertiary);
  user-select: none;
  flex-shrink: 0;
}

.instance-drag-handle:active {
  cursor: grabbing;
}

.running-indicator {
  font-size: 1rem;
  line-height: 1;
}

.running-indicator.running {
  color: #4caf50;
}

.running-indicator.stopped {
  color: #f44336;
}

.instance-name {
  font-weight: 500;
  color: var(--text-primary);
  flex: 0 0 auto;
}

.instance-summary {
  color: var(--text-secondary);
  font-size: 0.85rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-instances-message {
  margin-left: 2rem;
  margin-right: 1rem;
  margin-bottom: 0.75rem;
  padding-left: 1rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.help-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}
</style>
