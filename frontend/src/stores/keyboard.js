import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { logError } from "@/utils/logger";

export const useKeyboardStore = defineStore("keyboard", () => {
  const mappings = ref({}); // { KEY_x: action }
  const available = ref(false);
  const loading = ref(false);
  const error = ref(null);

  const captureActive = ref(false);
  let captureResolver = null;

  const fetchMappings = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/keyboard/mappings");
      mappings.value = response.data.mappings || {};
      available.value = true;
      return response.data;
    } catch (err) {
      error.value = err.message;
      available.value = false;
      logError("[Keyboard]", "Failed to fetch mappings:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const setMapping = async (key, action) => {
    await axios.put(`/api/keyboard/mappings/${key}`, { action });
    mappings.value = { ...mappings.value, [key]: action };
  };

  const removeMapping = async key => {
    await axios.delete(`/api/keyboard/mappings/${key}`);
    const next = { ...mappings.value };
    delete next[key];
    mappings.value = next;
  };

  const updateMappings = async map => {
    await axios.post("/api/keyboard/mappings", { mappings: map });
    mappings.value = { ...map };
  };

  // --- press-to-capture primitives ---
  const beginCapture = () => {
    captureActive.value = true;
    return new Promise(resolve => {
      captureResolver = resolve;
    });
  };

  const handleCaptureKey = keyCode => {
    if (!captureActive.value) return;
    captureActive.value = false;
    const resolve = captureResolver;
    captureResolver = null;
    // Escape is reserved to cancel.
    resolve?.(keyCode === "KEY_ESCAPE" ? null : keyCode);
  };

  const cancelCapture = () => {
    if (!captureActive.value) return;
    captureActive.value = false;
    const resolve = captureResolver;
    captureResolver = null;
    resolve?.(null);
  };

  return {
    mappings,
    available,
    loading,
    error,
    captureActive,
    fetchMappings,
    setMapping,
    removeMapping,
    updateMappings,
    beginCapture,
    handleCaptureKey,
    cancelCapture,
  };
});
