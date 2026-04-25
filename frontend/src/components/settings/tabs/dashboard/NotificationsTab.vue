<template>
  <div class="notifications-tab">
    <CollapsibleSection title="Notifications" icon="🔔" :expanded="true">
      <SettingItem
        label="Enable Notifications"
        help="Show visual notifications for keyboard actions and mode changes."
      >
        <label>
          <input
            type="checkbox"
            :checked="config.keyboardFeedbackEnabled"
            @change="handleKeyboardFeedbackEnabledChange"
          />
          Enable Notifications
        </label>
      </SettingItem>

      <SettingItem
        v-if="config.keyboardFeedbackEnabled"
        label="Notification Style"
        help="Choose the size and position of notifications."
      >
        <select
          name="keyboardFeedbackMode"
          :value="config.keyboardFeedbackMode"
          @change="handleKeyboardFeedbackModeChange"
          class="form-select"
        >
          <option value="normal">Normal (Center, Large)</option>
          <option value="small">Small (Bottom-Right, Compact)</option>
        </select>
      </SettingItem>

      <SettingItem
        v-if="config.keyboardFeedbackEnabled"
        label="Mode Change Notification Timeout (seconds)"
        help="Time before mode change notifications auto-hide (0 = never hide, only applies to mode changes, not keyboard actions)"
      >
        <input
          name="modeIndicatorTimeout"
          :value="config.modeIndicatorTimeout"
          type="number"
          min="0"
          max="60"
          @change="handleModeIndicatorTimeoutChange"
        />
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const handleKeyboardFeedbackEnabledChange = event => {
  emit("update:config", { keyboardFeedbackEnabled: event.target.checked });
};

const handleKeyboardFeedbackModeChange = event => {
  emit("update:config", { keyboardFeedbackMode: event.target.value });
};

const handleModeIndicatorTimeoutChange = event => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { modeIndicatorTimeout: value });
  }
};
</script>

<style scoped>
.notifications-tab {
  width: 100%;
}

.form-select {
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

.form-select:hover {
  border-color: var(--accent-primary);
}

.form-select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}
</style>
