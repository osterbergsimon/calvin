import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api, { LONG_REQUEST_TIMEOUT } from "../services/api";
import { getCachedData, setCachedData } from "../utils/cache";
import { friendlyError } from "../utils/friendlyError";
import { logError } from "../utils/logger";

// Persist the wall-display feed so a kiosk refresh/reboot during a backend
// outage keeps showing the last-known photo instead of "No images available".
// Long TTL — a stale photo through a transient outage is the desired behavior.
const IMAGES_CACHE_KEY = "images_all";
const CURRENT_IMAGE_CACHE_KEY = "current_image_all";
const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const useImagesStore = defineStore("images", () => {
  const images = ref([]);
  const imagesBySourceKey = ref({});
  const currentImage = ref(null);
  const currentImagesBySourceKey = ref({});
  const loading = ref(false);
  const error = ref(null);
  // One friendly sentence for the screen; `error` keeps the raw text for logs.
  const errorText = ref("");

  const normalizeSourceIds = sourceIds =>
    Array.isArray(sourceIds)
      ? [
          ...new Set(
            sourceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
          ),
        ].sort()
      : [];

  const getSourceKey = sourceIds => {
    const ids = normalizeSourceIds(sourceIds);
    return ids.length ? ids.join(",") : "__all__";
  };

  const sourceParams = sourceIds => {
    const ids = normalizeSourceIds(sourceIds);
    return ids.length ? { params: { source_ids: ids.join(",") } } : undefined;
  };

  const getWithSources = (url, sourceIds) => {
    const config = sourceParams(sourceIds);
    return config ? api.get(url, config) : api.get(url);
  };

  const postWithSources = (url, sourceIds) => {
    const config = sourceParams(sourceIds);
    return config ? api.post(url, null, config) : api.post(url);
  };

  const clearError = () => {
    error.value = null;
    errorText.value = "";
  };

  const captureError = (err, action, message) => {
    error.value = err.message;
    errorText.value = friendlyError(err, action);
    logError("[Images]", message, err);
  };

  const fetchImages = async (sourceIds = []) => {
    loading.value = true;
    clearError();
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await getWithSources("/images/list", sourceIds);
      imagesBySourceKey.value[sourceKey] = response.data.images || [];
      if (sourceKey === "__all__") {
        images.value = response.data.images || [];
        setCachedData(IMAGES_CACHE_KEY, images.value);
      }
      // If we have images but no current image, fetch current
      const existingCurrent =
        sourceKey === "__all__" ? currentImage.value : currentImagesBySourceKey.value[sourceKey];
      if (imagesBySourceKey.value[sourceKey].length > 0 && !existingCurrent) {
        await fetchCurrentImage(sourceIds);
      }
      return response.data;
    } catch (err) {
      captureError(err, "load your photos", "Failed to fetch images:");
      // Serve the last-known feed so the wall display survives a backend outage.
      if (sourceKey === "__all__") {
        const cached = getCachedData(IMAGES_CACHE_KEY, IMAGE_CACHE_TTL, { allowStale: true });
        if (cached && cached.length) {
          images.value = cached;
          imagesBySourceKey.value[sourceKey] = cached;
          return { images: cached, cached: true };
        }
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchCurrentImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await getWithSources("/images/current", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") {
        currentImage.value = response.data.image;
        if (response.data.image) setCachedData(CURRENT_IMAGE_CACHE_KEY, response.data.image);
      }
      return response.data;
    } catch (err) {
      logError("[Images]", "Failed to fetch current image:", err);
      // Fall back to the last-known image so the frame isn't blank during an outage.
      if (sourceKey === "__all__") {
        const cached = getCachedData(CURRENT_IMAGE_CACHE_KEY, IMAGE_CACHE_TTL, {
          allowStale: true,
        });
        if (cached) {
          currentImagesBySourceKey.value[sourceKey] = cached;
          currentImage.value = cached;
          return { image: cached, cached: true };
        }
      }
      throw err;
    }
  };

  const nextImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await postWithSources("/images/next", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      logError("[Images]", "Failed to go to next image:", err);
      throw err;
    }
  };

  const previousImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await postWithSources("/images/previous", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      logError("[Images]", "Failed to go to previous image:", err);
      throw err;
    }
  };

  const getCurrentImageUrl = computed(() => {
    return getImageUrl(currentImage.value);
  });

  const getCurrentImageForSource = sourceIds => {
    const sourceKey = getSourceKey(sourceIds);
    return sourceKey === "__all__"
      ? currentImagesBySourceKey.value[sourceKey] || currentImage.value
      : currentImagesBySourceKey.value[sourceKey] || null;
  };

  const getImagesForSource = sourceIds => {
    const sourceKey = getSourceKey(sourceIds);
    return sourceKey === "__all__"
      ? imagesBySourceKey.value[sourceKey] || images.value
      : imagesBySourceKey.value[sourceKey] || [];
  };

  const getCurrentImageUrlForSource = sourceIds => getImageUrl(getCurrentImageForSource(sourceIds));

  const getImageUrl = image => {
    if (!image) return null;
    // Always serve images through the Calvin server proxy (/api/images/{id}).
    // Remote CDN URLs (picsum/unsplash/nasa-apod) are cached + served by the
    // backend so the kiosk browser never contacts an external origin directly.
    // See docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
    return `/api/images/${image.id}`;
  };

  const uploadImage = async file => {
    loading.value = true;
    clearError();
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Don't set Content-Type header - let axios set it automatically with boundary
      const response = await api.post("/images/upload", formData, {
        timeout: LONG_REQUEST_TIMEOUT,
      });
      // Refresh images list
      await fetchImages();
      return response.data;
    } catch (err) {
      captureError(err, "upload that photo", "Failed to upload image:");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteImage = async imageId => {
    loading.value = true;
    clearError();
    try {
      const response = await api.delete(`/images/${imageId}`);
      // Refresh images list
      await fetchImages();
      // If we deleted the current image, fetch a new one
      if (currentImage.value && currentImage.value.id === imageId) {
        await fetchCurrentImage();
      }
      return response.data;
    } catch (err) {
      captureError(err, "delete that photo", "Failed to delete image:");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    images,
    imagesBySourceKey,
    currentImage,
    currentImagesBySourceKey,
    loading,
    error,
    errorText,
    fetchImages,
    fetchCurrentImage,
    nextImage,
    previousImage,
    getCurrentImageUrl,
    getCurrentImageForSource,
    getImagesForSource,
    getCurrentImageUrlForSource,
    uploadImage,
    deleteImage,
  };
});
