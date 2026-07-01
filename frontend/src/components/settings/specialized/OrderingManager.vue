<template>
  <div class="ordering-manager">
    <div class="setting-item">
      <p class="help-text">
        Configure the display order of {{ type }} plugins and their instances. Drag plugins to
        reorder them, and drag instances within each plugin to reorder instances. Each level can
        only be reordered within its own scope.
      </p>
    </div>

    <div v-if="plugins.length === 0" class="no-plugins-message">
      <p class="help-text">
        No {{ type }} plugins are currently enabled. Enable plugins in the Plugins section to
        configure their display order here.
      </p>
    </div>

    <div v-else class="ordering-tree">
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
                <button
                  type="button"
                  class="plugin-drag-handle"
                  :aria-label="`Drag to reorder ${plugin.name}`"
                  :title="`Drag to reorder ${plugin.name}`"
                >
                  <span aria-hidden="true">⋮⋮</span>
                </button>
              </div>
              <div class="plugin-info">
                <strong>{{ plugin.name }}</strong>
                <span v-if="pluginInstances[plugin.id]?.length > 0" class="instance-count-badge">
                  {{ pluginInstances[plugin.id].length }}
                  {{ pluginInstances[plugin.id].length === 1 ? "instance" : "instances" }}
                </span>
              </div>
            </div>

            <!-- Nested instances list -->
            <div v-if="pluginInstances[plugin.id]?.length > 0" class="plugin-instances-tree">
              <draggable
                :model-value="pluginInstances[plugin.id]"
                :animation="200"
                handle=".instance-drag-handle"
                :group="`${type}-instances`"
                :data-plugin-id="plugin.id"
                item-key="id"
                @update:model-value="handleInstanceOrderChange(plugin.id, $event)"
                @start="handleInstanceDragStart(plugin.id)"
                @end="handleInstanceDragEnd(plugin.id)"
              >
                <template #item="{ element: instance }">
                  <div class="instance-tree-item">
                    <div class="instance-tree-header">
                      <button
                        type="button"
                        class="instance-drag-handle"
                        :aria-label="`Drag to reorder ${instance.name}`"
                        :title="`Drag to reorder ${instance.name}`"
                      >
                        <span aria-hidden="true">⋮⋮</span>
                      </button>
                      <span
                        v-if="instance.running !== undefined"
                        class="running-indicator"
                        :class="{
                          running: instance.running,
                          stopped: !instance.running,
                        }"
                        role="img"
                        :aria-label="instance.running ? 'Running' : 'Stopped'"
                        :title="instance.running ? 'Running' : 'Stopped'"
                      >
                        <span aria-hidden="true">{{ instance.running ? "●" : "○" }}</span>
                      </span>
                      <span class="instance-name">{{ instance.name }}</span>
                      <span
                        v-if="instance.config && getInstanceSummary(plugin.id, instance.config)"
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

defineProps({
  type: {
    type: String,
    required: true,
    validator: value => ["service", "image"].includes(value),
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
  "plugin-drag-start",
  "plugin-drag-end",
  "instance-drag-start",
  "instance-drag-end",
]);

const handlePluginOrderChange = newOrder => {
  emit("plugin-order-change", newOrder);
};

const handleInstanceOrderChange = (pluginId, newOrder) => {
  emit("instance-order-change", pluginId, newOrder);
};

const handlePluginDragStart = () => {
  emit("plugin-drag-start");
};

const handlePluginDragEnd = () => {
  emit("plugin-drag-end");
};

const handleInstanceDragStart = pluginId => {
  emit("instance-drag-start", pluginId);
};

const handleInstanceDragEnd = pluginId => {
  emit("instance-drag-end", pluginId);
};
</script>

<style scoped>
/* Renders inside a shell SettingsSection panel (ContentSettings.vue), so it
   supplies its own inner padding rather than panel chrome. */
.ordering-manager {
  width: 100%;
  padding: 0.875rem 1rem 1rem;
}

.ordering-manager > .setting-item {
  margin-bottom: 0.875rem;
}

.ordering-tree {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.plugin-tree-item {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  overflow: hidden;
}

.plugin-tree-item:hover {
  border-color: var(--focus);
  box-shadow: 0 2px 6px var(--shadow);
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
  color: var(--ink-2);
}

.order-number {
  font-weight: 600;
  color: var(--focus);
  min-width: 1.5rem;
  text-align: center;
  font-family: var(--font-data);
}

.plugin-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: grab;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--ink-3);
  user-select: none;
  touch-action: none;
}

.plugin-drag-handle:hover {
  color: var(--ink-2);
}

.plugin-drag-handle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  color: var(--ink-2);
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
  padding: 0.15rem 0.55rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--ink-2);
  font-family: var(--font-data);
}

.plugin-instances-tree {
  margin-left: 2rem;
  margin-right: 1rem;
  margin-bottom: 0.75rem;
  padding-left: 1rem;
  border-left: 2px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.instance-tree-item {
  padding: 0.4rem 0.6rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.instance-tree-item:hover {
  border-color: var(--focus);
}

.instance-tree-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.instance-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: grab;
  font-size: 1rem;
  line-height: 1;
  color: var(--ink-3);
  user-select: none;
  touch-action: none;
  flex-shrink: 0;
}

.instance-drag-handle:hover {
  color: var(--ink-2);
}

.instance-drag-handle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  color: var(--ink-2);
}

.instance-drag-handle:active {
  cursor: grabbing;
}

.running-indicator {
  display: inline-flex;
  font-size: 1rem;
  line-height: 1;
  flex-shrink: 0;
}

.running-indicator.running {
  color: var(--ok);
}

.running-indicator.stopped {
  color: var(--err);
}

.instance-name {
  font-weight: 500;
  color: var(--ink);
  flex: 0 0 auto;
  font-family: var(--font-ui);
}

.instance-summary {
  color: var(--ink-2);
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
  color: var(--ink-2);
  margin: 0;
  line-height: 1.4;
}

.no-plugins-message {
  padding: 2rem;
  text-align: center;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .plugin-tree-item,
  .instance-tree-item {
    transition: none;
  }
}
</style>
