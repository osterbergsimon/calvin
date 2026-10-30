<template>
  <div class="photo-slideshow" :class="{ fullscreen: isFullscreen }">
    <IconButton
      v-if="isFullscreen"
      class="fs-close"
      size="lg"
      shape="circle"
      data-action="exit-fullscreen"
      label="Exit fullscreen"
      @click="handleAction('photos_exit_fullscreen')"
    >
      ✕
    </IconButton>
    <DashboardPanel
      title="Photos"
      variant="media"
      :show-title="false"
      :header-visible="!isFullscreen"
      :focused="focused"
      :dim="dim"
    >
      <template #actions>
        <div v-if="imagesStore.error" class="error-message">
          {{ imagesStore.error }}
        </div>
        <template v-if="focused && hasPointer">
          <IconButton
            size="custom"
            data-action="prev"
            label="Previous photo"
            title="Previous"
            @click="handleAction('images_prev')"
          >
            ‹
          </IconButton>
          <IconButton
            size="custom"
            data-action="next"
            label="Next photo"
            title="Next"
            @click="handleAction('images_next')"
          >
            ›
          </IconButton>
          <IconButton
            size="custom"
            variant="primary"
            data-action="expand"
            label="Fullscreen photos"
            title="Fullscreen"
            @click="handleAction('photos_enter_fullscreen')"
          >
            ⤢
          </IconButton>
        </template>
      </template>

      <div class="slideshow-content">
        <div v-if="imagesStore.loading" class="loading">
          <p>Loading images...</p>
        </div>
        <div v-else-if="!currentImageUrl" class="photo-placeholder">
          <EmptyState
            message="No photos yet"
            help="Upload photos in Settings › Content › Image sources."
            action-label="Add photos"
            setting-id="content-images"
            :setup="setupEmpty"
            :region-key="regionId || ''"
            :phone-hint="setupEmpty ? null : false"
          />
        </div>
        <div v-else ref="containerEl" class="photo-container">
          <!-- Blurred copy of the same photo, so a whole photo never sits on
               black bars. aria-hidden: it is decoration. -->
          <img
            v-if="fitDecision.backdrop && currentImageUrl"
            :src="currentImageUrl"
            class="photo-backdrop"
            alt=""
            aria-hidden="true"
            decoding="async"
            loading="eager"
          />
          <img
            :src="currentImageUrl"
            :alt="currentImage?.filename || 'Photo'"
            :class="['photo-image', `photo-image-${displayMode}`]"
            :style="imageStyle"
            decoding="async"
            loading="eager"
            @load="onImageLoad"
            @error="onImageError"
          />
        </div>
      </div>
    </DashboardPanel>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useImagesStore } from "../stores/images";
import DashboardPanel from "./DashboardPanel.vue";
import IconButton from "@/components/ui/IconButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { normalizePhotoFit, resolveImageAspect, resolvePhotoFit } from "@/utils/photoFit";

const { handleAction } = useKeyboardActions();
const { hasPointer } = useTouchCapability();

const props = defineProps({
  focused: {
    type: Boolean,
    default: false,
  },
  dim: {
    type: Boolean,
    default: false,
  },
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
  sourceIds: {
    type: Array,
    default: () => [],
  },
  // Dashboard leaf region id (CLV-20 setup prompt); null in fullscreen.
  regionId: {
    type: String,
    default: null,
  },
  // Per-region Fit photos setting (`view.fit`). Missing = Smart. Photo frame
  // and fullscreen always use Smart: their shape is not the region's shape.
  fit: {
    type: String,
    default: null,
  },
});

const imagesStore = useImagesStore();

// Only a real "nothing configured" is setup-empty (CLV-20); an offline error
// is its own state and must not trigger the setup prompt.
const setupEmpty = computed(() => !imagesStore.error);

const sourceKey = computed(() =>
  [
    ...new Set(
      props.sourceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
    ),
  ]
    .sort()
    .join(",")
);
const currentImage = computed(() => imagesStore.getCurrentImageForSource(props.sourceIds));
const sourceImages = computed(() => imagesStore.getImagesForSource(props.sourceIds));
const currentImageUrl = computed(() => imagesStore.getCurrentImageUrlForSource(props.sourceIds));

// Get display mode from the region. Photo frame / fullscreen always belongs to
// a different shape than any region, so it is deliberately Smart.
const displayMode = computed(() => {
  if (props.isFullscreen) return "smart";
  return normalizePhotoFit(props.fit);
});

// The photo area's measured shape. Smart compares each photo against this; a
// hardcoded side-panel guess is what cropped portraits in wide regions.
const containerEl = ref(null);
const containerAspect = ref(null);
const naturalSize = ref(null);
let containerObserver = null;

