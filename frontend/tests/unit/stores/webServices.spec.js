/** Tests for webServices store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useWebServicesStore } from "@/stores/webServices";
import { useConnectionStore } from "@/stores/connection";
import axios from "axios";

// Mock axios
vi.mock("axios");

// Mock connection store
vi.mock("@/stores/connection", () => ({
  useConnectionStore: vi.fn(),
}));

// Mock cache utilities
vi.mock("@/utils/cache", () => ({
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

import { getCachedData } from "@/utils/cache";

describe("Web Services Store", () => {
  let mockConnectionStore;

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Mock connection store
    mockConnectionStore = {
      isFullyOnline: vi.fn(() => true),
    };
    useConnectionStore.mockReturnValue(mockConnectionStore);
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useWebServicesStore();

      expect(store.services).toEqual([]);
      expect(store.currentServiceIndex).toBe(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe("fetchServices", () => {
    it("should fetch services from API", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "iframe",
            name: "Iframe Service",
            type: "service",
            enabled: true,
          },
        ],
      };

      const mockPluginDetails = {
        id: "iframe",
        name: "Iframe Service",
        display_schema: { type: "iframe" },
      };

      const mockInstances = {
        instances: [
          {
            id: "instance1",
            name: "Service 1",
            enabled: true,
            display_order: 1,
            config: { url: "https://example.com" },
          },
        ],
      };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(axios.get).toHaveBeenCalledWith("/api/plugins", {
        params: { plugin_type: "service" },
      });
      expect(axios.get).toHaveBeenCalledWith("/api/plugins/iframe");
      expect(axios.get).toHaveBeenCalledWith("/api/plugins/iframe/instances");
      expect(store.services.length).toBeGreaterThan(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });

    it("should filter to enabled services only", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "iframe",
            name: "Iframe Service",
            type: "service",
            enabled: true,
          },
        ],
      };

      const mockPluginDetails = {
        id: "iframe",
        name: "Iframe Service",
      };

      const mockInstances = {
        instances: [
          {
            id: "instance1",
            name: "Service 1",
            enabled: true,
            display_order: 1,
            config: { url: "https://example.com" },
          },
          {
            id: "instance2",
            name: "Service 2",
            enabled: false,
            display_order: 2,
            config: { url: "https://example2.com" },
          },
        ],
      };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(store.services.length).toBe(1);
      expect(store.services[0].id).toBe("instance1");
    });

    it("should sort services by display_order", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "iframe",
            name: "Iframe Service",
            type: "service",
            enabled: true,
          },
        ],
      };

      const mockPluginDetails = {
        id: "iframe",
        name: "Iframe Service",
      };

      const mockInstances = {
        instances: [
          {
            id: "instance1",
            name: "Service 1",
            enabled: true,
            display_order: 2,
            config: { url: "https://example.com" },
          },
          {
            id: "instance2",
            name: "Service 2",
            enabled: true,
            display_order: 1,
            config: { url: "https://example2.com" },
          },
        ],
      };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(store.services[0].id).toBe("instance2");
      expect(store.services[1].id).toBe("instance1");
    });

    it("should use cached services when offline", async () => {
      const mockCachedServices = {
        services: [
          {
            id: "instance1",
            name: "Cached Service",
            enabled: true,
            display_order: 1,
          },
        ],
      };

      mockConnectionStore.isFullyOnline.mockReturnValue(false);
      getCachedData.mockReturnValue(mockCachedServices);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(axios.get).not.toHaveBeenCalled();
      expect(store.services).toEqual(mockCachedServices.services);
      expect(store.loading).toBe(false);
    });

    it("should reset current index if out of bounds", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "iframe",
            name: "Iframe Service",
            type: "service",
            enabled: true,
          },
        ],
      };

      const mockPluginDetails = {
        id: "iframe",
        name: "Iframe Service",
      };

      const mockInstances = {
        instances: [
          {
            id: "instance1",
            name: "Service 1",
            enabled: true,
            display_order: 1,
            config: { url: "https://example.com" },
          },
        ],
      };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      store.currentServiceIndex = 5; // Out of bounds
      await store.fetchServices();

      expect(store.currentServiceIndex).toBe(0);
    });

    it("should handle API errors when no cache available", async () => {
      const error = new Error("Network error");
      axios.get.mockRejectedValue(error);
      mockConnectionStore.isFullyOnline.mockReturnValue(true);
      getCachedData.mockReturnValue(null);

      const store = useWebServicesStore();

      await expect(store.fetchServices()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });
  });

  describe("addService", () => {
    it("should add a new service", async () => {
      const mockServicePlugins = {
        plugins: [
          {
            id: "iframe",
            name: "Iframe Service",
            type: "service",
          },
        ],
      };

      const mockNewService = {
        id: "new-instance",
        name: "New Service",
        enabled: true,
        display_order: 1,
        config: { url: "https://newsite.com" },
      };

      const mockPlugins = {
        plugins: [{ id: "iframe", type: "service", enabled: true }],
      };

      const mockPluginDetails = { id: "iframe", name: "Iframe Service" };
      const mockInstances = { instances: [mockNewService] };

      axios.get
        .mockResolvedValueOnce({ data: mockServicePlugins })
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      axios.post.mockResolvedValue({ data: mockNewService });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.addService({
        name: "New Service",
        url: "https://newsite.com",
        enabled: true,
        display_order: 1,
      });

      expect(axios.post).toHaveBeenCalledWith("/api/plugins/iframe/instances", {
        name: "New Service",
        config: {
          url: "https://newsite.com",
          fullscreen: false,
          display_order: 1,
        },
        enabled: true,
      });
      expect(axios.get).toHaveBeenCalledWith("/api/plugins", {
        params: { plugin_type: "service" },
      });
    });

    it("should handle errors when adding service", async () => {
      const _error = new Error("Add failed");
      axios.get.mockResolvedValue({ data: { plugins: [] } });

      const store = useWebServicesStore();

      // When no plugins available, it throws "No service plugin available"
      await expect(store.addService({})).rejects.toThrow("No service plugin available");
      expect(store.error).toBe("No service plugin available");
    });

    it("should handle API errors when adding service", async () => {
      const error = new Error("Add failed");
      axios.get.mockResolvedValue({
        data: {
          plugins: [{ id: "iframe", type: "service", enabled: true }],
        },
      });
      axios.post.mockRejectedValue(error);

      const store = useWebServicesStore();

      await expect(store.addService({ name: "Test", url: "https://test.com" })).rejects.toThrow(
        "Add failed"
      );
      expect(store.error).toBe("Add failed");
    });
  });

  describe("updateService", () => {
    it("should update a service", async () => {
      const mockPlugins = {
        plugins: [{ id: "iframe", type: "service", enabled: true }],
      };

      const mockPluginDetails = { id: "iframe", name: "Iframe Service" };
      const mockInstances = {
        instances: [
          {
            id: "instance1",
            name: "Updated Service",
            enabled: true,
            display_order: 1,
          },
        ],
      };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      axios.put.mockResolvedValue({
        data: {
          id: "instance1",
          name: "Updated Service",
        },
      });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.updateService("instance1", {
        name: "Updated Service",
        url: "https://updated.com",
      });

      expect(axios.put).toHaveBeenCalledWith("/api/plugins/instances/instance1", {
        name: "Updated Service",
        config: {
          url: "https://updated.com",
          fullscreen: false,
          display_order: 0,
        },
        enabled: true,
      });
    });

    it("should handle errors when updating service", async () => {
      const error = new Error("Update failed");
      axios.put.mockRejectedValue(error);

      const store = useWebServicesStore();

      await expect(store.updateService("instance1", {})).rejects.toThrow("Update failed");
      expect(store.error).toBe("Update failed");
    });
  });

  describe("removeService", () => {
    it("should remove a service", async () => {
      const mockPlugins = {
        plugins: [{ id: "iframe", type: "service", enabled: true }],
      };

      const mockPluginDetails = { id: "iframe", name: "Iframe Service" };
      const mockInstances = { instances: [] };

      axios.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      axios.delete.mockResolvedValue({ data: { success: true } });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.removeService("instance1");

      expect(axios.delete).toHaveBeenCalledWith("/api/plugins/instances/instance1");
      expect(axios.get).toHaveBeenCalledWith("/api/plugins", {
        params: { plugin_type: "service" },
      });
    });

    it("should handle errors when removing service", async () => {
      const error = new Error("Remove failed");
      axios.delete.mockRejectedValue(error);

      const store = useWebServicesStore();

      await expect(store.removeService("instance1")).rejects.toThrow("Remove failed");
      expect(store.error).toBe("Remove failed");
    });
  });

  describe("getCurrentService", () => {
    it("should return current service", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
      ];
      store.currentServiceIndex = 0;

      const currentService = store.getCurrentService();

      expect(currentService).toEqual({ id: "service1", name: "Service 1" });
    });

    it("should return null when no services", () => {
      const store = useWebServicesStore();
      store.services = [];

      const currentService = store.getCurrentService();

      expect(currentService).toBe(null);
    });
  });

  describe("nextService", () => {
    it("should navigate to next service", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
        { id: "service3", name: "Service 3" },
      ];
      store.currentServiceIndex = 0;

      store.nextService();

      expect(store.currentServiceIndex).toBe(1);
    });

    it("should wrap to first service when at end", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
      ];
      store.currentServiceIndex = 1;

      store.nextService();

      expect(store.currentServiceIndex).toBe(0);
    });

    it("should not change index when no services", () => {
      const store = useWebServicesStore();
      store.services = [];
      store.currentServiceIndex = 0;

      store.nextService();

      expect(store.currentServiceIndex).toBe(0);
    });
  });

  describe("previousService", () => {
    it("should navigate to previous service", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
      ];
      store.currentServiceIndex = 1;

      store.previousService();

      expect(store.currentServiceIndex).toBe(0);
    });

    it("should wrap to last service when at beginning", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
      ];
      store.currentServiceIndex = 0;

      store.previousService();

      expect(store.currentServiceIndex).toBe(1);
    });

    it("should not change index when no services", () => {
      const store = useWebServicesStore();
      store.services = [];
      store.currentServiceIndex = 0;

      store.previousService();

      expect(store.currentServiceIndex).toBe(0);
    });
  });

  describe("setServiceIndex", () => {
    it("should set service index within bounds", () => {
      const store = useWebServicesStore();
      store.services = [
        { id: "service1", name: "Service 1" },
        { id: "service2", name: "Service 2" },
      ];

      store.setServiceIndex(1);

      expect(store.currentServiceIndex).toBe(1);
    });

    it("should not set index when out of bounds", () => {
      const store = useWebServicesStore();
      store.services = [{ id: "service1", name: "Service 1" }];
      store.currentServiceIndex = 0;

      store.setServiceIndex(5);

      expect(store.currentServiceIndex).toBe(0);
    });

    it("should not set negative index", () => {
      const store = useWebServicesStore();
      store.services = [{ id: "service1", name: "Service 1" }];
      store.currentServiceIndex = 0;

      store.setServiceIndex(-1);

      expect(store.currentServiceIndex).toBe(0);
    });
  });
});
