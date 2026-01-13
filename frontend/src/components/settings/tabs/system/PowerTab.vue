<template>
  <div class="power-tab">
    <CollapsibleSection title="Display Power Schedule" icon="⏰">
      <SettingItem
        label="Enable Display Power Schedule"
        help="Automatically turn display off/on at specified times"
      >
        <label>
          <input
            v-model="displayScheduleEnabled"
            type="checkbox"
            @change="handleScheduleEnabledChange"
          />
          Enable Display Power Schedule
        </label>
      </SettingItem>

      <div v-if="displayScheduleEnabled">
        <SettingItem
          label="Daily Schedule"
          help="Configure on/off times for each day"
        >
          <div class="schedule-days">
            <div
              v-for="(dayConfig, index) in displaySchedule"
              :key="index"
              class="schedule-day"
            >
              <div class="schedule-day-header">
                <label>
                  <input
                    v-model="dayConfig.enabled"
                    type="checkbox"
                    @change="handleScheduleChange"
                  />
                  {{ getDayName(dayConfig.day) }}
                </label>
              </div>
              <div v-if="dayConfig.enabled" class="schedule-day-times">
                <div class="schedule-time">
                  <label>On:</label>
                  <input
                    v-model="dayConfig.onTime"
                    type="time"
                    @change="handleScheduleChange"
                  />
                </div>
                <div class="schedule-time">
                  <label>Off:</label>
                  <input
                    v-model="dayConfig.offTime"
                    type="time"
                    @change="handleScheduleChange"
                  />
                </div>
              </div>
            </div>
          </div>
        </SettingItem>
      </div>

      <SettingItem
        label="Timezone"
        help="Timezone for display schedule. Leave as 'System Timezone' to use the Pi's timezone."
      >
        <select v-model="timezone" @change="handleTimezoneChange">
          <option :value="null">System Timezone (Default)</option>
          <option value="UTC">UTC</option>
          <option value="America/New_York">America/New_York (EST/EDT)</option>
          <option value="America/Chicago">America/Chicago (CST/CDT)</option>
          <option value="America/Denver">America/Denver (MST/MDT)</option>
          <option value="America/Los_Angeles">
            America/Los_Angeles (PST/PDT)
          </option>
          <option value="Europe/London">Europe/London (GMT/BST)</option>
          <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
          <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
          <option value="Europe/Stockholm">Europe/Stockholm (CET/CEST)</option>
          <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
          <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
          <option value="Australia/Sydney">Australia/Sydney (AEDT/AEST)</option>
        </select>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Display Timeout" icon="⏱️">
      <SettingItem
        label="Enable Display Timeout (Screensaver)"
        help="Turn display off after period of inactivity"
      >
        <label>
          <input
            v-model="displayTimeoutEnabled"
            type="checkbox"
            @change="handleTimeoutEnabledChange"
          />
          Enable Display Timeout
        </label>
      </SettingItem>

      <SettingItem
        v-if="displayTimeoutEnabled"
        label="Display Timeout (seconds)"
        help="Turn display off after this many seconds of inactivity (0 = never, max 3600)"
      >
        <input
          v-model.number="displayTimeout"
          type="number"
          min="0"
          max="3600"
          step="60"
          @change="handleTimeoutChange"
        />
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Manual Display Control" icon="🎛️">
      <SettingItem
        label="Manual Display Control"
        help="Manually control display power"
      >
        <div class="button-group">
          <button class="btn-secondary" @click="handleTurnDisplayOn">
            Turn Display On
          </button>
          <button class="btn-secondary" @click="handleTurnDisplayOff">
            Turn Display Off
          </button>
        </div>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Reboot Combo" icon="⌨️">
      <SettingItem label="First Key" help="First key for reboot combo">
        <select v-model="rebootComboKey1" @change="handleRebootComboChange">
          <option value="KEY_1">KEY_1</option>
          <option value="KEY_2">KEY_2</option>
          <option value="KEY_3">KEY_3</option>
          <option value="KEY_4">KEY_4</option>
          <option value="KEY_5">KEY_5</option>
          <option value="KEY_6">KEY_6</option>
          <option value="KEY_7">KEY_7</option>
        </select>
      </SettingItem>

      <SettingItem label="Second Key" help="Second key for reboot combo">
        <select v-model="rebootComboKey2" @change="handleRebootComboChange">
          <option value="KEY_1">KEY_1</option>
          <option value="KEY_2">KEY_2</option>
          <option value="KEY_3">KEY_3</option>
          <option value="KEY_4">KEY_4</option>
          <option value="KEY_5">KEY_5</option>
          <option value="KEY_6">KEY_6</option>
          <option value="KEY_7">KEY_7</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Combo Duration (milliseconds)"
        help="How long to hold both keys to trigger reboot (1000-60000 ms)"
      >
        <input
          v-model.number="rebootComboDuration"
          type="number"
          min="1000"
          max="60000"
          step="1000"
          @change="handleRebootComboChange"
        />
      </SettingItem>

      <SettingItem>
        <span class="help-text">
          Hold {{ rebootComboKey1 }} + {{ rebootComboKey2 }} for
          {{ (rebootComboDuration / 1000).toFixed(1) }} seconds to reboot
        </span>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