const measureContainer = () => {
  const el = containerEl.value;
  if (!el) return;
  let { clientWidth: width, clientHeight: height } = el;
  if ((!width || !height) && typeof el.getBoundingClientRect === "function") {
    const rect = el.getBoundingClientRect();
    width = width || rect.width;
    height = height || rect.height;
  }
  // Keep the last good shape: a hidden/zero-size element (or a test host with
  // no layout engine) must not erase a measurement the observer already gave.
  if (width > 0 && height > 0) containerAspect.value = width / height;
};

const observeContainer = () => {
  if (typeof ResizeObserver === "undefined" || !containerEl.value) return;
  containerObserver?.disconnect();
  containerObserver = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (box && box.width > 0 && box.height > 0) {
      containerAspect.value = box.width / box.height;
    }
  });
  containerObserver.observe(containerEl.value);
};

const imageAspect = computed(() => resolveImageAspect(currentImage.value, naturalSize.value));

const fitDecision = computed(() =>
  resolvePhotoFit({
    fit: displayMode.value,
    imageAspect: imageAspect.value,
    containerAspect: containerAspect.value,
  })
);

// Calculate smart display mode based on the measured region and the photo.
const imageStyle = computed(() => {
  const mode = fitDecision.value.mode;
  if (mode === "fill") {
    return { objectFit: "cover", objectPosition: "center", width: "100%", height: "100%" };
  }
  if (mode === "fit") {
    return { objectFit: "contain", objectPosition: "center", width: "100%", height: "100%" };
  }
  return { objectFit: "none", objectPosition: "center", width: "auto", height: "auto" };
});

let rotationTimer = null;

const onImageLoad = event => {
  // Stored dimensions can be missing (imported files); the browser's natural
  // size is then the only source of truth. Same request, no extra fetch.
  const target = event?.target;
  if (target?.naturalWidth > 0 && target?.naturalHeight > 0) {
    naturalSize.value = {
      naturalWidth: target.naturalWidth,
      naturalHeight: target.naturalHeight,
    };
  }
  measureContainer();
};

const onImageError = () => {
  console.error("Failed to load image:", currentImageUrl.value);
};

const startAutoRotation = () => {
  if (props.autoRotate && sourceImages.value.length > 1) {
    rotationTimer = setInterval(() => {
      imagesStore.nextImage(props.sourceIds);
    }, props.rotationInterval);
  }
};

const stopAutoRotation = () => {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
};

// Escape leaves fullscreen, like the calendar and web-page viewers.
const handleKeydown = event => {
  if (event.key === "Escape" && props.isFullscreen) {
    handleAction("photos_exit_fullscreen");
    event.preventDefault();
  }
};

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);

  // Fetch images and current image
  try {
    await imagesStore.fetchImages(props.sourceIds);
    if (sourceImages.value.length > 0 && !currentImage.value) {
      await imagesStore.fetchCurrentImage(props.sourceIds);
    }
  } catch (error) {
    console.error("Failed to load images:", error);
  }

  await nextTick();
  measureContainer();
  observeContainer();

  // Start auto-rotation if enabled
  if (props.autoRotate) {
    startAutoRotation();
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  containerObserver?.disconnect();
  containerObserver = null;
  stopAutoRotation();
});

// Entering/leaving fullscreen changes the photo area without necessarily
// firing a resize first; re-measure on the next frame either way.
watch(
  () => props.isFullscreen,
  async () => {
    await nextTick();
    measureContainer();
    observeContainer();
  }
);

// A new photo may carry its own shape; forget the previous photo's natural size.
watch(currentImageUrl, () => {
  naturalSize.value = null;
});

watch(
  () => props.autoRotate,
  newVal => {
    if (newVal) {
      startAutoRotation();
    } else {
      stopAutoRotation();
    }
  }
);

watch(sourceKey, async () => {
  stopAutoRotation();
  await imagesStore.fetchImages(props.sourceIds);
  if (props.autoRotate) startAutoRotation();
});
</script>

<style scoped>
.photo-slideshow {
  width: 100%;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  border-radius: 8px;
  overflow: visible; /* let the focused panel glow bloom out */
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  position: relative;
}

.fs-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 6;
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

.slideshow-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-message {
  color: var(--err);
  font-size: 0.9rem;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
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
  width: 100%;
  height: 100%;
}

.photo-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Blurred, dimmed copy of the current photo: fills the letterbox behind a
   whole photo so there are no black bars. Scaled slightly to hide edges. */
.photo-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(28px) brightness(0.55);
  transform: scale(1.1);
  pointer-events: none;
}

.photo-image {
  position: relative;
  z-index: 1;
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
