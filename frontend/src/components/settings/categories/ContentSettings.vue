<template>
  <div class="content-settings">
    <SettingsSection id="content-calendars" title="Calendars">
      <CalendarSourcesTab :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="content-photos" title="Photos">
      <SettingRow label="Rotation interval" description="Seconds each photo is shown before advancing.">
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
      <SettingRow label="Randomize image order" description="Shuffle the order photos are displayed in.">
        <ToggleSwitch
          :model-value="config.randomizeImages ?? false"
          aria-label="Randomize image order"
          @update:model-value="v => emit('update:config', { randomizeImages: v })"
        />
      </SettingRow>
      <SettingRow label="Photo-frame mode" description="Show a single photo full-screen as a digital frame.">
        <ToggleSwitch
          :model-value="config.photoFrameEnabled || config.photoFrameMode"
          aria-label="Photo-frame mode"
          @update:model-value="v => emit('update:config', { photoFrameEnabled: v, photoFrameMode: v })"
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
