/** Test setup file for Vitest. */

import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/vue";
import * as matchers from "@testing-library/jest-dom/matchers";

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

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});
