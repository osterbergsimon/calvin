import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";

export const useImagesStore = defineStore("images", () => {
  const images = ref([]);
  const currentImage = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const fetchImages = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/images/list");
      images.value = response.data.images || [];
      // If we have images but no current image, fetch current
      if (images.value.length > 0 && !currentImage.value) {
        await fetchCurrentImage();
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

  const fetchCurrentImage = async () => {
    try {
      const response = await axios.get("/api/images/current");
      currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to fetch current image:", err);
      throw err;
    }
  };

  const nextImage = async () => {
    try {
      const response = await axios.post("/api/images/next");
      currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to go to next image:", err);
      throw err;
    }
  };

  const previousImage = async () => {
    try {
      const response = await axios.post("/api/images/previous");
      currentImage.value = response.data.image;
      return response.data;
    } catch (err) {
      console.error("Failed to go to previous image:", err);
      throw err;
    }
  };

  const getCurrentImageUrl = computed(() => {
    if (!currentImage.value) return null;
    return `/api/images/${currentImage.value.id}`;
  });

  const uploadImage = async (file) => {
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

  const deleteImage = async (imageId) => {
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
    currentImage,
    loading,
    error,
    fetchImages,
    fetchCurrentImage,
    nextImage,
    previousImage,
    getCurrentImageUrl,
    uploadImage,
    deleteImage,
  };
});
