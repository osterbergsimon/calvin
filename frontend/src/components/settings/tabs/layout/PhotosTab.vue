<template>
  <div class="photos-tab">
    <CollapsibleSection title="Photo Rotation" icon="🔄">
      <SettingItem
        label="Photo Rotation Interval (seconds)"
        help="How often to switch photos (5-3600 seconds)"
      >
        <input
          :value="config.photoRotationInterval"
          type="number"
          min="5"
          max="3600"
          @change="handlePhotoRotationIntervalChange"
        />
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Image Display" icon="🖼️">
      <SettingItem label="Image Display Mode" help="How images are displayed">
        <select
          :value="config.imageDisplayMode"
          @change="handleImageDisplayModeChange"
        >
          <option value="smart">Smart (Auto-detect best fit)</option>
          <option value="fit">Fit (Show entire image)</option>
          <option value="fill">Fill (Fill container, may crop)</option>
        </select>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Photo Frame Mode" icon="🖼️">
      <SettingItem
        label="Enable Photo Frame Mode"
        help="Display only photos, hiding calendar and other content"
      >
        <label>
          <input
            :checked="config.photoFrameMode"
            type="checkbox"
            @change="handlePhotoFrameModeChange"
          />
          Enable Photo Frame Mode
        </label>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const handlePhotoRotationIntervalChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { photoRotationInterval: value });
  }
};

const handleImageDisplayModeChange = (event) => {
  emit("update:config", { imageDisplayMode: event.target.value });
};

const handlePhotoFrameModeChange = (event) => {
  emit("update:config", { photoFrameMode: event.target.checked });
};
</script>

<style scoped>
.photos-tab {
  width: 100%;
}
</style>
