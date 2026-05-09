import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";

export const useImagesStore = defineStore("images", () => {
  const images = ref([]);
  const imagesBySourceKey = ref({});
  const currentImage = ref(null);
  const currentImagesBySourceKey = ref({});
  const loading = ref(false);
  const error = ref(null);

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
    return config ? axios.get(url, config) : axios.get(url);
  };

  const postWithSources = (url, sourceIds) => {
    const config = sourceParams(sourceIds);
    return config ? axios.post(url, null, config) : axios.post(url);
  };

  const fetchImages = async (sourceIds = []) => {
    loading.value = true;
    error.value = null;
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await getWithSources("/api/images/list", sourceIds);
      imagesBySourceKey.value[sourceKey] = response.data.images || [];
      if (sourceKey === "__all__") images.value = response.data.images || [];
      // If we have images but no current image, fetch current
      const existingCurrent =
        sourceKey === "__all__" ? currentImage.value : currentImagesBySourceKey.value[sourceKey];
      if (imagesBySourceKey.value[sourceKey].length > 0 && !existingCurrent) {
        await fetchCurrentImage(sourceIds);
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to fetch images:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchCurrentImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await getWithSources("/api/images/current", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to fetch current image:", err);
      throw err;
    }
  };

  const nextImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await postWithSources("/api/images/next", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to go to next image:", err);
      throw err;
    }
  };

  const previousImage = async (sourceIds = []) => {
    const sourceKey = getSourceKey(sourceIds);
    try {
      const response = await postWithSources("/api/images/previous", sourceIds);
      currentImagesBySourceKey.value[sourceKey] = response.data.image;
      if (sourceKey === "__all__") currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to go to previous image:", err);
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
    // For remote images (like Picsum, Unsplash), use the URL directly
    // This avoids unnecessary backend redirects and improves performance
    const imageUrl = image.url || image.raw_url;
    if (imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
      return imageUrl;
    }

    // For local images, use the API endpoint
    return `/api/images/${image.id}`;
  };

  const uploadImage = async file => {
    loading.value = true;
    error.value = null;
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Don't set Content-Type header - let axios set it automatically with boundary
      const response = await axios.post("/api/images/upload", formData);
      // Refresh images list
      await fetchImages();
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to upload image:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteImage = async imageId => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.delete(`/api/images/${imageId}`);
      // Refresh images list
      await fetchImages();
      // If we deleted the current image, fetch a new one
      if (currentImage.value && currentImage.value.id === imageId) {
        await fetchCurrentImage();
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to delete image:", err);
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
