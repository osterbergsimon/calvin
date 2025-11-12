import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

export const useWebServicesStore = defineStore("webServices", () => {
  const services = ref([]);
  const currentServiceIndex = ref(0);
  const loading = ref(false);
  const error = ref(null);

  const fetchServices = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/web-services");
      const allServices = response.data.services || [];
      console.log("[WebServicesStore] All services from API:", allServices.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })));
      services.value = allServices.filter((s) => s.enabled);
      console.log("[WebServicesStore] Enabled services:", services.value.map(s => ({ id: s.id, name: s.name })));
      // Sort by display_order
      services.value.sort((a, b) => a.display_order - b.display_order);
      // Reset current index if out of bounds
      if (currentServiceIndex.value >= services.value.length) {
        currentServiceIndex.value = 0;
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to fetch web services:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const addService = async (service) => {
    try {
      const response = await axios.post("/api/web-services", service);
      await fetchServices();
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to add web service:", err);
      throw err;
    }
  };

  const updateService = async (serviceId, updates) => {
    try {
      const response = await axios.put(
        `/api/web-services/${serviceId}`,
        updates,
      );
      await fetchServices();
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to update web service:", err);
      throw err;
    }
  };

  const removeService = async (serviceId) => {
    try {
      await axios.delete(`/api/web-services/${serviceId}`);
      await fetchServices();
    } catch (err) {
      error.value = err.message;
      console.error("Failed to remove web service:", err);
      throw err;
    }
  };

  const getCurrentService = () => {
    if (services.value.length === 0) return null;
    return services.value[currentServiceIndex.value] || null;
  };

  const nextService = () => {
    if (services.value.length === 0) return;
    currentServiceIndex.value =
      (currentServiceIndex.value + 1) % services.value.length;
  };

  const previousService = () => {
    if (services.value.length === 0) return;
    currentServiceIndex.value =
      currentServiceIndex.value === 0
        ? services.value.length - 1
        : currentServiceIndex.value - 1;
  };

  const setServiceIndex = (index) => {
    if (index >= 0 && index < services.value.length) {
      currentServiceIndex.value = index;
    }
  };

  return {
    services,
    currentServiceIndex,
    loading,
    error,
    fetchServices,
    addService,
    updateService,
    removeService,
    getCurrentService,
    nextService,
    previousService,
    setServiceIndex,
  };
});