// import { useConfigForm } from "@/composables";
import { useSystem } from "@/composables";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits([
  "update:config",
  "turn-display-on",
  "turn-display-off",
]);

// Local state
const displayScheduleEnabled = ref(
  props.config.displayScheduleEnabled || false,
);
const displaySchedule = ref(
  props.config.displaySchedule || [
    { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" },
    { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" },
  ],
);
const timezone = ref(props.config.timezone || null);
const displayTimeoutEnabled = ref(props.config.displayTimeoutEnabled || false);
const displayTimeout = ref(props.config.displayTimeout || 0);
const rebootComboKey1 = ref(props.config.rebootComboKey1 || "KEY_1");
const rebootComboKey2 = ref(props.config.rebootComboKey2 || "KEY_7");
const rebootComboDuration = ref(props.config.rebootComboDuration || 10000);

const { turnDisplayOn, turnDisplayOff } = useSystem();

// Watch for prop changes
watch(
  () => props.config,
  (newConfig) => {
    displayScheduleEnabled.value = newConfig.displayScheduleEnabled || false;
    displaySchedule.value = newConfig.displaySchedule || displaySchedule.value;
    timezone.value = newConfig.timezone || null;
    displayTimeoutEnabled.value = newConfig.displayTimeoutEnabled || false;
    displayTimeout.value = newConfig.displayTimeout || 0;
    rebootComboKey1.value = newConfig.rebootComboKey1 || "KEY_1";
    rebootComboKey2.value = newConfig.rebootComboKey2 || "KEY_7";
    rebootComboDuration.value = newConfig.rebootComboDuration || 10000;
  },
  { deep: true },
);

const getDayName = (day) => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[day] || `Day ${day}`;
};

const handleScheduleEnabledChange = () => {
  emit("update:config", {
    displayScheduleEnabled: displayScheduleEnabled.value,
  });
};

const handleScheduleChange = () => {
  emit("update:config", { displaySchedule: displaySchedule.value });
};

const handleTimezoneChange = () => {
  emit("update:config", { timezone: timezone.value });
};

const handleTimeoutEnabledChange = () => {
  emit("update:config", { displayTimeoutEnabled: displayTimeoutEnabled.value });
};

const handleTimeoutChange = () => {
  emit("update:config", { displayTimeout: displayTimeout.value });
};

const handleRebootComboChange = () => {
  emit("update:config", {
    rebootComboKey1: rebootComboKey1.value,
    rebootComboKey2: rebootComboKey2.value,
    rebootComboDuration: rebootComboDuration.value,
  });
};

const handleTurnDisplayOn = async () => {
  try {
    await turnDisplayOn();
    emit("turn-display-on");
  } catch (error) {
    console.error("Failed to turn display on:", error);
  }
};

const handleTurnDisplayOff = async () => {
  try {
    await turnDisplayOff();
    emit("turn-display-off");
  } catch (error) {
    console.error("Failed to turn display off:", error);
  }
};
</script>

<style scoped>
.power-tab {
  width: 100%;
}

.schedule-days {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.schedule-day {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.schedule-day-header {
  margin-bottom: 0.5rem;
}

.schedule-day-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

.schedule-day-times {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.schedule-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.schedule-time label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.schedule-time input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.button-group {
  display: flex;
  gap: 0.75rem;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}
</style>
