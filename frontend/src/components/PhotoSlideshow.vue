<template>
  <div class="photo-slideshow" :class="{ fullscreen: isFullscreen }">
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
        <p class="photo-info">
          Add images to <code>data/images</code> directory
        </p>
      </div>
      <div v-else class="photo-container">
        <img
          :src="currentImageUrl"
          :alt="imagesStore.currentImage?.filename || 'Photo'"
          :class="['photo-image', `photo-image-${displayMode}`]"
          :style="imageStyle"
          @load="onImageLoad"
          @error="onImageError"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useImagesStore } from "../stores/images";
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();
const showHeader = computed(() => configStore.shouldShowUI);

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
});

const imagesStore = useImagesStore();

const currentImageUrl = computed(() => imagesStore.getCurrentImageUrl);

// Get display mode from config
const displayMode = computed(() => {
  return configStore.imageDisplayMode || "smart";
});

// Calculate smart display mode based on image and container dimensions
const imageStyle = computed(() => {
  const mode = displayMode.value;
  const image = imagesStore.currentImage;
  
  if (!image || mode !== "smart") {
    return {};
  }

  // For smart mode, we need to determine the best fit based on:
  // - Image aspect ratio (width/height)
  // - Container aspect ratio (from orientation and layout)
  // - Screen orientation
  
  const imageAspect = image.width / image.height;
  const isLandscape = configStore.orientation === "landscape";
  
  // Estimate container aspect ratio based on layout
  // In landscape: side view is typically narrower (30% width)
  // In portrait: side view is typically shorter (30% height)
  let containerAspect;
  if (isLandscape) {
    // Side view in landscape: ~30% width, full height
    // Assuming 16:9 screen, side view would be ~5.3:9 = ~0.59:1
    containerAspect = 0.59;
  } else {
    // Side view in portrait: full width, ~30% height
    // Assuming 9:16 screen, side view would be ~9:5.3 = ~1.7:1
    containerAspect = 1.7;
  }
  
  // Smart mode logic:
  // - If image is wider than container (imageAspect > containerAspect): use fill/crop
  // - If image is taller than container (imageAspect < containerAspect): use fit
  // - If similar aspect ratios: use fill
  const aspectDiff = Math.abs(imageAspect - containerAspect) / containerAspect;
  
  if (aspectDiff < 0.1) {
    // Very similar aspect ratios: use fill
    return { objectFit: "cover", objectPosition: "center" };
  } else if (imageAspect > containerAspect) {
    // Image is wider: use fill with center crop
    return { objectFit: "cover", objectPosition: "center" };
  } else {
    // Image is taller: use fit to show entire image
    return { objectFit: "contain", objectPosition: "center" };
  }
});

let rotationTimer = null;

const onImageLoad = () => {
  // Image loaded successfully
};

const onImageError = () => {
  console.error("Failed to load image:", currentImageUrl.value);
};

const startAutoRotation = () => {
  if (props.autoRotate && imagesStore.images.length > 1) {
    rotationTimer = setInterval(() => {
      imagesStore.nextImage();
    }, props.rotationInterval);
  }
};

const stopAutoRotation = () => {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
};

onMounted(async () => {
  // Fetch images and current image
  try {
    await imagesStore.fetchImages();
    if (imagesStore.images.length > 0 && !imagesStore.currentImage) {
      await imagesStore.fetchCurrentImage();
    }
  } catch (error) {
    console.error("Failed to load images:", error);
  }

  // Start auto-rotation if enabled
  if (props.autoRotate) {
    startAutoRotation();
  }
});

onUnmounted(() => {
  stopAutoRotation();
});

watch(
  () => props.autoRotate,
  (newVal) => {
    if (newVal) {
      startAutoRotation();
    } else {
      stopAutoRotation();
    }
  },
);
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
  transition: opacity 0.3s ease-in-out;
}

/* Display mode styles */
.photo-image-fit {
  object-fit: contain;
  object-position: center;
}

.photo-image-fill {
  object-fit: cover;
  object-position: center;
}

.photo-image-crop {
  object-fit: cover;
  object-position: center;
  width: 100%;
  height: 100%;
}

.photo-image-center {
  object-fit: none;
  object-position: center;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
}

.photo-image-smart {
  /* Smart mode uses computed style, but default to cover */
  object-fit: cover;
  object-position: center;
}
</style>
