/** Tests for the shared API client's connection handling (audit R1/R7). */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import api, { DEFAULT_REQUEST_TIMEOUT, SW_CACHE_HEADER } from "@/services/api";
import { useConnectionStore } from "@/stores/connection";

// axios is mocked globally (tests/setup.js): grab the interceptors api.js
// registered when it was imported, before any beforeEach clears the mocks.
const createConfig = axios.create.mock.calls.at(-1)[0];
const [onFulfilled, onRejected] = api.interceptors.response.use.mock.calls[0];

describe("services/api", () => {
  let connection;

  beforeEach(() => {
    setActivePinia(createPinia());
    connection = useConnectionStore();
    connection.checkBackend = vi.fn(async () => true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("has a timeout and no forced JSON Content-Type (so FormData uploads work)", () => {
    expect(createConfig.timeout).toBe(DEFAULT_REQUEST_TIMEOUT);
    expect(createConfig.headers?.["Content-Type"]).toBeUndefined();
  });

  it("marks the backend online on a real response", () => {
    connection.isBackendOnline = false;

    onFulfilled({ status: 200, headers: {} });

    expect(connection.isBackendOnline).toBe(true);
  });

  it("does not mark the backend online for a response the service worker replayed", () => {
    connection.isBackendOnline = false;

    onFulfilled({ status: 200, headers: { [SW_CACHE_HEADER]: "1" } });

    expect(connection.isBackendOnline).toBe(false);
  });

  it("does not flip to offline on a 5xx; it asks the health check instead", async () => {
    connection.isBackendOnline = true;
    const error = { response: { status: 500, data: { detail: "plugin upstream failed" } } };

    await expect(onRejected(error)).rejects.toBe(error);

    expect(connection.checkBackend).toHaveBeenCalled();
    expect(connection.isBackendOnline).toBe(true);
  });

  it("marks the backend offline on a network error", async () => {
    connection.isBackendOnline = true;
    connection.checkBackend = vi.fn(async () => false);
    const error = { message: "Network Error" };

    await expect(onRejected(error)).rejects.toBe(error);

    expect(connection.isBackendOnline).toBe(false);
    expect(connection.checkBackend).toHaveBeenCalled();
  });
});
