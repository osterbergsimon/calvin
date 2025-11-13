<template>
  <div v-if="actions && actions.length > 0" class="plugin-actions" style="margin-top: 1rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
    <button
      v-for="action in actions"
      :key="action.id"
      :class="action.style === 'primary' ? 'btn-primary' : 'btn-secondary'"
      :disabled="isActionDisabled(action)"
      @click="handleAction(action)"
      :title="action.type === 'custom' ? `Custom action: ${action.id}` : ''"
    >
      {{ getActionLabel(action) }}
    </button>
    
    <!-- Status messages -->
    <span
      v-if="saveStatus"
      :class="saveStatus.success ? 'success-message' : 'error-message'"
      style="margin-left: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px;"
    >
      {{ saveStatus.message }}
    </span>
    <span
      v-if="testStatus"
      :class="testStatus.success ? 'success-message' : 'error-message'"
      style="margin-left: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px;"
    >
      {{ testStatus.message }}
    </span>
    <span
      v-if="fetchStatus"
      :class="fetchStatus.success ? 'success-message' : 'error-message'"
      style="margin-left: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px;"
    >
      {{ fetchStatus.message }}
    </span>
  </div>
</template>

<script setup>
// No imports needed

const props = defineProps({
  pluginId: {
    type: String,
    required: true,
  },
  actions: {
    type: Array,
    default: () => [],
  },
  saving: {
    type: Boolean,
    default: false,
  },
  testing: {
    type: Boolean,
    default: false,
  },
  fetching: {
    type: Boolean,
    default: false,
  },
  saveStatus: {
    type: Object,
    default: null,
  },
  testStatus: {
    type: Object,
    default: null,
  },
  fetchStatus: {
    type: Object,
    default: null,
  },
  // Pass form data for custom actions that need it
  formData: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['save', 'test', 'fetch', 'custom-action']);

// Helper to get plugin ID - always use prop since endpoint may have placeholder
const getPluginIdFromAction = () => {
  // Always use the prop pluginId - the endpoint may contain {plugin_id} placeholder
  // that needs to be replaced later
  console.log("[PluginActions] Using pluginId from prop:", props.pluginId);
  return props.pluginId;
};

const isActionDisabled = (action) => {
  if (props.saving) return true;
  if (action.type === 'test' && props.testing) return true;
  if (action.type === 'fetch' && props.fetching) return true;
  if (action.type === 'custom' && action.loading) return true;
  return false;
};

const getActionLabel = (action) => {
  if (action.type === 'save' && props.saving) return 'Saving...';
  if (action.type === 'test' && props.testing) return 'Testing...';
  if (action.type === 'fetch' && props.fetching) return 'Fetching...';
  if (action.type === 'custom' && action.loading) return 'Loading...';
  return action.label || action.id;
};

const handleAction = (_action) => {
  console.log("[PluginActions] handleAction called with:", _action);
  switch (_action.type) {
    case 'save':
      emit('save');
      break;
    case 'test':
      emit('test');
      break;
    case 'fetch':
      emit('fetch');
      break;
    case 'custom': {
      const actionWithPluginId = {
        ..._action,
        pluginId: getPluginIdFromAction(),
      };
      console.log("[PluginActions] Emitting custom-action with:", actionWithPluginId);
      emit('custom-action', actionWithPluginId);
      break;
    }
    default:
      console.warn(`[PluginActions] Unknown action type: ${_action.type}`, _action);
  }
};
</script>

<style scoped>
.plugin-actions {
  margin-top: 1rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.btn-primary {
  background: var(--accent-secondary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-message {
  background: var(--accent-success, #10b981);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.error-message {
  background: var(--accent-error, #ef4444);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
}
</style>

