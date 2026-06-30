<template>
  <div class="display-settings">
    <!-- LAYOUT -->
    <SettingsSection id="layout" title="Layout">
      <SettingRow label="Orientation" description="How panels arrange on the screen.">
        <SegmentedControl
          :model-value="config.orientation"
          :options="[{value:'landscape',label:'Landscape'},{value:'portrait',label:'Portrait'}]"
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
      <SettingRow label="Apply display rotation" description="Apply the orientation setting to the OS display output.">
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

    <!-- CALENDAR -->
    <SettingsSection id="calendar" title="Calendar">
      <SettingRow label="Calendar view" description="The default layout used to display calendar events.">
        <SelectPill
          :model-value="config.calendarViewMode"
          :options="[{value:'month',label:'Month'},{value:'week',label:'Week'},{value:'day',label:'Day'},{value:'rolling',label:'Rolling'}]"
          aria-label="Calendar view"
          @update:model-value="v => emit('update:config', { calendarViewMode: v })"
        />
      </SettingRow>
      <SettingRow label="Weeks to show" description="Number of weeks visible in the rolling calendar view.">
        <NumberStepper
          :model-value="config.calendarWeeks"
          :min="1"
          :max="12"
          aria-label="Weeks to show"
          @update:model-value="v => emit('update:config', { calendarWeeks: v })"
        />
      </SettingRow>
      <SettingRow label="Week starts on" description="The first day shown in each calendar week.">
        <SelectPill
          :model-value="config.weekStartDay"
          :options="[
            {value:1,label:'Monday'},
            {value:2,label:'Tuesday'},
            {value:3,label:'Wednesday'},
            {value:4,label:'Thursday'},
            {value:5,label:'Friday'},
            {value:6,label:'Saturday'},
            {value:0,label:'Sunday'}
          ]"
          aria-label="Week starts on"
          @update:model-value="v => emit('update:config', { weekStartDay: v })"
        />
      </SettingRow>
      <SettingRow label="Weekend days" description="Days highlighted as the weekend on the calendar.">
        <ChipMultiSelect
          :model-value="config.weekendDays"
          :options="[
            {value:1,label:'Mon'},
            {value:2,label:'Tue'},
            {value:3,label:'Wed'},
            {value:4,label:'Thu'},
            {value:5,label:'Fri'},
            {value:6,label:'Sat'},
            {value:0,label:'Sun'}
          ]"
          aria-label="Weekend days"
          @update:model-value="v => emit('update:config', { weekendDays: v })"
        />
      </SettingRow>
      <SettingRow label="Show week numbers" description="Display ISO week numbers alongside each calendar row.">
        <ToggleSwitch
          :model-value="config.showWeekNumbers"
          aria-label="Show week numbers"
          @update:model-value="v => emit('update:config', { showWeekNumbers: v })"
        />
      </SettingRow>
      <SettingRow label="Time format" description="Whether event times are shown in 24-hour or 12-hour format.">
        <SegmentedControl
          :model-value="config.timeFormat"
          :options="[{value:'24h',label:'24h'},{value:'12h',label:'12h'}]"
          aria-label="Time format"
          @update:model-value="v => emit('update:config', { timeFormat: v })"
        />
      </SettingRow>
      <SettingRow label="Max visible events" description="How many events can appear in a single calendar cell.">
        <NumberStepper
          :model-value="config.maxVisibleEvents"
          :min="1"
          :max="20"
          aria-label="Max visible events"
          @update:model-value="v => emit('update:config', { maxVisibleEvents: v })"
        />
      </SettingRow>
      <SettingRow label="Highlight holidays" description="Mark public holidays and red days on the calendar.">
        <ToggleSwitch
          :model-value="config.showRedDays"
          aria-label="Highlight holidays"
          @update:model-value="v => emit('update:config', { showRedDays: v })"
        />
      </SettingRow>
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
          :options="[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'auto',label:'Auto'},{value:'time',label:'Time'}]"
          aria-label="Theme mode"
          @update:model-value="v => emit('update:config', { themeMode: v })"
        />
      </SettingRow>
      <template v-if="config.themeMode === 'time'">
        <SettingRow label="Dark mode start (hour)" description="The hour of day when dark mode turns on (0–23).">
          <NumberStepper
            :model-value="config.darkModeStart"
            :min="0"
            :max="23"
            aria-label="Dark mode start hour"
            @update:model-value="v => emit('update:config', { darkModeStart: v })"
          />
        </SettingRow>
        <SettingRow label="Dark mode end (hour)" description="The hour of day when dark mode turns off (0–23).">
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
      <SettingRow label="Focus light" description="When the focus spotlight highlights the active region.">
        <SelectPill
          :model-value="config.focusLightMode"
          :options="[{value:'interaction',label:'When navigating'},{value:'always',label:'Always on'},{value:'off',label:'Off'}]"
          aria-label="Focus light"
          @update:model-value="v => emit('update:config', { focusLightMode: v })"
        />
      </SettingRow>
      <SettingRow label="Dim other regions" description="Reduce brightness of non-focused regions while the spotlight is active.">
        <ToggleSwitch
          :model-value="config.focusLightDimOthers"
          aria-label="Dim other regions"
          @update:model-value="v => emit('update:config', { focusLightDimOthers: v })"
        />
      </SettingRow>
      <SettingRow label="Hide controls in kiosk mode" description="Suppress on-screen controls when running in kiosk mode.">
        <ToggleSwitch
          :model-value="!config.showUI"
          aria-label="Hide controls in kiosk mode"
          @update:model-value="v => emit('update:config', { showUI: !v })"
        />
      </SettingRow>
      <SettingRow label="Touch controls" description="Whether on-screen touch navigation controls are shown.">
        <SelectPill
          :model-value="config.touchControls"
          :options="[{value:'auto',label:'Auto'},{value:'on',label:'Always on'},{value:'off',label:'Off'}]"
          aria-label="Touch controls"
          @update:model-value="v => emit('update:config', { touchControls: v })"
        />
      </SettingRow>
      <SettingRow label="Touch control size" description="Size of the on-screen touch navigation buttons.">
        <SegmentedControl
          :model-value="config.touchControlSize"
          :options="[{value:'small',label:'Small'},{value:'medium',label:'Medium'},{value:'large',label:'Large'}]"
          aria-label="Touch control size"
          @update:model-value="v => emit('update:config', { touchControlSize: v })"
        />
      </SettingRow>
      <SettingRow label="Display name" description="A friendly name for this dashboard shown in the title bar.">
        <input
          class="display-name-input"
          type="text"
          :value="config.displayName"
          aria-label="Display name"
          @input="e => emit('update:config', { displayName: e.target.value })"
        />
      </SettingRow>
    </SettingsSection>

    <!-- NOTIFICATIONS -->
    <SettingsSection id="notifications" title="Notifications">
      <SettingRow label="Enable feedback" description="Show a visual indicator when keyboard shortcuts are activated.">
        <ToggleSwitch
          :model-value="config.keyboardFeedbackEnabled"
          aria-label="Enable feedback"
          @update:model-value="v => emit('update:config', { keyboardFeedbackEnabled: v })"
        />
      </SettingRow>
      <SettingRow label="Feedback style" description="Size of the keyboard feedback overlay.">
        <SegmentedControl
          :model-value="config.keyboardFeedbackMode"
          :options="[{value:'normal',label:'Normal'},{value:'small',label:'Small'}]"
          aria-label="Feedback style"
          @update:model-value="v => emit('update:config', { keyboardFeedbackMode: v })"
        />
      </SettingRow>
      <SettingRow label="Auto-hide delay (s)" description="Seconds before the mode indicator fades out automatically.">
        <NumberStepper
          :model-value="config.modeIndicatorTimeout"
          :min="0"
          :max="60"
          aria-label="Auto-hide delay in seconds"
          @update:model-value="v => emit('update:config', { modeIndicatorTimeout: v })"
        />
      </SettingRow>
    </SettingsSection>

    <!-- PLUGIN DISPLAY -->
    <SettingsSection id="plugin-display" title="Plugin Display">
      <SettingRow label="Meal-plan card size" description="Controls how large meal-plan cards appear in the dashboard.">
        <SegmentedControl
          :model-value="config.mealPlanCardSize"
          :options="[{value:'small',label:'Small'},{value:'medium',label:'Medium'},{value:'large',label:'Large'}]"
          aria-label="Meal-plan card size"
          @update:model-value="v => emit('update:config', { mealPlanCardSize: v })"
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
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ThemePicker from "@/components/settings/shell/ThemePicker.vue";
import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import DashboardRegionsEditor from "@/components/settings/shared/DashboardRegionsEditor.vue";

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
  height: 48px;
  min-height: 44px;
  padding: 0 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--ink);
  min-width: 180px;
}

.display-name-input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
