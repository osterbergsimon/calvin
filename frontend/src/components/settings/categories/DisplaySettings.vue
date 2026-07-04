<template>
  <div class="display-settings">
    <!-- LAYOUT -->
    <SettingsSection id="layout" title="Layout">
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

    <!-- DASHBOARD SCREENS / REGIONS -->
    <SettingsSection id="regions" title="Screens & regions">
      <DashboardRegionsEditor
        :config="config"
        @update:config="patch => emit('update:config', patch)"
      />
    </SettingsSection>

    <!-- APPEARANCE -->
    <SettingsSection id="appearance" title="Appearance">
      <SettingRow label="Theme" description="The color theme applied to the whole dashboard.">
        <ThemePicker
          :selected-theme-id="config.selectedTheme"
          @select="id => emit('update:config', { selectedTheme: id })"
        />
      </SettingRow>
      <SettingRow label="Theme mode" description="Control whether light or dark mode is active.">
        <SelectPill
          :model-value="config.themeMode"
          :options="[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'auto', label: 'Auto' },
            { value: 'time', label: 'Time' },
          ]"
          aria-label="Theme mode"
          @update:model-value="v => emit('update:config', { themeMode: v })"
        />
      </SettingRow>
      <template v-if="config.themeMode === 'time'">
        <SettingRow
          label="Dark mode start (hour)"
          description="The hour of day when dark mode turns on (0–23)."
        >
          <NumberStepper
            :model-value="config.darkModeStart"
            :min="0"
            :max="23"
            aria-label="Dark mode start hour"
            @update:model-value="v => emit('update:config', { darkModeStart: v })"
          />
        </SettingRow>
        <SettingRow
          label="Dark mode end (hour)"
          description="The hour of day when dark mode turns off (0–23)."
        >
          <NumberStepper
            :model-value="config.darkModeEnd"
            :min="0"
            :max="23"
            aria-label="Dark mode end hour"
            @update:model-value="v => emit('update:config', { darkModeEnd: v })"
          />
        </SettingRow>
      </template>
      <SettingRow label="Typeface" description="The font family used throughout the dashboard.">
        <TypefacePicker />
      </SettingRow>
      <SettingRow
        label="Settings UI size"
        description="Scale this settings interface — text and controls. The live dashboard is not affected."
      >
        <SegmentedControl
          :model-value="config.uiSize"
          :options="UI_SIZE_OPTIONS"
          aria-label="Settings UI size"
          @update:model-value="v => emit('update:config', { uiSize: v })"
        />
      </SettingRow>
      <SettingRow
        label="Display name"
        description="A friendly name for this dashboard shown in the title bar."
      >
        <input
          class="display-name-input"
          type="text"
          :value="config.displayName"
          aria-label="Display name"
          @input="e => emit('update:config', { displayName: e.target.value })"
        />
      </SettingRow>
    </SettingsSection>

    <!-- KIOSK & WALL -->
    <SettingsSection id="kiosk-touch" title="Kiosk & wall">
      <!-- Enter the wall state -->
      <SettingRow
        label="Hide controls in kiosk mode"
        description="Suppress on-screen controls (the ⋯ menu, headers) for a clean wall display."
      >
        <ToggleSwitch
          :model-value="!config.showUI"
          aria-label="Hide controls in kiosk mode"
          @update:model-value="v => emit('update:config', { showUI: !v })"
        />
      </SettingRow>
      <!-- What survives hiding -->
      <SettingRow
        label="Keep clock bar visible"
        description="Keep the clock bar on-screen even when controls are hidden — it still shows the time and any status items."
      >
        <ToggleSwitch
          :model-value="config.clockBarShowInKiosk"
          aria-label="Keep clock bar visible"
          @update:model-value="v => emit('update:config', { clockBarShowInKiosk: v })"
        />
      </SettingRow>
      <!-- Visual calm -->
      <SettingRow
        label="Focus light"
        description="Highlights the active region. 'Only while controls are shown' turns it off when controls are hidden (e.g. a calm wall)."
      >
        <SelectPill
          :model-value="config.focusLightMode"
          :options="[
            { value: 'interaction', label: 'Only while controls shown' },
            { value: 'always', label: 'Always on' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Focus light"
          @update:model-value="v => emit('update:config', { focusLightMode: v })"
        />
      </SettingRow>
      <SettingRow
        label="Dim other regions"
        description="Reduce brightness of non-focused regions while the focus light is active."
      >
        <ToggleSwitch
          :model-value="config.focusLightDimOthers"
          aria-label="Dim other regions"
          @update:model-value="v => emit('update:config', { focusLightDimOthers: v })"
        />
      </SettingRow>
      <!-- Exit / reveal -->
      <SettingRow
        label="Reveal corner"
        description="Which screen corner reveals the controls on a press-and-hold while they're hidden."
      >
        <SelectPill
          :model-value="config.hotCornerPosition || 'bottom-left'"
          :options="[
            { value: 'bottom-left', label: 'Bottom left' },
            { value: 'bottom-right', label: 'Bottom right' },
            { value: 'top-left', label: 'Top left' },
            { value: 'top-right', label: 'Top right' },
          ]"
          aria-label="Reveal corner"
          @update:model-value="v => emit('update:config', { hotCornerPosition: v })"
        />
      </SettingRow>
      <SettingRow
        label="Reveal corner opacity"
        description="How visible the reveal corner is at rest (0 = invisible, but press-and-hold still reveals)."
      >
        <NumberStepper
          :model-value="config.hotCornerOpacity ?? 55"
          :min="0"
          :max="100"
          :step="5"
          aria-label="Reveal corner opacity percentage"
          @update:model-value="v => emit('update:config', { hotCornerOpacity: v })"
        />
      </SettingRow>
      <SettingRow
        label="Reveal corner size"
        description="Size of the corner target and its press-and-hold hit area."
      >
        <RangeSlider
          :model-value="config.hotCornerSize ?? 64"
          :min="40"
          :max="96"
          :step="4"
          unit="px"
          aria-label="Reveal corner size in pixels"
          @update:model-value="v => emit('update:config', { hotCornerSize: v })"
        />
      </SettingRow>
      <SettingRow
        label="Reveal hold time"
        description="How long to press-and-hold the corner before the controls appear."
      >
        <RangeSlider
          :model-value="config.hotCornerLongPressMs ?? 500"
          :min="200"
          :max="1200"
          :step="50"
          unit="ms"
          aria-label="Reveal hold time in milliseconds"
          @update:model-value="v => emit('update:config', { hotCornerLongPressMs: v })"
        />
      </SettingRow>
      <SettingRow
        label="Tap anywhere to show controls"
        description="When controls are hidden, tapping the calendar or photos brings them back. Off by default — use the reveal corner instead."
      >
        <ToggleSwitch
          :model-value="config.tapAnywhereReveal"
          aria-label="Tap anywhere to show controls"
          @update:model-value="v => emit('update:config', { tapAnywhereReveal: v })"
        />
      </SettingRow>
      <!-- Device: is this a touchscreen -->
      <SettingRow
        label="Touchscreen"
        description="Whether this device is treated as a touchscreen — shows touch navigation controls (region arrows, screen dots). Auto-detects; force on/off for hybrid setups."
      >
        <SelectPill
          :model-value="config.touchControls"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always on' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Touchscreen"
          @update:model-value="v => emit('update:config', { touchControls: v })"
        />
      </SettingRow>
      <SettingRow
        label="Touch target size"
        description="Size of the on-dashboard touch navigation buttons (calendar, photos, services). Independent of Settings UI size."
      >
        <SegmentedControl
          :model-value="config.touchControlSize"
          :options="[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]"
          aria-label="Touch target size"
          @update:model-value="v => emit('update:config', { touchControlSize: v })"
        />
      </SettingRow>
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import DashboardRegionsEditor from "@/components/settings/shared/DashboardRegionsEditor.vue";
import { UI_SIZE_OPTIONS } from "@/styles/uiScale";

defineProps({
  config: { type: Object, required: true },
});

const emit = defineEmits(["update:config"]);
</script>

<style scoped>
.display-settings {
  width: 100%;
}

.display-name-input {
  height: var(--control-height);
  min-height: var(--touch-target);
  padding: 0 0.875rem; /* 14px */
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
  min-width: 180px;
}

.display-name-input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
