<template>
  <div class="photo-slideshow" :class="{ fullscreen: isFullscreen }">
    <IconButton
      v-if="isFullscreen"
      class="fs-close"
      size="lg"
      shape="circle"
      data-action="exit-fullscreen"
      :icon="mdiClose"
      label="Exit fullscreen"
      @click="handleAction('photos_exit_fullscreen')"
    />
    <DashboardPanel
      title="Photos"
      variant="media"
      :show-title="false"
      :header-visible="!isFullscreen"
      :focused="focused"
      :dim="dim"
    >
      <template #actions>
        <RegionHeaderControls v-if="showControls && hasPointer">
          <IconButton
            size="custom"
            :icon="mdiChevronLeft"
            data-action="prev"
            label="Previous photo"
            title="Previous"
            @click="handleAction('images_prev')"
          />
          <IconButton
            size="custom"
            :icon="mdiChevronRight"
            data-action="next"
            label="Next photo"
            title="Next"
            @click="handleAction('images_next')"
          />
          <IconButton
            size="custom"
            :icon="mdiFullscreen"
            data-action="expand"
            label="Fullscreen photos"
            title="Fullscreen"
            @click="handleAction('photos_enter_fullscreen')"
          />
        </RegionHeaderControls>
      </template>

      <div class="slideshow-content">
        <div v-if="imagesStore.loading" class="loading">
          <p>Loading images...</p>
        </div>
        <div v-else-if="!currentImage" class="photo-placeholder">
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
          <!-- The container exists before the first request so the observer
               can measure it; no src is set until that measurement exists. -->
          <template v-if="currentImageUrl">
            <template v-if="fitDecision.backdrop">
              <!-- Full: the original blurred copy of the photo itself (source
                   image, filter and scale from before calvin-e70v). -->
              <img
                v-if="fullEffects"
                :src="currentImageUrl"
                class="photo-backdrop photo-backdrop--full"
                alt=""
                aria-hidden="true"
                decoding="async"
                loading="eager"
              />
              <!-- Standard: a tiny upscaled copy of the same photo, so a whole
                   photo never sits on black bars. aria-hidden: it is decoration. -->
              <div v-else class="photo-backdrop photo-backdrop--soft" aria-hidden="true">
                <img
                  :src="backdropImageUrl"
                  class="photo-backdrop__image"
                  alt=""
                  decoding="async"
                  loading="eager"
                />
              </div>
            </template>
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
          </template>
          <div v-else class="loading">
            <p>Loading images...</p>
          </div>
        </div>
      </div>
    </DashboardPanel>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { mdiChevronLeft, mdiChevronRight, mdiClose, mdiFullscreen } from "@mdi/js";
import { useImagesStore } from "../stores/images";
import { useProgressStore } from "../stores/progress";
import DashboardPanel from "./DashboardPanel.vue";
import RegionHeaderControls from "./dashboard/RegionHeaderControls.vue";
import IconButton from "@/components/ui/IconButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useTouchCapability } from "@/composables/useTouchCapability";
import {
  preloadAndDecodeImage,
  upgradeImageWidth,
  variantWidthForRegion,
  withImageWidth,
} from "@/utils/imageVariants";
import { normalizePhotoFit, resolveImageAspect, resolvePhotoFit } from "@/utils/photoFit";
import { useEffectsAttribute } from "@/composables/useEffectsAttribute";

const { handleAction } = useKeyboardActions();
const { hasPointer } = useTouchCapability();

const props = defineProps({
  focused: {
    type: Boolean,
    default: false,
  },
  // Region arrows/fullscreen follow hide/show controls, not the focus light.
  // null = fall back to `focused` (standalone use and older callers).
  controlsVisible: {
    type: Boolean,
    default: null,
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

const showControls = computed(() => props.controlsVisible ?? props.focused);

const imagesStore = useImagesStore();
const progressStore = useProgressStore();

// Full restores the original blurred-photo backdrop; Standard uses the small
// upscaled copy (the effects attribute is applied before mount in App.vue).
const effectsLevel = useEffectsAttribute();
const fullEffects = computed(() => effectsLevel.value === "full");

// Fetching the photo-source list lights this region's frame (the app frame in
// fullscreen). Rotation from cache and prefetching never do (CLV-115).
const trackPhotoFetch = work =>
  progressStore.track(`photos:${props.regionId || "fullscreen"}`, work, {
    regionId: props.regionId || null,
  });

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

// Display width requested from the backend. The viewport (at DPR) is a safe
// upper-bound fallback until the photo region is measured: a large kiosk never
// probes 640 first, and a photo that arrives before the container exists can
// still request a URL immediately. Measurement only upgrades the bucket.
const viewportWidth = () => {
  const dpr = typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
  const viewport = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 640;
  return variantWidthForRegion(viewport, dpr);
};
const requestedWidth = ref(viewportWidth());
const currentImageUrl = computed(() => {
  const url = imagesStore.getCurrentImageUrlForSource(props.sourceIds);
  if (!url || !requestedWidth.value) return null;
  return withImageWidth(url, requestedWidth.value);
});

// The backdrop is the smallest width bucket the backend serves (640), not the
// full-size display variant. Upscaling it is naturally soft, so the kiosk never
// runs a full-region CSS blur on every photo change.
const backdropImageUrl = computed(() =>
  withImageWidth(imagesStore.getCurrentImageUrlForSource(props.sourceIds), 640)
);

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

// Request a variant only when the region needs a bigger bucket. A smaller
// region keeps the already-loaded file, so resizing never re-downloads detail
// the kiosk just decoded.
const requestDisplayWidth = cssWidth => {
  const dpr = typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
  const candidate = variantWidthForRegion(cssWidth, dpr);
  requestedWidth.value = upgradeImageWidth(requestedWidth.value, candidate);
};

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
  if (width > 0) requestDisplayWidth(width);
};

const observeContainer = () => {
  if (typeof ResizeObserver === "undefined" || !containerEl.value) return;
  containerObserver?.disconnect();
  containerObserver = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (box && box.width > 0 && box.height > 0) {
      containerAspect.value = box.width / box.height;
      requestDisplayWidth(box.width);
    }
  });
  containerObserver.observe(containerEl.value);
};

