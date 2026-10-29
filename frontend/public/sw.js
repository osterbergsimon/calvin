/**
 * Calvin service worker.
 *
 * Strategies:
 * - Navigations (the SPA's index.html): network-first. A fresh deploy is
 *   picked up on the next load; the cached shell is only a fallback when the
 *   backend can't be reached or answers with a server error.
 * - Hashed build assets (/assets/*): cache-first. Their names change with
 *   their content, so a cached copy is never stale.
 * - API GETs: network-first, falling back to the last good response. Replayed
 *   responses carry the `x-calvin-sw-cache` header so the app doesn't take
 *   them as proof the backend is up. The cache is capped.
 * - Never handled (straight to the network, failures stay failures): non-GET
 *   requests, other origins, /api/health, /api/system/* (status, updates,
 *   display power), server-sent event streams and full-size images.
 *
 * BUILD_ID is replaced at build time (vite.config.js) with a hash of the
 * build's asset names, so each deploy gets its own caches and the previous
 * deploy's caches are deleted when this worker activates.
 */

const BUILD_ID = "__CALVIN_BUILD_ID__";

const CACHE_PREFIX = "calvin-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${BUILD_ID}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${BUILD_ID}`;
const API_CACHE = `${CACHE_PREFIX}api-${BUILD_ID}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE];

// Every SPA route serves the same index.html, so one cached copy covers all.
const APP_SHELL_URL = "/";
const API_CACHE_MAX_ENTRIES = 100;
const SW_CACHE_HEADER = "x-calvin-sw-cache";

function isUncachedApi(url, request) {
  const path = url.pathname;
  if (path === "/api/health" || path.startsWith("/api/health/")) return true;
  if (path.startsWith("/api/system/")) return true;
  // Full-size photos are large and rotate constantly; thumbnails are small.
  if (path.startsWith("/api/images/") && !path.endsWith("/thumbnail")) return true;
  return (request.headers.get("accept") || "").includes("text/event-stream");
}

/** Pick the strategy for a request: "navigate", "asset", "api", "static" or null (bypass). */
function strategyFor(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (url.pathname.startsWith("/api/")) {
    return isUncachedApi(url, request) ? null : "api";
  }
  if (request.mode === "navigate") return "navigate";
  if (url.pathname.startsWith("/assets/")) return "asset";
  return "static";
}

function offlineResponse() {
  return new Response("Calvin can't reach its server.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(APP_SHELL_URL, response.clone());
      return response;
    }
    if (response.status >= 500) {
      return (await cache.match(APP_SHELL_URL)) || response;
    }
    return response;
  } catch {
    return (await cache.match(APP_SHELL_URL)) || offlineResponse();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  // Cache keys come back in insertion order: drop the oldest first.
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}

function markReplayed(response) {
  const headers = new Headers(response.headers);
  headers.set(SW_CACHE_HEADER, "1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cache.put(request, response.clone());
      await trimCache(cache, API_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return markReplayed(cached);
    throw error;
  }
}

const HANDLERS = {
  navigate: networkFirstNavigation,
  asset: cacheFirstAsset,
  static: networkFirstStatic,
  api: networkFirstApi,
};

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.add(APP_SHELL_URL))
      // Precaching is a head start, not a requirement: the first navigation
      // fills the shell cache anyway.
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(names =>
        Promise.all(
          names
            .filter(name => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(name))
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const strategy = strategyFor(event.request);
  if (strategy) {
    event.respondWith(HANDLERS[strategy](event.request));
  }
});
