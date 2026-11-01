<template>
  <div class="pi-wrap">
    <div class="pi-header">
      <h4 class="pi-title heading-group">
        {{ instanceLabelPlural }}
        <Tag v-if="instances.length > 0" class="pi-count" count>{{ instances.length }}</Tag>
      </h4>
      <Button variant="secondary" @click="$emit('add-instance')">
        + Add {{ instanceLabel.toLowerCase() }}
      </Button>
    </div>

    <EmptyState
      v-if="instances.length === 0"
      compact
      :inset="false"
      :icon="mdiPuzzleOutline"
      :message="`No ${instanceLabelPlural.toLowerCase()} yet. Add one to get started.`"
    />

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
        <ListRow :name="instance.name" :disabled="!instance.enabled" class="pi-item">
          <template #lead>
            <span class="pi-lead">
              <span class="pi-drag" title="Drag to reorder" aria-hidden="true">⠿</span>
              <span
                v-if="instance.running !== undefined"
                class="pi-dot"
                :class="instance.running ? 'pi-dot--on' : 'pi-dot--off'"
                :title="instance.running ? 'Working' : 'Off'"
              />
            </span>
          </template>

          <template #meta>
            <span v-if="getInstanceSummary && getInstanceSummary(instance)" class="pi-summary">{{
              getInstanceSummary(instance)
            }}</span>
          </template>

          <template #actions>
            <ToggleSwitch
              :model-value="!!instance.enabled"
              :aria-label="`Enable ${instance.name}`"
              @update:model-value="v => handleToggle(instance.id, v)"
            />
            <Button
              variant="secondary"
              size="sm"
              title="Edit"
              @click="$emit('edit-instance', instance)"
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              title="Delete"
              @click="handleDelete(instance.id, instance.name)"
            >
              Delete
            </Button>
          </template>
        </ListRow>
      </template>
    </draggable>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { mdiPuzzleOutline } from "@mdi/js";
import draggable from "vuedraggable";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ListRow from "@/components/ui/ListRow.vue";
import Tag from "@/components/ui/Tag.vue";
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
  backend: "Source",
  service: "Source",
};

const instanceLabel = computed(
  () => props.plugin.instance_label || instanceLabelMap[props.plugin.type] || "Source"
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
.pi-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
  margin-bottom: var(--gap-4);
}

.pi-title {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
}

.pi-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
}

.pi-lead {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
}

.pi-drag {
  cursor: grab;
  color: var(--ink-3);
  font-size: var(--text-label);
  line-height: 1;
  user-select: none;
}

.pi-drag:active {
  cursor: grabbing;
}

.pi-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-round);
}

.pi-dot--on {
  background: var(--ok);
}

.pi-dot--off {
  background: var(--ink-3);
}

.pi-summary {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
}
</style>
