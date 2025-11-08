<template>
  <div class="photo-slideshow" :class="{ 'fullscreen': isFullscreen }">
    <div v-if="!isFullscreen && showHeader" class="slideshow-header">
      <h2>Photos</h2>
      <div v-if="imagesStore.error" class="error-message">
        {{ imagesStore.error }}
      </div>
    </div>
    <div class="slideshow-content">
      <div v-if="imagesStore.loading" class="loading">
        <p>Loading images...</p>
      </div>
      <div v-else-if="!currentImageUrl" class="photo-placeholder">
        <p>No images available</p>
        <p class="photo-info">Add images to <code>data/images</code> directory</p>
      </div>
      <div v-else class="photo-container">
        <img
          :src="currentImageUrl"
          :alt="imagesStore.currentImage?.filename || 'Photo'"
          class="photo-image"
          @load="onImageLoad"
          @error="onImageError"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useImagesStore } from '../stores/images'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const showHeader = computed(() => configStore.showUI)

const props = defineProps({
  isFullscreen: {
    type: Boolean,
    default: false,
  },
  autoRotate: {
    type: Boolean,
    default: false,
  },
  rotationInterval: {
    type: Number,
    default: 30000, // 30 seconds
  },
})

const imagesStore = useImagesStore()

const currentImageUrl = computed(() => imagesStore.getCurrentImageUrl)

let rotationTimer = null

const onImageLoad = () => {
  // Image loaded successfully
}

const onImageError = () => {
  console.error('Failed to load image:', currentImageUrl.value)
}

const startAutoRotation = () => {
  if (props.autoRotate && imagesStore.images.length > 1) {
    rotationTimer = setInterval(() => {
      imagesStore.nextImage()
    }, props.rotationInterval)
  }
}

const stopAutoRotation = () => {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

onMounted(async () => {
  // Fetch images and current image
  try {
    await imagesStore.fetchImages()
    if (imagesStore.images.length > 0 && !imagesStore.currentImage) {
      await imagesStore.fetchCurrentImage()
    }
  } catch (error) {
    console.error('Failed to load images:', error)
  }

  // Start auto-rotation if enabled
  if (props.autoRotate) {
    startAutoRotation()
  }
})

onUnmounted(() => {
  stopAutoRotation()
})

watch(() => props.autoRotate, (newVal) => {
  if (newVal) {
    startAutoRotation()
  } else {
    stopAutoRotation()
  }
})
</script>

<style scoped>
.photo-slideshow {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.photo-slideshow.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  border-radius: 0;
}

.slideshow-header {
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slideshow-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #fff; /* Keep white for contrast on dark photo background */
}

.error-message {
  color: var(--accent-error);
  font-size: 0.9rem;
}

.slideshow-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.loading {
  text-align: center;
  color: #fff; /* Keep white for contrast on dark photo background */
}

.photo-placeholder {
  text-align: center;
  color: var(--text-secondary);
}

.photo-placeholder p {
  margin: 0.5rem 0;
}

.photo-placeholder code {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

.photo-info {
  font-size: 0.9rem;
  font-style: italic;
}

.photo-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: opacity 0.3s ease-in-out;
}
</style>
