<template>
  <div class="photos-tab">
    <CollapsibleSection title="Photos Settings" icon="📷" :expanded="true">
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

      <SettingItem
        label="Enable Photo Frame Mode"
        help="Automatically enter photo frame mode after period of inactivity"
      >
        <label>
          <input
            :checked="config.photoFrameEnabled || config.photoFrameMode"
            type="checkbox"
            @change="handlePhotoFrameModeChange"
          />
          Enable Photo Frame Mode
        </label>
      </SettingItem>

      <div v-if="config.photoFrameEnabled || config.photoFrameMode">
        <SettingItem
          label="Photo Frame Timeout (seconds)"
          help="Time of inactivity before entering photo frame mode (5-3600 seconds)"
        >
          <input
            :value="config.photoFrameTimeout"
            type="number"
            min="5"
            max="3600"
            @change="handlePhotoFrameTimeoutChange"
          />
        </SettingItem>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

defineProps({
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
  // Map photoFrameMode to photoFrameEnabled for backend compatibility
  emit("update:config", {
    photoFrameEnabled: event.target.checked,
    photoFrameMode: event.target.checked, // Keep for UI compatibility
  });
};

const handlePhotoFrameTimeoutChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value) && value >= 5 && value <= 3600) {
    emit("update:config", { photoFrameTimeout: value });
  }
};
</script>

<style scoped>
.photos-tab {
  width: 100%;
}
</style>
