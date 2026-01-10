<template>
  <div class="keyboard-tab">
    <CollapsibleSection title="Keyboard Type" icon="⌨️" :expanded="true">
      <SettingItem
        label="Keyboard Type"
        help="Select your keyboard type. This determines which keys are available for mapping."
      >
        <select
          :value="config.keyboardType || '7-button'"
          class="keyboard-type-select"
          @change="handleKeyboardTypeChange"
        >
          <option value="7-button">7-Button Keyboard</option>
          <option value="standard">Standard Keyboard</option>
        </select>
        <span class="help-text">
          Choose your keyboard type. 7-button keyboards have 7 physical buttons
          (KEY_1 through KEY_7), while standard keyboards use arrow keys, space,
          and other standard keys.
        </span>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Keyboard Mappings" icon="⌨️" :expanded="true">
      <SettingItem
        label="Keyboard Mappings"
        help="Configure keyboard shortcuts and mappings for your keyboard type"
      >
        <div v-if="loading" class="loading-message">Loading mappings...</div>
        <div v-else-if="error" class="error-message">{{ error }}</div>
        <div
          v-else-if="
            availableKeys.length === 0 && config.keyboardType !== 'standard'
          "
          class="no-keys-message"
        >
          No keys available for this keyboard type.
        </div>
        <div v-else class="mappings-list">
          <!-- Add new key button for standard keyboards -->
          <div
            v-if="config.keyboardType === 'standard'"
            class="add-key-section"
          >
            <select v-model="newKeyToAdd" class="key-selector">
              <option value="">-- Add a key to map --</option>
              <option
                v-for="key in STANDARD_KEYS.filter(
                  (k) => !availableKeys.includes(k),
                )"
                :key="key"
                :value="key"
              >
                {{ formatKeyName(key) }}
              </option>
            </select>
            <button v-if="newKeyToAdd" class="btn-add-key" @click="addNewKey">
              Add Key
            </button>
          </div>
          <div v-for="key in availableKeys" :key="key" class="mapping-item">
            <div class="mapping-key">
              <strong>{{ formatKeyName(key) }}</strong>
            </div>
            <select
              :value="currentMappings[key] || 'none'"
              class="mapping-action"
              @change="updateMapping(key, $event.target.value)"
            >
              <option
                v-for="action in availableActions"
                :key="action.value"
                :value="action.value"
              >
                {{ action.label }}
              </option>
            </select>
            <button
              class="btn-clear"
              title="Clear mapping"
              @click="clearMapping(key)"
            >
              ×
            </button>
          </div>
        </div>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";
import { useConfigStore } from "@/stores/config";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const keyboardStore = useKeyboardStore();
const configStore = useConfigStore();

const emit = defineEmits(["update:config"]);

const currentMappings = ref({});
const loading = ref(false);
const error = ref(null);
const newKeyToAdd = ref("");

// Available actions for keyboard mappings
const availableActions = [
  // Mode selection buttons (4 buttons)
  { value: "mode_calendar", label: "Mode: Calendar" },
  { value: "mode_photos", label: "Mode: Photos" },
  { value: "mode_web_services", label: "Mode: Web Services" },
  { value: "mode_spare", label: "Mode: Spare (Future Use)" },

  // Generic context-aware buttons (3 buttons)
  { value: "generic_next", label: "Generic: Next (context-aware)" },
  { value: "generic_prev", label: "Generic: Previous (context-aware)" },
  {
    value: "generic_expand_close",
    label: "Generic: Expand/Close (context-aware)",
  },

  // Legacy/Advanced actions (for direct mapping if needed)
  { value: "mode_settings", label: "Open Settings" },
  { value: "mode_cycle", label: "Cycle Between Modes" },
  { value: "calendar_next", label: "Calendar: Next (context-aware)" },
  { value: "calendar_prev", label: "Calendar: Previous (context-aware)" },
  { value: "calendar_next_month", label: "Calendar: Next Month (legacy)" },
  { value: "calendar_prev_month", label: "Calendar: Previous Month (legacy)" },
  { value: "calendar_expand", label: "Calendar: Expand (context-aware)" },
  { value: "calendar_expand_today", label: "Calendar: Expand Today (legacy)" },
  { value: "calendar_collapse", label: "Calendar: Collapse (direct)" },

  // Image-specific actions
  { value: "images_next", label: "Images: Next" },
  { value: "images_prev", label: "Images: Previous" },
  { value: "photos_enter_fullscreen", label: "Photos: Enter Fullscreen" },
  { value: "photos_exit_fullscreen", label: "Photos: Exit Fullscreen" },

  // Web service-specific actions
  { value: "web_service_1", label: "Web Service 1" },
  { value: "web_service_2", label: "Web Service 2" },
  { value: "web_service_next", label: "Web Service: Next" },
  { value: "web_service_prev", label: "Web Service: Previous" },
  { value: "web_service_close", label: "Web Service: Close/Exit" },

  { value: "none", label: "No Action" },
];

