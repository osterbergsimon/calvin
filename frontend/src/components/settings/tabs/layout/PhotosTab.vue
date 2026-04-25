<template>
  <div class="photos-tab">
    <CollapsibleSection title="Photos Settings" icon="📷" :expanded="true">
      <SettingItem
        label="Photo Rotation Interval (seconds)"
        help="How often to switch photos (5-3600 seconds)"
        input-id="photo-rotation-interval"
      >
        <input
          id="photo-rotation-interval"
          :value="config.photoRotationInterval"
          type="number"
          min="5"
          max="3600"
          step="1"
          placeholder="30"
          aria-label="Photo rotation interval in seconds"
          @change="handlePhotoRotationIntervalChange"
        />
      </SettingItem>

      <SettingItem label="Image Display Mode" help="How images are displayed">
        <select :value="config.imageDisplayMode" @change="handleImageDisplayModeChange">
          <option value="smart">Smart (Auto-detect best fit)</option>
          <option value="fit">Fit (Show entire image)</option>
          <option value="fill">Fill (Fill container, may crop)</option>
          <option value="crop">Crop (Fill and crop to fit)</option>
          <option value="center">Center (Natural size, centered)</option>
        </select>
      </SettingItem>

      <SettingItem label="Randomize Image Order" help="Shuffle image order when displaying">
        <label>
          <input
            :checked="config.randomizeImages ?? false"
            type="checkbox"
            @change="handleRandomizeImagesChange"
          />
          Randomize Image Order
        </label>
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
          input-id="photo-frame-timeout"
        >
          <input
            id="photo-frame-timeout"
            :value="config.photoFrameTimeout"
            type="number"
            min="5"
            max="3600"
            step="1"
            placeholder="300"
            aria-label="Photo frame timeout in seconds"
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

const handlePhotoRotationIntervalChange = event => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { photoRotationInterval: value });
  }
};

const handleImageDisplayModeChange = event => {
  emit("update:config", { imageDisplayMode: event.target.value });
};

const handlePhotoFrameModeChange = event => {
  // Map photoFrameMode to photoFrameEnabled for backend compatibility
  emit("update:config", {
    photoFrameEnabled: event.target.checked,
    photoFrameMode: event.target.checked, // Keep for UI compatibility
  });
};

const handlePhotoFrameTimeoutChange = event => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value) && value >= 5 && value <= 3600) {
    emit("update:config", { photoFrameTimeout: value });
  }
};

const handleRandomizeImagesChange = event => {
  emit("update:config", { randomizeImages: event.target.checked });
};
</script>

<style scoped>
.photos-tab {
  width: 100%;
}
</style>
