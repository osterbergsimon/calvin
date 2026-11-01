/**
 * Tests for the service worker's fetch strategies (public/sw.js).
 *
 * The real worker script is evaluated against a fake worker scope: an
 * in-memory CacheStorage, a scripted `fetch`, and captured event listeners.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SW_SOURCE = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf-8");
const ORIGIN = "http://calvin.local";

class FakeCache {
  constructor() {
    this.entries = new Map();
  }
  key(request) {
    return typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
  }
  async match(request) {
    const hit = this.entries.get(this.key(request));
    return hit ? hit.clone() : undefined;
  }
  async put(request, response) {
    const key = this.key(request);
    this.entries.delete(key);
    this.entries.set(key, response);
  }
  async add(url) {
    const response = await this.fetch(new Request(new URL(url, ORIGIN).href));
    if (!response.ok) throw new TypeError("add failed");
    await this.put(url, response);
  }
  async delete(request) {
    return this.entries.delete(this.key(request));
  }
  async keys() {
    return [...this.entries.keys()].map(url => new Request(url));
  }
}

class FakeCacheStorage {
  constructor(fetchImpl) {
    this.stores = new Map();
    this.fetch = fetchImpl;
  }
  async open(name) {
    if (!this.stores.has(name)) {
      const cache = new FakeCache();
      cache.fetch = this.fetch;
      this.stores.set(name, cache);
    }
    return this.stores.get(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name) {
    return this.stores.delete(name);
  }
}

function loadWorker(buildId = "test-build") {
  const listeners = {};
  const fetchMock = vi.fn();
  const caches = new FakeCacheStorage((...args) => fetchMock(...args));
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const source = SW_SOURCE.replace("__CALVIN_BUILD_ID__", buildId);
  new Function("self", "caches", "fetch", source)(self, caches, (...args) => fetchMock(...args));

  // Dispatch a fetch event; resolves to the worker's response, or null when
  // the worker leaves the request to the browser.
  const dispatchFetch = async request => {
    let responded = null;
    listeners.fetch({
      request,
      respondWith: promise => {
        responded = promise;
      },
    });
    return responded ? await responded : null;
  };

  const runLifecycle = async type => {
    let pending;
    listeners[type]({ waitUntil: p => (pending = p) });
    await pending;
  };

  return { self, caches, fetchMock, dispatchFetch, runLifecycle };
}

const req = (path, init = {}) => new Request(`${ORIGIN}${path}`, init);
const navigation = path => {
  const request = req(path);
  // Request.mode can't be set to "navigate" through the constructor.
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
};
const html = body => new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("service worker", () => {
  let sw;

  beforeEach(() => {
    sw = loadWorker();
  });

  describe("cache naming and lifecycle", () => {
    it("names caches after the build and deletes other builds' caches on activate", async () => {
      await sw.caches.open("calvin-static-v1"); // the old fixed-name caches
      await sw.caches.open("calvin-api-v1");
      await sw.caches.open("calvin-shell-old-build");
      await sw.caches.open("someone-elses-cache");
      await sw.caches.open("calvin-shell-test-build");

      await sw.runLifecycle("activate");

      expect(await sw.caches.keys()).toEqual(["someone-elses-cache", "calvin-shell-test-build"]);
      expect(sw.self.clients.claim).toHaveBeenCalled();
    });

    it("precaches only the app shell, not the dev-only /src/main.js", async () => {
      sw.fetchMock.mockResolvedValue(html("<html>shell</html>"));

      await sw.runLifecycle("install");

      const requested = sw.fetchMock.mock.calls.map(([r]) => new URL(r.url).pathname);
      expect(requested).toEqual(["/"]);
      expect(sw.self.skipWaiting).toHaveBeenCalled();
    });

    it("still installs when the precache fails", async () => {
      sw.fetchMock.mockRejectedValue(new TypeError("offline"));

      await expect(sw.runLifecycle("install")).resolves.toBeUndefined();
      expect(sw.self.skipWaiting).toHaveBeenCalled();
    });
  });

  describe("navigations (network-first)", () => {
    it("serves the fresh page from the network even when a cached shell exists", async () => {
      sw.fetchMock.mockResolvedValueOnce(html("old build"));
      await sw.dispatchFetch(navigation("/"));

      sw.fetchMock.mockResolvedValueOnce(html("new build"));
      const response = await sw.dispatchFetch(navigation("/"));

      expect(await response.text()).toBe("new build");
    });

    it("falls back to the cached shell for any route when the network fails", async () => {
      sw.fetchMock.mockResolvedValueOnce(html("shell"));
      await sw.dispatchFetch(navigation("/"));

      sw.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const response = await sw.dispatchFetch(navigation("/settings"));

      expect(await response.text()).toBe("shell");
    });

    it("falls back to the cached shell on a server error", async () => {
      sw.fetchMock.mockResolvedValueOnce(html("shell"));
      await sw.dispatchFetch(navigation("/"));

      sw.fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
      const response = await sw.dispatchFetch(navigation("/"));

      expect(await response.text()).toBe("shell");
    });

    it("answers 503 when offline with nothing cached", async () => {
      sw.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const response = await sw.dispatchFetch(navigation("/"));

      expect(response.status).toBe(503);
    });
  });

  describe("build assets (cache-first)", () => {
    it("serves a cached hashed asset without the network", async () => {
      sw.fetchMock.mockResolvedValueOnce(new Response("js", { status: 200 }));
      await sw.dispatchFetch(req("/assets/js/index-abc123.js"));

      const response = await sw.dispatchFetch(req("/assets/js/index-abc123.js"));

      expect(await response.text()).toBe("js");
      expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("API requests", () => {
    it("is network-first and replays the last good response, marked, when offline", async () => {
      sw.fetchMock.mockResolvedValueOnce(json({ sources: [1] }));
      const live = await sw.dispatchFetch(req("/api/calendar/sources"));
      expect(live.headers.get("x-calvin-sw-cache")).toBeNull();

      sw.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const replayed = await sw.dispatchFetch(req("/api/calendar/sources"));

      expect(await replayed.json()).toEqual({ sources: [1] });
      expect(replayed.headers.get("x-calvin-sw-cache")).toBe("1");
    });

    it("returns server errors as they are instead of replaying the cache", async () => {
      sw.fetchMock.mockResolvedValueOnce(json({ ok: true }));
      await sw.dispatchFetch(req("/api/plugins"));

      sw.fetchMock.mockResolvedValueOnce(json({ detail: "boom" }, 500));
      const response = await sw.dispatchFetch(req("/api/plugins"));

      expect(response.status).toBe(500);
    });

    it("fails like the network when offline with nothing cached", async () => {
      sw.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(sw.dispatchFetch(req("/api/plugins"))).rejects.toThrow("Failed to fetch");
    });

    it("caps the API cache, evicting the oldest entries", async () => {
      sw.fetchMock.mockImplementation(async () => json({}));
      for (let i = 0; i < 105; i++) {
        await sw.dispatchFetch(req(`/api/plugins/p${i}/data`));
      }

      const cache = await sw.caches.open("calvin-api-test-build");
      const urls = (await cache.keys()).map(r => new URL(r.url).pathname);
      expect(urls).toHaveLength(100);
      expect(urls[0]).toBe("/api/plugins/p5/data");
    });

    it.each([
      ["/api/health"],
      ["/api/health/detailed"],
      ["/api/system/status"],
      ["/api/system/update/stream"],
      ["/api/images/abc123"],
    ])("leaves %s to the network, uncached", async path => {
      expect(await sw.dispatchFetch(req(path))).toBeNull();
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });

    it("leaves server-sent event streams to the network", async () => {
      const request = req("/api/plugins/x/events", { headers: { Accept: "text/event-stream" } });

      expect(await sw.dispatchFetch(request)).toBeNull();
    });

    it("caches image thumbnails", async () => {
      sw.fetchMock.mockResolvedValueOnce(new Response("thumb", { status: 200 }));

      await sw.dispatchFetch(req("/api/images/abc123/thumbnail"));

      const cache = await sw.caches.open("calvin-api-test-build");
      expect(await cache.keys()).toHaveLength(1);
    });
  });

  describe("share links (calvin-mwqo)", () => {
    const TOKEN = "0123456789abcdef.SECRET";

    it("leaves a /share/ page to the network and never stores it as the shell", async () => {
      sw.fetchMock.mockResolvedValueOnce(html("dashboard shell"));
      await sw.dispatchFetch(navigation("/"));

      expect(await sw.dispatchFetch(navigation(`/share/${TOKEN}/`))).toBeNull();
      expect(await sw.dispatchFetch(navigation(`/share/${TOKEN}`))).toBeNull();

      // The dashboard shell is untouched, and no cache holds the token.
      const shell = await sw.caches.open("calvin-shell-test-build");
      expect(await (await shell.match("/")).text()).toBe("dashboard shell");
      for (const name of await sw.caches.keys()) {
        const keys = await (await sw.caches.open(name)).keys();
        expect(keys.map(r => r.url).join(" ")).not.toContain(TOKEN);
      }
    });

    it("never falls back to the dashboard shell for a /share/ page offline", async () => {
      sw.fetchMock.mockResolvedValueOnce(html("dashboard shell"));
      await sw.dispatchFetch(navigation("/"));

      sw.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      expect(await sw.dispatchFetch(navigation(`/share/${TOKEN}/`))).toBeNull();
    });

    it.each([
      [`/api/guest/${TOKEN}`],
      [`/api/guest/${TOKEN}/uploads`],
      [`/api/guest/${TOKEN}/uploads/abc/thumbnail`],
      [`/api/guest/${TOKEN}/manifest.webmanifest`],
    ])("leaves %s to the network, uncached", async path => {
      expect(await sw.dispatchFetch(req(path))).toBeNull();
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });

    it("lets the share-target POST pass through untouched", async () => {
      const body = new FormData();
      body.append("photos", new Blob(["x"], { type: "image/jpeg" }), "a.jpg");
      const request = req(`/share/${TOKEN}/receive`, { method: "POST", body });
      Object.defineProperty(request, "mode", { value: "navigate" });

      expect(await sw.dispatchFetch(request)).toBeNull();
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });
  });

  it("leaves non-GET and cross-origin requests to the browser", async () => {
    expect(await sw.dispatchFetch(req("/api/config", { method: "POST", body: "{}" }))).toBeNull();
    expect(await sw.dispatchFetch(new Request("https://example.com/x.js"))).toBeNull();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });
});
