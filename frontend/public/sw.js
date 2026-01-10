/**
 * Service Worker for offline caching and performance
 * Caches critical assets for offline use and faster loading
 */

const CACHE_NAME = "calvin-v1";
const STATIC_CACHE = "calvin-static-v1";
const API_CACHE = "calvin-api-v1";

// Assets to cache immediately on install
const STATIC_ASSETS = ["/", "/index.html", "/src/main.js"];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name !== STATIC_CACHE && name !== API_CACHE && name !== CACHE_NAME
            );
          })
          .map((name) => caches.delete(name)),
      );
    }),
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // API requests - network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response
          const responseClone = response.clone();

          // Cache successful GET requests
          if (response.status === 200) {
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }

          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        }),
    );
    return;
  }

  // Static assets - cache-first with network fallback
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request).then((response) => {
        // Don't cache if not a success response
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        // Clone the response
        const responseClone = response.clone();

        // Cache the response
        caches.open(STATIC_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });

        return response;
      });
    }),
  );
});