// Standard keyboard keys - comprehensive list
const STANDARD_KEYS = [
  // Arrow keys
  "KEY_UP",
  "KEY_DOWN",
  "KEY_LEFT",
  "KEY_RIGHT",
  // Modifier keys
  "KEY_CTRL",
  "KEY_ALT",
  "KEY_SHIFT",
  "KEY_META",
  // Function keys
  "KEY_F1",
  "KEY_F2",
  "KEY_F3",
  "KEY_F4",
  "KEY_F5",
  "KEY_F6",
  "KEY_F7",
  "KEY_F8",
  "KEY_F9",
  "KEY_F10",
  "KEY_F11",
  "KEY_F12",
  // Navigation keys
  "KEY_HOME",
  "KEY_END",
  "KEY_PAGEUP",
  "KEY_PAGEDOWN",
  "KEY_INSERT",
  "KEY_DELETE",
  // Common keys
  "KEY_SPACE",
  "KEY_ENTER",
  "KEY_TAB",
  "KEY_ESC",
  "KEY_BACKSPACE",
  // Number keys
  "KEY_0",
  "KEY_1",
  "KEY_2",
  "KEY_3",
  "KEY_4",
  "KEY_5",
  "KEY_6",
  "KEY_7",
  "KEY_8",
  "KEY_9",
  // Letter keys (common ones)
  "KEY_A",
  "KEY_B",
  "KEY_C",
  "KEY_D",
  "KEY_E",
  "KEY_F",
  "KEY_G",
  "KEY_H",
  "KEY_I",
  "KEY_J",
  "KEY_K",
  "KEY_L",
  "KEY_M",
  "KEY_N",
  "KEY_O",
  "KEY_P",
  "KEY_Q",
  "KEY_R",
  "KEY_S",
  "KEY_T",
  "KEY_U",
  "KEY_V",
  "KEY_W",
  "KEY_X",
  "KEY_Y",
  "KEY_Z",
];

// Get available keys for the current keyboard type
const availableKeys = computed(() => {
  const keyboardType = props.config.keyboardType || "7-button";

  if (keyboardType === "7-button") {
    return ["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7"];
  } else if (keyboardType === "standard") {
    // For standard keyboards, show all mapped keys plus allow adding new ones
    // Start with common defaults, but allow any key to be mapped
    const mappedKeys = Object.keys(currentMappings.value);
    const defaultKeys = [
      "KEY_RIGHT",
      "KEY_LEFT",
      "KEY_UP",
      "KEY_DOWN",
      "KEY_SPACE",
      "KEY_1",
      "KEY_2",
      "KEY_S",
    ];
    // Combine defaults with any already-mapped keys, remove duplicates
    const allKeys = [...new Set([...defaultKeys, ...mappedKeys])];
    return allKeys.sort();
  }
  return [];
});

// Format key name for display
const formatKeyName = (key) => {
  return key.replace("KEY_", "").replace(/_/g, " ").toLowerCase();
};

