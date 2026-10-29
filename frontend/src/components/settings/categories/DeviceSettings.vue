<!-- frontend/src/components/settings/categories/DeviceSettings.vue -->
<template>
  <div class="device-settings">
    <SettingsSection id="layout" title="Screen orientation">
      <SettingRow
        label="Orientation"
        description="Physical screen orientation. Per-screen region direction is set under Screens & regions."
      >
        <SegmentedControl
          :model-value="config.orientation"
          :options="[
            { value: 'landscape', label: 'Landscape' },
            { value: 'portrait', label: 'Portrait' },
          ]"
          aria-label="Orientation"
          @update:model-value="v => emit('update:config', { orientation: v })"
        />
      </SettingRow>
      <SettingRow label="Flip 180°" description="Rotate the display a half-turn.">
        <ToggleSwitch
          :model-value="config.orientationFlipped"
          aria-label="Flip 180°"
          @update:model-value="v => emit('update:config', { orientationFlipped: v })"
        />
      </SettingRow>
      <SettingRow
        label="Apply display rotation"
        description="Apply the orientation setting to the OS display output."
      >
        <ToggleSwitch
          :model-value="config.applyDisplayRotation"
          aria-label="Apply display rotation"
          @update:model-value="v => emit('update:config', { applyDisplayRotation: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-power" title="Screen power">
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
      <SettingRow
        label="On-screen keyboard"
        description="Shows a keyboard on the screen when you tap a text field. Auto turns it on for touch screens."
      >
        <SegmentedControl
          :model-value="config.onScreenKeyboard || 'auto'"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="On-screen keyboard"
          @update:model-value="v => emit('update:config', { onScreenKeyboard: v })"
        />
      </SettingRow>
      <SettingRow
        class="device-osk-layout"
        :class="{ 'setting-row--muted': oskOff }"
        label="Keyboard layout"
        description="The letters the on-screen keyboard uses. Separate from the language Calvin is shown in."
      >
        <div class="device-control device-osk-control" :inert="oskOff ? '' : undefined">
          <SelectPill
            :model-value="mainLayout"
            :options="layoutOptions"
            :display-label="mainLayoutLabel"
            aria-label="Keyboard layout"
            @update:model-value="onLayoutChange"
          />
          <p v-if="deviceLayout" class="device-osk-device">
            This screen uses {{ oskLayoutName(deviceLayout) }}, chosen on the keyboard.
            <button type="button" class="device-osk-use-default" @click="useDefaultLayout">
              Use default
            </button>
          </p>
        </div>
      </SettingRow>
      <SettingRow
        class="device-osk-extra"
        :class="{ 'setting-row--muted': oskOff }"
        label="Also switch to"
        :description="extraLayoutsDescription"
      >
        <div class="device-control" :inert="oskOff ? '' : undefined">
          <ChipMultiSelect
            :model-value="extraLayouts"
            :options="extraLayoutOptions"
            aria-label="Also switch to"
            @update:model-value="v => emit('update:config', { oskExtraLayouts: v })"
          />
        </div>
      </SettingRow>
      <KeyboardTab />
      <RebootCombo :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="device-notifications" title="Key-press feedback">
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
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useSystem } from "@/composables";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import RebootCombo from "@/components/settings/tabs/layout/keyboard/RebootCombo.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import {
  OSK_LAYOUT_CHANGE_EVENT,
  clearStoredOskLayout,
  normalizeOskExtraLayouts,
  oskLayoutName,
  oskLayoutOptions,
  readStoredOskLayout,
  resolveOskMainLayout,
} from "@/utils/oskLayouts";

const props = defineProps({
  config: { type: Object, required: true },
});
const emit = defineEmits(["update:config"]);

const { turnDisplayOn, turnDisplayOff } = useSystem();

// --- On-screen keyboard layout (spec §7, K7) -------------------------------
// The keyboard layout is its own setting. It is never derived from, and never
// changes, the language Calvin's UI is shown in.
const layoutOptions = oskLayoutOptions();
const oskOff = computed(() => (props.config.onScreenKeyboard || "auto") === "off");
// Unset `oskLayout` means the device's one-time browser hint is in effect.
// Resolve it once: the hint is cached per device and never follows the UI.
const layoutHint = resolveOskMainLayout(null);
const mainLayout = computed(() => resolveOskMainLayout(props.config.oskLayout ?? layoutHint));
const mainLayoutLabel = computed(() =>
  props.config.oskLayout ? "" : `${oskLayoutName(mainLayout.value)} (suggested)`
);
const extraLayouts = computed(() =>
  normalizeOskExtraLayouts(props.config.oskExtraLayouts ?? [], mainLayout.value)
);
const extraLayoutOptions = computed(() =>
  layoutOptions.filter(option => option.value !== mainLayout.value)
);
const extraLayoutsDescription = computed(
  () =>
    `Adds a key to the keyboard that switches between these and ${oskLayoutName(mainLayout.value)}.`
);
const onLayoutChange = value => {
  // The new main layout can't also be one of its own extras.
  emit("update:config", {
    oskLayout: value,
    oskExtraLayouts: extraLayouts.value.filter(id => id !== value),
  });
};

// A layout picked on the keyboard is a device choice, not server config
// (CLV-21 §5). Show it here so its origin is clear, with a way back.
const deviceLayout = ref(readStoredOskLayout());
const refreshDeviceLayout = () => {
  deviceLayout.value = readStoredOskLayout();
};
const useDefaultLayout = () => {
  clearStoredOskLayout();
  refreshDeviceLayout();
};
onMounted(() => window.addEventListener(OSK_LAYOUT_CHANGE_EVENT, refreshDeviceLayout));
onUnmounted(() => window.removeEventListener(OSK_LAYOUT_CHANGE_EVENT, refreshDeviceLayout));

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
.device-control {
  display: flex;
  justify-content: flex-end;
}
.device-osk-control {
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
}
/* A layout picked on the keyboard, under the Settings default. */
.device-osk-device {
  max-width: 24rem;
  margin: 0;
  color: var(--ink-2);
  font-size: var(--fs-sm);
  line-height: 1.4;
  text-align: right;
}
.device-osk-use-default {
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 500;
  text-decoration: underline;
  cursor: pointer;
}
.device-osk-use-default:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
/* Rows 2 and 3 of the keyboard section while the on-screen keyboard is Off. */
.setting-row--muted {
  opacity: 0.55;
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
</style>
