<!-- frontend/src/components/settings/categories/DeviceSettings.vue -->
<template>
  <div class="device-settings">
    <SettingsSection id="device-power" title="Display power">
      <SettingRow
        label="Power schedule"
        description="Automatically turn the display off and on at set times."
      >
        <ToggleSwitch
          :model-value="config.displayScheduleEnabled"
          aria-label="Power schedule"
          @update:model-value="v => emit('update:config', { displayScheduleEnabled: v })"
        />
      </SettingRow>
      <template v-if="config.displayScheduleEnabled">
        <SettingRow label="Daily schedule" description="On and off times for each day of the week.">
          <DisplayScheduleGrid
            :model-value="config.displaySchedule || []"
            @update:model-value="v => emit('update:config', { displaySchedule: v })"
          />
        </SettingRow>
        <SettingRow
          label="Timezone"
          description="Timezone for the schedule. Leave as system default to use the Pi's timezone."
        >
          <SelectPill
            :model-value="config.timezone || 'system'"
            :options="timezoneOptions"
            @update:model-value="
              v => emit('update:config', { timezone: v === 'system' ? null : v })
            "
          />
        </SettingRow>
      </template>

      <SettingRow
        label="Screen timeout"
        description="Turn the display off after a period of inactivity."
      >
        <ToggleSwitch
          :model-value="config.displayTimeoutEnabled"
          aria-label="Screen timeout"
          @update:model-value="v => emit('update:config', { displayTimeoutEnabled: v })"
        />
      </SettingRow>
      <SettingRow
        v-if="config.displayTimeoutEnabled"
        label="Timeout"
        description="Seconds of inactivity before the display turns off (0 = never)."
      >
        <NumberStepper
          :model-value="config.displayTimeout || 0"
          :min="0"
          :max="3600"
          :step="60"
          aria-label="Display timeout in seconds"
          @update:model-value="v => emit('update:config', { displayTimeout: v })"
        />
      </SettingRow>

      <SettingRow label="Manual control" description="Turn the display on or off right now.">
        <div class="device-actions">
          <button type="button" class="device-btn" @click="onTurnOn">Turn on</button>
          <button type="button" class="device-btn" @click="onTurnOff">Turn off</button>
        </div>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-keyboard" title="Keyboard">
      <KeyboardTab />
    </SettingsSection>

    <SettingsSection id="device-notifications" title="Notifications">
      <SettingRow
        label="Enable feedback"
        description="Show a visual indicator when keyboard shortcuts are activated."
      >
        <ToggleSwitch
          :model-value="config.keyboardFeedbackEnabled"
          aria-label="Enable feedback"
          @update:model-value="v => emit('update:config', { keyboardFeedbackEnabled: v })"
        />
      </SettingRow>
      <SettingRow label="Feedback style" description="Size of the keyboard feedback overlay.">
        <SegmentedControl
          :model-value="config.keyboardFeedbackMode"
          :options="[
            { value: 'normal', label: 'Normal' },
            { value: 'small', label: 'Small' },
          ]"
          aria-label="Feedback style"
          @update:model-value="v => emit('update:config', { keyboardFeedbackMode: v })"
        />
      </SettingRow>
      <SettingRow
        label="Auto-hide delay (s)"
        description="Seconds before the mode indicator fades out automatically."
      >
        <NumberStepper
          :model-value="config.modeIndicatorTimeout"
          :min="0"
          :max="60"
          aria-label="Auto-hide delay in seconds"
          @update:model-value="v => emit('update:config', { modeIndicatorTimeout: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-reboot" title="Reboot combo">
      <SettingRow label="First key" description="First key in the reboot key combination.">
        <SelectPill
          :model-value="config.rebootComboKey1 || 'KEY_1'"
          :options="keyOptions"
          @update:model-value="v => emit('update:config', { rebootComboKey1: v })"
        />
      </SettingRow>
      <SettingRow label="Second key" description="Second key in the reboot key combination.">
        <SelectPill
          :model-value="config.rebootComboKey2 || 'KEY_7'"
          :options="keyOptions"
          @update:model-value="v => emit('update:config', { rebootComboKey2: v })"
        />
      </SettingRow>
      <SettingRow
        label="Hold duration"
        description="How long to hold both keys to trigger a reboot (milliseconds)."
      >
        <NumberStepper
          :model-value="config.rebootComboDuration || 10000"
          :min="1000"
          :max="60000"
          :step="1000"
          aria-label="Reboot combo duration in milliseconds"
          @update:model-value="v => emit('update:config', { rebootComboDuration: v })"
        />
      </SettingRow>
      <SettingRow label="Combo" :description="comboHint" />
    </SettingsSection>

    <SettingsSection id="device-hardware" title="Hardware">
      <SettingRow label="Backend version" :description="version || 'Unknown'" />
      <SettingRow label="Frontend version" :description="frontendVersion || 'Unknown'" />
      <SettingRow label="System status">
        <span class="device-status" :class="statusClass">{{ statusText }}</span>
      </SettingRow>
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useSystem } from "@/composables";
import { useConnectionStore } from "@/stores/connection";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";

const props = defineProps({
  config: { type: Object, required: true },
  version: { type: String, default: null },
  frontendVersion: { type: String, default: null },
});
const emit = defineEmits(["update:config"]);

const { turnDisplayOn, turnDisplayOff } = useSystem();
const connectionStore = useConnectionStore();

const keyOptions = ["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7"].map(k => ({
  value: k,
  label: k,
}));

const timezoneOptions = [
  { value: "system", label: "System default" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Denver", label: "Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
];

const comboHint = computed(() => {
  const k1 = props.config.rebootComboKey1 || "KEY_1";
  const k2 = props.config.rebootComboKey2 || "KEY_7";
  const secs = ((props.config.rebootComboDuration || 10000) / 1000).toFixed(1);
  return `Hold ${k1} + ${k2} for ${secs} seconds to reboot.`;
});

const statusText = computed(() => (connectionStore.isBackendOnline ? "● Online" : "○ Offline"));
const statusClass = computed(() => (connectionStore.isBackendOnline ? "is-online" : "is-offline"));

const onTurnOn = async () => {
  try {
    await turnDisplayOn();
  } catch (e) {
    console.error("Failed to turn display on:", e);
  }
};
const onTurnOff = async () => {
  try {
    await turnDisplayOff();
  } catch (e) {
    console.error("Failed to turn display off:", e);
  }
};
</script>

<style scoped>
.device-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.device-actions {
  display: flex;
  gap: 0.5rem;
}
.device-btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.device-btn:hover {
  border-color: var(--focus);
}
.device-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.device-status {
  font-family: var(--font-data);
  font-weight: 600;
}
.device-status.is-online {
  color: var(--ok);
}
.device-status.is-offline {
  color: var(--err);
}
</style>
