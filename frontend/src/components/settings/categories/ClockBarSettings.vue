<template>
  <div class="clock-bar-settings">
    <SettingsSection id="clock-bar-clock" title="Clock">
      <SettingRow label="Show date" description="Display the date alongside the time.">
        <ToggleSwitch
          :model-value="config.clockShowDate"
          aria-label="Show date"
          @update:model-value="v => emit('update:config', { clockShowDate: v })"
        />
      </SettingRow>
      <SettingRow label="Show seconds" description="Update the time every second.">
        <ToggleSwitch
          :model-value="config.clockShowSeconds"
          aria-label="Show seconds"
          @update:model-value="v => emit('update:config', { clockShowSeconds: v })"
        />
      </SettingRow>
      <SettingRow
        label="Show Calvin logo"
        description="Show a small Calvin glyph at the leading edge of the bar."
      >
        <ToggleSwitch
          :model-value="config.clockBarShowLogo !== false"
          aria-label="Show Calvin logo"
          @update:model-value="v => emit('update:config', { clockBarShowLogo: v })"
        />
      </SettingRow>
      <SettingRow
        label="Show plugin items"
        description="Show statusbar items from plugins (e.g. weather). Each service opts in via its own settings."
      >
        <ToggleSwitch
          :model-value="config.clockBarShowPluginItems !== false"
          aria-label="Show plugin items"
          @update:model-value="v => emit('update:config', { clockBarShowPluginItems: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="clock-bar-layout" title="Bar layout">
      <SettingRow
        label="Horizontal layout"
        description="How time and date are arranged on the top and bottom bars."
      >
        <SelectPill
          :model-value="config.clockBarLayout || 'single-line'"
          :options="[
            { value: 'single-line', label: 'Single line' },
            { value: 'two-lines', label: 'Two lines' },
          ]"
          @update:model-value="v => emit('update:config', { clockBarLayout: v })"
        />
      </SettingRow>
      <SettingRow
        stacked
        label="Horizontal sizing"
        description="Time, date, and padding for the top and bottom bars."
      >
        <ClockBarFontSizePicker
          :time-size="config.clockBarFontSize || 16"
          :date-size="config.clockBarDateFontSize || 14"
          :layout="config.clockBarLayout || 'single-line'"
          :padding="config.clockBarPadding ?? 8"
          :plugin-item-size="config.clockBarPluginItemSize ?? 16"
          :show-date="config.clockShowDate"
          :is-vertical="false"
          @update:time-size="v => emit('update:config', { clockBarFontSize: v })"
          @update:date-size="v => emit('update:config', { clockBarDateFontSize: v })"
          @update:padding="v => emit('update:config', { clockBarPadding: v })"
          @update:plugin-item-size="v => emit('update:config', { clockBarPluginItemSize: v })"
        />
      </SettingRow>
      <SettingRow
        label="Vertical layout"
        description="How time and date are arranged on the left and right bars."
      >
        <SelectPill
          :model-value="config.clockBarVerticalLayout || 'upright'"
          :options="[
            { value: 'upright', label: 'Upright' },
            { value: 'compact-time', label: 'Compact time' },
            { value: 'compact-time-date', label: 'Compact time & date' },
          ]"
          @update:model-value="v => emit('update:config', { clockBarVerticalLayout: v })"
        />
      </SettingRow>
      <SettingRow
        stacked
        label="Vertical sizing"
        description="Time, date, and padding for the left and right vertical bars."
      >
        <ClockBarFontSizePicker
          :time-size="config.clockBarVerticalFontSize || 18"
          :date-size="config.clockBarVerticalDateFontSize || 11"
          :layout="config.clockBarVerticalLayout || 'upright'"
          :padding="config.clockBarVerticalPadding ?? 8"
          :plugin-item-size="config.clockBarVerticalPluginItemSize ?? 16"
          :show-date="config.clockShowDate"
          :is-vertical="true"
          :max="48"
          @update:time-size="v => emit('update:config', { clockBarVerticalFontSize: v })"
          @update:date-size="v => emit('update:config', { clockBarVerticalDateFontSize: v })"
          @update:padding="v => emit('update:config', { clockBarVerticalPadding: v })"
          @update:plugin-item-size="
            v => emit('update:config', { clockBarVerticalPluginItemSize: v })
          "
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="clock-bar-items" title="Bar items">
      <ClockBarItemsTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import ClockBarFontSizePicker from "@/components/settings/shared/ClockBarFontSizePicker.vue";
import ClockBarItemsTab from "@/components/settings/tabs/clock-bar/ClockBarItemsTab.vue";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
</script>

<style scoped>
.clock-bar-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
