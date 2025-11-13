import axios from "axios";
import { useConnectionStore } from "../stores/connection";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    // const token = localStorage.getItem('token')
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Mark backend as online on successful response
    const connectionStore = useConnectionStore();
    if (!connectionStore.isBackendOnline) {
      connectionStore.isBackendOnline = true;
    }
    return response;
  },
  async (error) => {
    const connectionStore = useConnectionStore();
    
    // Check if it's a network error (offline or backend unreachable)
    if (!error.response) {
      // Network error - no response from server
      if (!navigator.onLine) {
        connectionStore.isOnline = false;
        connectionStore.isBackendOnline = false;
      } else {
        // Browser is online but backend is unreachable
        connectionStore.isBackendOnline = false;
        // Trigger a health check
        await connectionStore.checkBackend();
      }
    } else {
      // HTTP error response
      if (error.response?.status === 401) {
        // Handle unauthorized
        console.error("Unauthorized");
      } else if (error.response?.status >= 500) {
        // Handle server errors
        console.error("Server error:", error.response.data);
        // Server error might indicate backend issues
        connectionStore.isBackendOnline = false;
      }
    }
    
    return Promise.reject(error);
  },
);

export default api;
