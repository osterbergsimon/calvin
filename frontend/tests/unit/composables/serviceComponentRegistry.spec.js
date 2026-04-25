/**
 * Unit tests for serviceComponentRegistry
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  serviceComponentRegistry,
  registerServiceComponent,
  getServiceComponent,
} from "@/composables/serviceComponentRegistry";

// Mock logger
vi.mock("@/utils/logger", () => ({
  logDebug: vi.fn(),
}));

import { logDebug } from "@/utils/logger";

describe("serviceComponentRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("serviceComponentRegistry", () => {
    it("should have built-in components", () => {
      expect(serviceComponentRegistry).toHaveProperty("iframe");
      expect(serviceComponentRegistry).toHaveProperty("weather");
      expect(serviceComponentRegistry).toHaveProperty("generic_api");
    });

    it("should have valid component references", () => {
      expect(serviceComponentRegistry.iframe).toBeDefined();
      expect(serviceComponentRegistry.weather).toBeDefined();
      expect(serviceComponentRegistry.generic_api).toBeDefined();
    });
  });

  describe("registerServiceComponent", () => {
    it("should register a new component", () => {
      const mockComponent = { name: "TestComponent" };

      registerServiceComponent("test", mockComponent);

      expect(serviceComponentRegistry.test).toBe(mockComponent);
      expect(logDebug).toHaveBeenCalledWith(
        "[ServiceComponentRegistry]",
        "Registered component: test"
      );
    });

    it("should overwrite existing component", () => {
      const originalComponent = serviceComponentRegistry.iframe;
      const newComponent = { name: "NewComponent" };

      registerServiceComponent("iframe", newComponent);

      expect(serviceComponentRegistry.iframe).toBe(newComponent);
      expect(serviceComponentRegistry.iframe).not.toBe(originalComponent);

      // Restore for other tests
      registerServiceComponent("iframe", originalComponent);
    });
  });

  describe("getServiceComponent", () => {
    it("should return component when found", () => {
      const component = getServiceComponent("weather");

      expect(component).toBeDefined();
      expect(component).toBe(serviceComponentRegistry.weather);
    });

    it("should return null when component not found", () => {
      const component = getServiceComponent("nonexistent");

      expect(component).toBe(null);
    });

    it("should return registered custom component", () => {
      const mockComponent = { name: "CustomComponent" };
      registerServiceComponent("custom", mockComponent);

      const component = getServiceComponent("custom");

      expect(component).toBe(mockComponent);

      // Cleanup
      delete serviceComponentRegistry.custom;
    });
  });
});
