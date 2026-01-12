/** Test setup file for Vitest. */

import { expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup } from "@testing-library/vue";
import * as matchers from "@testing-library/jest-dom/matchers";
import axios from "axios";

// Mock axios globally to prevent network errors in tests
// Store created instances so we can apply default mocks to them
const createdAxiosInstances = [];

vi.mock("axios", () => {
  // Create a mock axios instance factory
  const createMockAxiosInstance = () => {
    const instance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      request: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn(),
          eject: vi.fn(),
        },
        response: {
          use: vi.fn(),
          eject: vi.fn(),
        },
      },
      defaults: {
        headers: {
          common: {},
        },
      },
    };
    // Track created instances
    createdAxiosInstances.push(instance);
    return instance;
  };

  // Create the default mock instance
  const mockAxios = createMockAxiosInstance();

  // Add create method that returns a new mock instance
  mockAxios.create = vi.fn(() => createMockAxiosInstance());

  return {
    default: mockAxios,
  };
});

// Mock window.matchMedia for theme composable tests
// This must be set up before any modules are imported that use it
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query) => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

// Default mock responses for common API endpoints
// These defaults prevent network errors when components/composables make API calls
// Individual tests can override these mocks as needed
beforeEach(() => {
  // Reset mocks but keep default implementations
  vi.clearAllMocks();

  // Helper function to apply default implementations to an axios instance
  const applyDefaults = (instance) => {
    // Default config response - prevents errors when useTheme calls fetchConfig
    instance.get.mockImplementation((url) => {
      if (url === "/api/config" || url?.includes("/api/config")) {
        return Promise.resolve({
          data: {
            orientation: "landscape",
            calendarSplit: 70,
            showUI: true,
            themeMode: "auto",
            selectedTheme: null,
            darkModeStart: 18,
            darkModeEnd: 6,
          },
        });
      }
      // Return empty response for other GET endpoints to avoid errors
      return Promise.resolve({ data: {} });
    });

    // Default POST response
    instance.post.mockImplementation(() => {
      return Promise.resolve({ data: {} });
    });

    // Default implementations for other methods
    instance.put.mockImplementation(() => Promise.resolve({ data: {} }));
    instance.delete.mockImplementation(() => Promise.resolve({ data: {} }));
    instance.patch.mockImplementation(() => Promise.resolve({ data: {} }));
    instance.request.mockImplementation(() => Promise.resolve({ data: {} }));
  };

  // Apply defaults to the default axios instance
  applyDefaults(axios);

  // Apply defaults to all created instances
  createdAxiosInstances.forEach(applyDefaults);
});

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});