// The container is re-created by the loading/photo branches, not only on
// fullscreen changes. Watch the element itself so a container that appears
// after the first render is measured and observed too.
watch(
  containerEl,
  el => {
    containerObserver?.disconnect();
    containerObserver = null;
    if (!el) return;
    measureContainer();
    observeContainer();
  },
  { flush: "post" }
);

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

// The photo the next advance will show, so it can be downloaded and decoded
// while the current photo is still on screen.
const nextImage = computed(() => {
  const list = sourceImages.value;
  if (!list.length) return null;
  const index = currentImage.value ? list.findIndex(img => img.id === currentImage.value.id) : -1;
  return list[(index + 1) % list.length] || null;
});

const preloadNextImage = () => {
  const image = nextImage.value;
  if (!image || !requestedWidth.value) return Promise.resolve(null);
  return preloadAndDecodeImage(imagesStore.getImageUrlForWidth(image, requestedWidth.value));
};

let rotationPending = false;

const advanceToNext = async generation => {
  // No stacked ticks: a slow decode must not queue up a burst of advances.
  if (rotationPending) return;
  rotationPending = true;
  try {
    // A failed decode (corrupt file, unsupported format) must not stop
    // rotation: preloadAndDecodeImage resolves null and the swap still happens.
    await preloadNextImage();
    // A stop, unmount or source change happened while we were decoding: the
    // new chain owns rotation now, so this tick must not advance.
    if (generation !== undefined && generation !== rotationGeneration) return;
    await imagesStore.nextImage(props.sourceIds);
  } finally {
    rotationPending = false;
  }
};

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

// Schedule the next tick only after the current one finished pre-decoding and
// swapping. A pending preload therefore never leaves a queue of ticks behind.
// Every stop/start/unmount bumps the generation, so a tick that was awaiting a
// decode when its chain was replaced cannot schedule another one.
let rotationGeneration = 0;

const scheduleNextRotation = generation => {
  if (!props.autoRotate || sourceImages.value.length <= 1) return;
  rotationTimer = setTimeout(() => runRotation(generation), props.rotationInterval);
};

const runRotation = async generation => {
  rotationTimer = null;
  if (generation !== rotationGeneration || !props.autoRotate) return;
  await advanceToNext(generation);
  if (generation !== rotationGeneration) return;
  scheduleNextRotation(generation);
};

const startAutoRotation = () => {
  stopAutoRotation();
  scheduleNextRotation(rotationGeneration);
};

const stopAutoRotation = () => {
  rotationGeneration += 1;
  if (rotationTimer) {
    clearTimeout(rotationTimer);
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
    await trackPhotoFetch(async () => {
      await imagesStore.fetchImages(props.sourceIds);
      if (sourceImages.value.length > 0 && !currentImage.value) {
        await imagesStore.fetchCurrentImage(props.sourceIds);
      }
    });
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

// Warm the next photo whenever the current one, the source list or the display
// width changes. The rotation timer also awaits this before advancing, so a
// user click and an automatic rotation both swap into a decoded image.
watch(
  [() => currentImage.value?.id, () => sourceImages.value.length, requestedWidth],
  () => {
    preloadNextImage();
  },
  { immediate: true }
);

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

// A new interval must not wait for the timer already running (an hour-long
// one would otherwise outlive the change): restart the chain with it.
watch(
  () => props.rotationInterval,
  () => {
    if (props.autoRotate) startAutoRotation();
  }
);

watch(sourceKey, async () => {
  stopAutoRotation();
  await trackPhotoFetch(() => imagesStore.fetchImages(props.sourceIds));
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
  background: var(--scrim-solid);
  border-radius: var(--radius-control);
  overflow: visible; /* let the focused panel glow bloom out */
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  position: relative;
}

.fs-close {
  position: absolute;
  top: var(--gap-4);
  right: var(--gap-4);
  z-index: var(--z-raised);
}

.photo-slideshow.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-dialog);
  border-radius: 0;
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
  color: var(--on-scrim); /* Keep white for contrast on dark photo background */
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

/* STANDARD: a tiny (640px) copy of the current photo, upscaled to cover the
   letterbox so there are no black bars. Scaling up is naturally soft; the dark
   overlay does the rest. Never let a CSS blur apply here: on the Pi kiosk it
   re-runs over the whole region on every photo change. */
.photo-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.photo-backdrop__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: auto;
}

.photo-backdrop--soft::after {
  content: "";
  position: absolute;
  inset: 0;
  /* ~45% black: --scrim-solid is the non-themed photo backdrop token. */
  background: color-mix(in srgb, var(--scrim-solid) 45%, transparent);
}

/* FULL: the original blurred, dimmed copy of the photo itself (calvin-e70v).
   Gated by the effects level so Standard can never pay for the filter. */
[data-effects="full"] .photo-backdrop--full {
  width: 100%;
  height: 100%;
  object-fit: cover;
  overflow: visible;
  filter: blur(28px) brightness(0.55);
  transform: scale(1.1);
}

.photo-image {
  position: relative;
  z-index: var(--z-raised);
  max-width: 100%;
  max-height: 100%;
  transition: opacity var(--dur) var(--ease);
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
