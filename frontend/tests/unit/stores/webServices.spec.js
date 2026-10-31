/** Tests for webServices store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useWebServicesStore } from "@/stores/webServices";
import { useConnectionStore } from "@/stores/connection";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Mock connection store
vi.mock("@/stores/connection", () => ({
  useConnectionStore: vi.fn(),
}));

// The real localStorage-backed cache, cleared before every test.
import { getCachedData, setCachedData } from "@/utils/cache";

describe("Web Services Store", () => {
  let mockConnectionStore;

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();

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

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(api.get).toHaveBeenCalledWith("/plugins", {
        params: { plugin_type: "service" },
      });
      expect(api.get).toHaveBeenCalledWith("/plugins/iframe");
      expect(api.get).toHaveBeenCalledWith("/plugins/iframe/instances");
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

      api.get
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

      api.get
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
      setCachedData("web_services", mockCachedServices);

      const store = useWebServicesStore();
      await store.fetchServices();

      expect(api.get).not.toHaveBeenCalled();
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

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      store.currentServiceIndex = 5; // Out of bounds
      await store.fetchServices();

      expect(store.currentServiceIndex).toBe(0);
    });

    describe("offline cache (audit R7)", () => {
      const plugins = {
        plugins: [
          { id: "iframe", name: "Iframe", type: "service", enabled: true },
          { id: "weather", name: "Weather", type: "service", enabled: true },
        ],
      };
      const instance = (id, name) => ({
        instances: [{ id, name, enabled: true, display_order: 0, config: {} }],
      });
      const cached = {
        services: [
          { id: "a", name: "Cached A", enabled: true, display_order: 0 },
          { id: "b", name: "Cached B", enabled: true, display_order: 1 },
        ],
      };

      it("does not overwrite a good cache with a partial result", async () => {
        setCachedData("web_services", cached);
        api.get.mockImplementation(async url => {
          if (url === "/plugins") return { data: plugins };
          if (url === "/plugins/iframe") return { data: { id: "iframe" } };
          if (url === "/plugins/iframe/instances") return { data: instance("a", "Live A") };
          throw new Error("weather plugin timed out");
        });

        const store = useWebServicesStore();
        await store.fetchServices();

        // The live (partial) list is shown, but the cache keeps the full one.
        expect(store.services.map(s => s.name)).toEqual(["Live A"]);
        expect(getCachedData("web_services")).toEqual(cached);
      });

      it("caches a complete result", async () => {
        api.get.mockImplementation(async url => {
          if (url === "/plugins") return { data: plugins };
          if (url.endsWith("/instances")) {
            return { data: instance(url.split("/")[2], url.split("/")[2]) };
          }
          return { data: {} };
        });

        const store = useWebServicesStore();
        await store.fetchServices();

        expect(getCachedData("web_services").services.map(s => s.id)).toEqual([
          "iframe",
          "weather",
        ]);
      });

      it("serves expired services flagged stale when the request fails", async () => {
        vi.useFakeTimers();
        setCachedData("web_services", cached);
        vi.setSystemTime(Date.now() + 60 * 60 * 1000); // past the 5 minute TTL
        api.get.mockRejectedValue(new Error("Network Error"));

        const store = useWebServicesStore();
        await store.fetchServices();
        vi.useRealTimers();

        expect(store.services.map(s => s.name)).toEqual(["Cached A", "Cached B"]);
        expect(store.stale).toBe(true);
      });
    });

    it("should handle API errors when no cache available", async () => {
      const error = new Error("Network error");
      api.get.mockRejectedValue(error);
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();

      await expect(store.fetchServices()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.errorText).toBe(
        "Couldn't reach Calvin. Check that it's running and on the same network."
      );
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

      api.get
        .mockResolvedValueOnce({ data: mockServicePlugins })
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      api.post.mockResolvedValue({ data: mockNewService });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.addService({
        name: "New Service",
        url: "https://newsite.com",
        enabled: true,
        display_order: 1,
      });

      expect(api.post).toHaveBeenCalledWith("/plugins/iframe/instances", {
        name: "New Service",
        config: {
          url: "https://newsite.com",
          fullscreen: false,
          display_order: 1,
        },
        enabled: true,
      });
      expect(api.get).toHaveBeenCalledWith("/plugins", {
        params: { plugin_type: "service" },
      });
    });

    it("should handle API errors when adding service", async () => {
      const error = new Error("Add failed");
      api.get.mockResolvedValue({
        data: {
          plugins: [{ id: "iframe", type: "service", enabled: true }],
        },
      });
      api.post.mockRejectedValue(error);

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

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      api.put.mockResolvedValue({
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

      expect(api.put).toHaveBeenCalledWith("/plugins/instances/instance1", {
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
      api.put.mockRejectedValue(error);

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

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockPluginDetails })
        .mockResolvedValueOnce({ data: mockInstances });

      api.delete.mockResolvedValue({ data: { success: true } });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useWebServicesStore();
      await store.removeService("instance1");

      expect(api.delete).toHaveBeenCalledWith("/plugins/instances/instance1");
      expect(api.get).toHaveBeenCalledWith("/plugins", {
        params: { plugin_type: "service" },
      });
    });

    it("should handle errors when removing service", async () => {
      const error = new Error("Remove failed");
      api.delete.mockRejectedValue(error);

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
