<template>
  <div class="content-settings">
    <SettingsSection id="content-calendars" title="Calendars">
      <CalendarSourcesTab :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="content-calendar-display" title="Calendar display">
      <SettingRow label="Week starts on" description="The first day shown in each calendar week.">
        <SelectPill
          :model-value="config.weekStartDay"
          :options="[
            { value: 1, label: 'Monday' },
            { value: 2, label: 'Tuesday' },
            { value: 3, label: 'Wednesday' },
            { value: 4, label: 'Thursday' },
            { value: 5, label: 'Friday' },
            { value: 6, label: 'Saturday' },
            { value: 0, label: 'Sunday' },
          ]"
          aria-label="Week starts on"
          @update:model-value="v => emit('update:config', { weekStartDay: v })"
        />
      </SettingRow>
      <SettingRow
        label="Weekend days"
        description="Days highlighted as the weekend on the calendar."
      >
        <ChipMultiSelect
          :model-value="config.weekendDays"
          :options="[
            { value: 1, label: 'Mon' },
            { value: 2, label: 'Tue' },
            { value: 3, label: 'Wed' },
            { value: 4, label: 'Thu' },
            { value: 5, label: 'Fri' },
            { value: 6, label: 'Sat' },
            { value: 0, label: 'Sun' },
          ]"
          aria-label="Weekend days"
          @update:model-value="v => emit('update:config', { weekendDays: v })"
        />
      </SettingRow>
      <SettingRow
        label="Show week numbers"
        description="Display ISO week numbers alongside each calendar row."
      >
        <ToggleSwitch
          :model-value="config.showWeekNumbers"
          aria-label="Show week numbers"
          @update:model-value="v => emit('update:config', { showWeekNumbers: v })"
        />
      </SettingRow>
      <SettingRow
        label="Time format"
        description="Whether event times are shown in 24-hour or 12-hour format."
      >
        <SegmentedControl
          :model-value="config.timeFormat"
          :options="[
            { value: '24h', label: '24h' },
            { value: '12h', label: '12h' },
          ]"
          aria-label="Time format"
          @update:model-value="v => emit('update:config', { timeFormat: v })"
        />
      </SettingRow>
      <SettingRow
        label="Max visible events"
        description="How many events can appear in a single calendar cell."
      >
        <NumberStepper
          :model-value="config.maxVisibleEvents"
          :min="1"
          :max="20"
          aria-label="Max visible events"
          @update:model-value="v => emit('update:config', { maxVisibleEvents: v })"
        />
      </SettingRow>
      <SettingRow
        label="Highlight holidays"
        description="Mark public holidays and red days on the calendar."
      >
        <ToggleSwitch
          :model-value="config.showRedDays"
          aria-label="Highlight holidays"
          @update:model-value="v => emit('update:config', { showRedDays: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-photos" title="Photos">
      <SettingRow
        label="Rotation interval"
        description="Seconds each photo is shown before advancing."
      >
        <NumberStepper
          :model-value="config.photoRotationInterval || 30"
          :min="5"
          :max="3600"
          :step="1"
          aria-label="Photo rotation interval in seconds"
          @update:model-value="v => emit('update:config', { photoRotationInterval: v })"
        />
      </SettingRow>
      <SettingRow label="Image display mode" description="How each image is fitted to the screen.">
        <SelectPill
          :model-value="config.imageDisplayMode || 'smart'"
          :options="[
            { value: 'smart', label: 'Smart' },
            { value: 'fit', label: 'Fit' },
            { value: 'fill', label: 'Fill' },
            { value: 'crop', label: 'Crop' },
            { value: 'center', label: 'Center' },
          ]"
          @update:model-value="v => emit('update:config', { imageDisplayMode: v })"
        />
      </SettingRow>
      <SettingRow
        label="Randomize image order"
        description="Shuffle the order photos are displayed in."
      >
        <ToggleSwitch
          :model-value="config.randomizeImages ?? false"
          aria-label="Randomize image order"
          @update:model-value="v => emit('update:config', { randomizeImages: v })"
        />
      </SettingRow>
      <SettingRow
        label="Photo-frame mode"
        description="Show a single photo full-screen as a digital frame."
      >
        <ToggleSwitch
          :model-value="config.photoFrameEnabled || config.photoFrameMode"
          aria-label="Photo-frame mode"
          @update:model-value="
            v => emit('update:config', { photoFrameEnabled: v, photoFrameMode: v })
          "
        />
      </SettingRow>
      <SettingRow
        v-if="config.photoFrameEnabled || config.photoFrameMode"
        label="Photo-frame timeout"
        description="Seconds before the photo frame advances."
      >
        <NumberStepper
          :model-value="config.photoFrameTimeout || 60"
          :min="5"
          :max="3600"
          :step="1"
          aria-label="Photo-frame timeout in seconds"
          @update:model-value="v => emit('update:config', { photoFrameTimeout: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-images" title="Image sources">
      <ImagesTab />
    </SettingsSection>

    <SettingsSection id="content-services" title="Services">
      <ServicesTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";
import ImagesTab from "@/components/settings/tabs/content/ImagesTab.vue";
import ServicesTab from "@/components/settings/tabs/content/ServicesTab.vue";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
</script>

<style scoped>
.content-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
