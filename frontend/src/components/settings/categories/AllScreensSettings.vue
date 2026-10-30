<!-- frontend/src/components/settings/categories/AllScreensSettings.vue -->
<template>
  <div class="all-screens-settings">
    <SettingsSection id="layout" title="All screens · Display">
      <SettingRow
        label="Orientation"
        description="Which way the screen is mounted. Pages & regions decides how regions stack."
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
      <SettingRow label="Upside down" description="For screens mounted with the cable on top.">
        <ToggleSwitch
          :model-value="config.orientationFlipped"
          aria-label="Upside down"
          @update:model-value="v => emit('update:config', { orientationFlipped: v })"
        />
      </SettingRow>
      <SettingRow
        label="Rotate the screen output"
        description="On: Calvin turns the Pi's picture itself. Off: leave it to the OS or the screen."
      >
        <ToggleSwitch
          :model-value="config.applyDisplayRotation"
          aria-label="Rotate the screen output"
          @update:model-value="v => emit('update:config', { applyDisplayRotation: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-power" title="All screens · Power">
      <SettingRow
        label="Screen on/off schedule"
        description="Turns the screen off and on at set times."
      >
        <ToggleSwitch
          :model-value="config.displayScheduleEnabled"
          aria-label="Screen on/off schedule"
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
        <SettingRow label="Timezone" description="Used by the schedule.">
          <SelectPill
            :model-value="config.timezone || 'system'"
            :options="timezoneOptions"
            @update:model-value="
              v => emit('update:config', { timezone: v === 'system' ? null : v })
            "
          />
        </SettingRow>
      </template>

      <SettingRow label="Turn off when idle">
        <SelectPill
          :model-value="idleValue"
          :options="idleOptions"
          aria-label="Turn off when idle"
          @update:model-value="setIdle"
        />
      </SettingRow>

      <SettingRow label="Screen now">
        <div class="device-actions">
          <button type="button" class="device-btn" @click="onTurnOff">Turn off</button>
          <button type="button" class="device-btn" @click="onTurnOn">Turn on</button>
        </div>
      </SettingRow>

      <!-- The reboot combo restarts the Pi, so it sits under Power (decision C). -->
      <RebootCombo :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="device-keyboard" title="All screens · Touch & keyboard">
      <SettingRow
        label="Touchscreen"
        description="Shows touch buttons: arrows, page dots, the ✕ in fullscreen. Auto works for most screens; choose On if a touch panel acts like a mouse."
      >
        <template #label-extra><ScopeChip /></template>
        <SegmentedControl
          :model-value="touchMode"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Touchscreen"
          @update:model-value="setTouchMode"
        />
      </SettingRow>
      <SettingRow label="Show it">
        <template #label-extra><ScopeChip /></template>
        <template #description>
          <p class="setting-row__desc">
            <span>{{ oskDescription }}</span>
            <button
              v-if="oskMode === 'auto' && oskHardwareSeen"
              type="button"
              class="device-osk-show-again"
              @click="showOskAgain"
            >
              Show it again
            </button>
          </p>
        </template>
        <SegmentedControl
          :model-value="oskMode"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ]"
          aria-label="Show it"
          @update:model-value="setOskMode"
        />
      </SettingRow>
      <p class="device-live" aria-live="polite">{{ oskLiveMessage }}</p>
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
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useSystem } from "@/composables";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ScopeChip from "@/components/settings/shell/ScopeChip.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import RebootCombo from "@/components/settings/tabs/layout/keyboard/RebootCombo.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useOskHardwareSeen } from "@/composables/useOnScreenKeyboard";
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

// --- Turning the screen off when idle --------------------------------------
// One choice instead of a toggle plus a "(0 = never)" number: the option list
// is the whole story. Never means the timeout is off; any other option turns
// it on with that many seconds.
const IDLE_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
];
const idleLabel = seconds => {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
};
const idleValue = computed(() => {
  if (!props.config.displayTimeoutEnabled) return 0;
  return Number(props.config.displayTimeout) || 0;
});
const idleOptions = computed(() => {
  const current = idleValue.value;
  if (IDLE_OPTIONS.some(option => option.value === current)) return IDLE_OPTIONS;
  return [...IDLE_OPTIONS, { value: current, label: idleLabel(current) }].sort(
    (a, b) => a.value - b.value
  );
});
const setIdle = seconds => {
  if (!seconds) {
    emit("update:config", { displayTimeoutEnabled: false });
    return;
  }
  emit("update:config", { displayTimeoutEnabled: true, displayTimeout: seconds });
};

// --- Touchscreen (settings copy audit §2) -----------------------------------
// A mouse PC and a wall panel need opposite answers, so the choice lives in
// this browser (or this kiosk's overrides). The server value is the seed a
// screen with no choice of its own starts from.
const touchSetting = useScreenSetting("touchControls", {
  storageKey: "calvin-touch-controls",
  serverValue: () => props.config.touchControls,
});
const touchMode = computed(() => touchSetting.value.value || "auto");
const setTouchMode = value => touchSetting.set(value);

// --- On-screen keyboard: Auto · Always · Never, per screen (CLV-27 §6) ------
// The row edits this screen: a kiosk override on a kiosk, localStorage on any
// other browser. The server key remains the default for screens without one.
const oskSetting = useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" });
const oskMode = computed(() => oskSetting.value.value || "auto");
const { seen: oskHardwareSeen, forget: forgetOskHardware } = useOskHardwareSeen();
const oskLiveMessage = ref("");
// Each mode says what it will actually do here, including the fallback after a
// real keyboard was used (CLV-27 §6) — the row's value alone can't say that.
const oskDescription = computed(() => {
  if (oskMode.value === "on") return "Shows whenever you tap a text field.";
  if (oskMode.value === "off") {
    return "Never shows by itself. On a touchscreen, tap Keyboard by a field to open it.";
  }
  if (oskHardwareSeen.value) return "Hidden here because a keyboard was used.";
  return "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen.";
});
const setOskMode = value => oskSetting.set(value);
const showOskAgain = () => {
  forgetOskHardware();
  oskLiveMessage.value = "On-screen keyboard will show again.";
};

// --- On-screen keyboard layout (spec §7, K7) -------------------------------
// The keyboard layout is its own setting. It is never derived from, and never
// changes, the language Calvin's UI is shown in.
const layoutOptions = oskLayoutOptions();
const oskOff = computed(() => oskMode.value === "off");
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
  { value: "system", label: "Server's timezone" },
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
.all-screens-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
/* Slot content is in this component's scope, not SettingRow's. */
.setting-row__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.device-osk-show-again {
  margin-left: 4px;
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: inherit;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.device-osk-show-again:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.device-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
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
