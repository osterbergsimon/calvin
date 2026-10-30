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
        description="Shows the week number at the start of each week."
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
      <SettingRow label="Events per day" :description="EVENTS_PER_DAY_DESCRIPTION">
        <NumberStepper
          :model-value="config.maxVisibleEvents"
          :min="1"
          :max="20"
          aria-label="Events per day"
          @update:model-value="v => emit('update:config', { maxVisibleEvents: v })"
        />
      </SettingRow>
      <SettingRow label="Highlight holidays" description="Marks public holidays on the calendar.">
        <ToggleSwitch
          :model-value="config.showRedDays"
          aria-label="Highlight holidays"
          @update:model-value="v => emit('update:config', { showRedDays: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-photos" title="Photos">
      <SettingRow label="Show each photo for">
        <NumberStepper
          :model-value="config.photoRotationInterval || 30"
          :min="5"
          :max="3600"
          :step="5"
          unit=" s"
          aria-label="Show each photo for, in seconds"
          @update:model-value="v => emit('update:config', { photoRotationInterval: v })"
        />
      </SettingRow>
      <SettingRow label="Fit photos" description="How a photo fills its space.">
        <template v-if="isSmartFit" #description>
          <p class="setting-row__desc">How a photo fills its space.</p>
          <p class="content-hint">Smart picks Whole photo or Fill per photo.</p>
        </template>
        <SelectPill
          :model-value="config.imageDisplayMode || 'smart'"
          :options="[
            { value: 'smart', label: 'Smart' },
            { value: 'fit', label: 'Whole photo' },
            { value: 'fill', label: 'Fill' },
            { value: 'crop', label: 'Crop' },
            { value: 'center', label: 'Centre' },
          ]"
          aria-label="Fit photos"
          @update:model-value="v => emit('update:config', { imageDisplayMode: v })"
        />
      </SettingRow>
      <SettingRow label="Shuffle photos">
        <ToggleSwitch
          :model-value="config.randomizeImages ?? false"
          aria-label="Shuffle photos"
          @update:model-value="v => emit('update:config', { randomizeImages: v })"
        />
      </SettingRow>
      <SettingRow
        label="Photo frame when idle"
        description="After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back."
      >
        <ToggleSwitch
          :model-value="config.photoFrameEnabled || config.photoFrameMode"
          aria-label="Photo frame when idle"
          @update:model-value="
            v => emit('update:config', { photoFrameEnabled: v, photoFrameMode: v })
          "
        />
      </SettingRow>
      <SettingRow v-if="config.photoFrameEnabled || config.photoFrameMode" label="Start after">
        <SelectPill
          :model-value="photoFrameTimeout"
          :options="photoFrameTimeoutOptions"
          aria-label="Start the photo frame after"
          @update:model-value="v => emit('update:config', { photoFrameTimeout: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-images" title="Image sources">
      <PhotoUpload />
      <ImagesTab />
    </SettingsSection>

    <SettingsSection id="content-services" title="Web pages & services">
      <div class="content-services-actions">
        <AddWebPageButton />
      </div>
      <ServicesTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";
import ImagesTab from "@/components/settings/tabs/content/ImagesTab.vue";
import PhotoUpload from "@/components/settings/tabs/content/PhotoUpload.vue";
import ServicesTab from "@/components/settings/tabs/content/ServicesTab.vue";
import AddWebPageButton from "@/components/settings/specialized/AddWebPageButton.vue";

// Kept out of the template: the quoted "+N more" would fight the formatter's
// attribute quoting.
const EVENTS_PER_DAY_DESCRIPTION = 'How many events fit in one day before it shows "+N more".';

const props = defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);

const isSmartFit = computed(() => (props.config.imageDisplayMode || "smart") === "smart");

// Photo frame "Start after": the idle wait, in seconds. The store's default is
// 300 s, so a missing value means 5 min (the old `|| 60` fallback showed 1 min
// for a fresh install). Options are the minutes the control offers.
const PHOTO_FRAME_MINUTES = [1, 2, 5, 10, 15, 30];
const photoFrameTimeout = computed(() => {
  const seconds = Number(props.config.photoFrameTimeout) || 300;
  return seconds;
});
const minutesLabel = seconds => {
  if (seconds % 60 !== 0) return `${seconds} s`;
  const minutes = seconds / 60;
  return `${minutes} min`;
};
const photoFrameTimeoutOptions = computed(() => {
  const options = PHOTO_FRAME_MINUTES.map(minutes => ({
    value: minutes * 60,
    label: `${minutes} min`,
  }));
  const current = photoFrameTimeout.value;
  if (!options.some(option => option.value === current)) {
    options.push({ value: current, label: minutesLabel(current) });
    options.sort((a, b) => a.value - b.value);
  }
  return options;
});
</script>

<style scoped>
.content-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.content-services-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0.875rem 1rem 0;
}
/* Slot content is in this component's scope, not SettingRow's. */
.setting-row__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.content-hint {
  margin: 0.15rem 0 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-3);
}
</style>
