<template>
  <div class="clock-bar-sections">
    <SettingsSection id="clock-bar-clock" title="Clock">
      <SettingRow label="Show date" description="Display the date alongside the time.">
        <ToggleSwitch
          :model-value="config.clockShowDate"
          aria-label="Show date"
          @update:model-value="v => emit('update:config', { clockShowDate: v })"
        />
      </SettingRow>
      <SettingRow label="Show seconds">
        <ToggleSwitch
          :model-value="config.clockShowSeconds"
          aria-label="Show seconds"
          @update:model-value="v => emit('update:config', { clockShowSeconds: v })"
        />
      </SettingRow>
      <SettingRow label="Show Calvin logo">
        <ToggleSwitch
          :model-value="config.clockBarShowLogo !== false"
          aria-label="Show Calvin logo"
          @update:model-value="v => emit('update:config', { clockBarShowLogo: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="clock-bar-layout" title="Clock bar layout">
      <SettingRow label="Top or bottom bar">
        <SelectPill
          :model-value="config.clockBarLayout || 'single-line'"
          :options="[
            { value: 'single-line', label: 'Single line' },
            { value: 'two-lines', label: 'Two lines' },
          ]"
          aria-label="Top or bottom bar"
          @update:model-value="v => emit('update:config', { clockBarLayout: v })"
        />
      </SettingRow>
      <ClockBarSizePicker
        label="Top or bottom bar"
        orientation="horizontal"
        :time-size="config.clockBarFontSize || 16"
        :padding="config.clockBarPadding ?? 8"
        :plugin-item-size="config.clockBarPluginItemSize ?? 16"
        @update="patch => emit('update:config', clockBarSizePatch(patch, 'horizontal'))"
      />
      <SettingRow label="Side bar">
        <SelectPill
          :model-value="config.clockBarVerticalLayout || 'upright'"
          :options="[
            { value: 'upright', label: 'Upright' },
            { value: 'compact-time', label: 'Compact time' },
            { value: 'compact-time-date', label: 'Compact time & date' },
          ]"
          aria-label="Side bar"
          @update:model-value="v => emit('update:config', { clockBarVerticalLayout: v })"
        />
      </SettingRow>
      <ClockBarSizePicker
        label="Side bar"
        orientation="vertical"
        :max="48"
        :time-size="config.clockBarVerticalFontSize || 18"
        :padding="config.clockBarVerticalPadding ?? 8"
        :plugin-item-size="config.clockBarVerticalPluginItemSize ?? 16"
        @update="patch => emit('update:config', clockBarSizePatch(patch, 'vertical'))"
      />
      <ClockBarPreview :config="config" />
    </SettingsSection>

    <SettingsSection id="clock-bar-items" title="Clock bar items">
      <ClockBarItemsTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import ClockBarSizePicker from "@/components/settings/shared/ClockBarSizePicker.vue";
import ClockBarPreview from "@/components/settings/shared/ClockBarPreview.vue";
import ClockBarItemsTab from "@/components/settings/tabs/clock-bar/ClockBarItemsTab.vue";
import { clockBarSizePatch } from "@/utils/clockBarSizes";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
</script>