// Load keyboard mappings
const loadKeyboardMappings = async () => {
  loading.value = true;
  error.value = null;
  try {
    const keyboardType = props.config.keyboardType || "7-button";
    await keyboardStore.fetchMappings(keyboardType);

    // Mappings structure: { "7-button": { "KEY_1": "action" }, "standard": { ... } }
    if (keyboardStore.mappings[keyboardType]) {
      currentMappings.value = { ...keyboardStore.mappings[keyboardType] };
    } else {
      currentMappings.value = {};
    }
  } catch (err) {
    console.error("Failed to load keyboard mappings:", err);
    error.value = err.message || "Failed to load keyboard mappings";
  } finally {
    loading.value = false;
  }
};

// Save keyboard mappings
const saveKeyboardMappings = async () => {
  try {
    const keyboardType = props.config.keyboardType || "7-button";
    const mappings = {
      [keyboardType]: { ...currentMappings.value },
    };
    await keyboardStore.updateMappings(mappings);
  } catch (err) {
    console.error("Failed to save keyboard mappings:", err);
    error.value = err.message || "Failed to save keyboard mappings";
    throw err;
  }
};

// Update a mapping
const updateMapping = async (key, action) => {
  currentMappings.value[key] = action;
  await saveKeyboardMappings();
};

// Clear a mapping
const clearMapping = async (key) => {
  // For standard keyboards, remove the key entirely
  if (props.config.keyboardType === "standard") {
    delete currentMappings.value[key];
  } else {
    currentMappings.value[key] = "none";
  }
  await saveKeyboardMappings();
};

// Add a new key to map (for standard keyboards)
const addNewKey = async () => {
  if (newKeyToAdd.value && !currentMappings.value[newKeyToAdd.value]) {
    currentMappings.value[newKeyToAdd.value] = "none";
    newKeyToAdd.value = "";
    await saveKeyboardMappings();
  }
};

// Handle keyboard type change
const handleKeyboardTypeChange = async (event) => {
  const newType = event.target.value;
  // Update keyboard store first
  keyboardStore.setKeyboardType(newType);
  // Update config (this will trigger save via parent)
  emit("update:config", { keyboardType: newType });
  // Reload mappings for the new type
  await loadKeyboardMappings();
};

// Watch for keyboard type changes (for external updates)
watch(
  () => props.config.keyboardType,
  async (newType, oldType) => {
    if (newType !== oldType && newType) {
      keyboardStore.setKeyboardType(newType);
      await loadKeyboardMappings();
    }
  },
);

// Load mappings on mount
onMounted(async () => {
  // Set keyboard type in store
  if (props.config.keyboardType) {
    keyboardStore.setKeyboardType(props.config.keyboardType);
  }
  await loadKeyboardMappings();
});
</script>

<style scoped>
.keyboard-tab {
  width: 100%;
}

.mappings-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.mapping-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.mapping-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 4px var(--shadow);
}

.mapping-key {
  min-width: 150px;
  font-size: 1rem;
  color: var(--text-primary);
  font-weight: 600;
}

.mapping-action {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.95rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mapping-action:hover {
  border-color: var(--accent-primary);
}

.mapping-action:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.btn-clear {
  background: var(--color-red);
  color: white;
  border: none;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-clear:hover {
  background: var(--color-red-dark);
  transform: scale(1.05);
}

.loading-message,
.error-message,
.no-keys-message {
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.loading-message {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.error-message {
  background: var(--bg-error);
  color: var(--color-red);
  border: 1px solid var(--color-red);
}

.no-keys-message {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.keyboard-type-select {
  width: 100%;
  max-width: 400px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.95rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.keyboard-type-select:hover {
  border-color: var(--accent-primary);
}

.keyboard-type-select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.add-key-section {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 1rem;
  background: var(--bg-tertiary);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  margin-bottom: 1rem;
}

.key-selector {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.95rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.key-selector:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.btn-add-key {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-key:hover {
  background: var(--accent-dark);
  border-color: var(--accent-dark);
}
</style>
