<template>
  <div class="content-settings">
    <SettingsSection id="content-calendars" title="Calendars">
      <CalendarSourcesTab
        :config="config"
        :highlight-id="highlightId"
        :highlight-provider="highlightProvider"
        @update:config="patch => emit('update:config', patch)"
      />
    </SettingsSection>

    <SettingsSection id="content-calendar-display" title="Calendar basics">
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
      <SettingRow label="Highlight holidays" description="Marks public holidays on the calendar.">
        <ToggleSwitch
          :model-value="config.showRedDays"
          aria-label="Highlight holidays"
          @update:model-value="v => emit('update:config', { showRedDays: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-photos" title="Photos">
      <ImagesTab
        :config="config"
        :highlight-id="highlightId"
        :highlight-provider="highlightProvider"
      />
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
      <SettingRow label="Shuffle photos">
        <ToggleSwitch
          :model-value="config.randomizeImages ?? false"
          aria-label="Shuffle photos"
          @update:model-value="v => emit('update:config', { randomizeImages: v })"
        />
      </SettingRow>
      <SettingRow
        label="Photo frame when idle"
        description="Per screen now: choose Off/On, the idle wait and the photo sources in Dashboard › Focus & remote."
      >
        <Button data-test="open-photo-frame-settings" @click="openPhotoFrameSettings">
          Open Focus &amp; remote
        </Button>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-services" title="Web pages & apps">
      <ServicesTab
        :config="config"
        :highlight-id="highlightId"
        :highlight-provider="highlightProvider"
      />
    </SettingsSection>

    <SettingsSection id="content-clock-bar" title="Clock bar info">
      <ClockBarSources :highlight-id="highlightId" :highlight-provider="highlightProvider" />
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Button from "@/components/ui/Button.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";
import ImagesTab from "@/components/settings/tabs/content/ImagesTab.vue";
import ServicesTab from "@/components/settings/tabs/content/ServicesTab.vue";
import ClockBarSources from "@/components/settings/tabs/content/ClockBarSources.vue";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
const route = useRoute();

// Plugins' "Used by n sources" links carry the provider id, so its rows pulse
// once on arrival (§3.3).
const highlightProvider = computed(() =>
  typeof route?.query?.highlight === "string" ? route.query.highlight : ""
);
const highlightId = computed(() =>
  typeof route?.query?.source === "string" ? route.query.source : ""
);

// The photo frame is per screen now (calvin-3xz9). Keep the row as a pointer to
// its new home instead of editing the global value here.
const router = useRouter();
const openPhotoFrameSettings = () => {
  router.push({ path: "/settings", query: { setting: "dashboard-kiosk-focus" } });
};
</script>
