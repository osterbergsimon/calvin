/** Tests for the localStorage offline cache (audit R7). */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchWithCache, getCachedData, getCachedEntry, setCachedData } from "@/utils/cache";

const TTL = 60 * 1000;

describe("offline cache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("expiry", () => {
    it("returns fresh data and hides expired data by default", () => {
      setCachedData("k", { v: 1 });
      expect(getCachedData("k", TTL)).toEqual({ v: 1 });

      vi.advanceTimersByTime(TTL + 1);
      expect(getCachedData("k", TTL)).toBeNull();
    });

    it("keeps expired entries instead of deleting them on read", () => {
      setCachedData("k", { v: 1 });
      vi.advanceTimersByTime(TTL + 1);

      getCachedData("k", TTL);

      expect(getCachedData("k", TTL, { allowStale: true })).toEqual({ v: 1 });
      expect(getCachedEntry("k", TTL)).toMatchObject({ data: { v: 1 }, stale: true });
    });

    it("flags an entry within its TTL as not stale", () => {
      setCachedData("k", [1]);
      vi.advanceTimersByTime(TTL - 1);

      expect(getCachedEntry("k", TTL)).toMatchObject({ data: [1], stale: false });
    });

    it("returns null for a missing key", () => {
      expect(getCachedEntry("missing", TTL)).toBeNull();
    });
  });

  describe("fetchWithCache", () => {
    it("caches a successful result", async () => {
      const result = await fetchWithCache("k", TTL, async () => ({ v: 2 }));

      expect(result).toEqual({ data: { v: 2 }, fromCache: false, stale: false });
      expect(getCachedData("k", TTL)).toEqual({ v: 2 });
    });

    it("does not cache when shouldCache rejects the result (partial success)", async () => {
      setCachedData("k", { v: "good" });

      const result = await fetchWithCache("k", TTL, async () => ({ v: "partial" }), {
        shouldCache: () => false,
      });

      expect(result.data).toEqual({ v: "partial" });
      expect(getCachedData("k", TTL)).toEqual({ v: "good" });
    });

    it("serves an expired entry, flagged stale, when the request fails", async () => {
      setCachedData("k", { v: "old" });
      vi.advanceTimersByTime(TTL * 10);

      const result = await fetchWithCache("k", TTL, async () => {
        throw new Error("Network Error");
      });

      expect(result).toEqual({ data: { v: "old" }, fromCache: true, stale: true });
    });

    it("rethrows when the request fails and nothing is cached", async () => {
      await expect(
        fetchWithCache("k", TTL, async () => {
          throw new Error("Network Error");
        })
      ).rejects.toThrow("Network Error");
    });

    it("serves the cache without a request when preferCache is set", async () => {
      setCachedData("k", { v: "cached" });
      vi.advanceTimersByTime(TTL * 10);
      const request = vi.fn();

      const result = await fetchWithCache("k", TTL, request, { preferCache: true });

      expect(request).not.toHaveBeenCalled();
      expect(result).toEqual({ data: { v: "cached" }, fromCache: true, stale: true });
    });

    it("still tries the network with preferCache when nothing is cached", async () => {
      const result = await fetchWithCache("k", TTL, async () => "live", { preferCache: true });

      expect(result).toEqual({ data: "live", fromCache: false, stale: false });
    });
  });
});
