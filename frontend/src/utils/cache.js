/**
 * LocalStorage-based caching utility with TTL (Time To Live) support.
 * Used for graceful degradation when offline.
 */

const CACHE_PREFIX = "calvin_cache_";
const CACHE_TIMESTAMP_PREFIX = "calvin_cache_ts_";

/**
 * Read a cache entry without deleting it, expired or not.
 *
 * Expired entries are kept on purpose: an offline kiosk reload after the TTL
 * should still show the last known data (flagged stale) rather than nothing.
 *
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
 * @returns {{data: any, age: number, stale: boolean}|null} Entry or null if not found
 */
export function getCachedEntry(key, ttl = 60 * 60 * 1000) {
  try {
    const cachedData = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    const cachedTimestamp = localStorage.getItem(`${CACHE_TIMESTAMP_PREFIX}${key}`);

    if (!cachedData || !cachedTimestamp) {
      return null;
    }

    const age = Date.now() - parseInt(cachedTimestamp, 10);
    return { data: JSON.parse(cachedData), age, stale: !(age <= ttl) };
  } catch (error) {
    console.error(`[Cache] Error reading cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Get cached data if it exists and is not expired.
 *
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
 * @param {{allowStale?: boolean}} [options] - allowStale also returns expired data
 * @returns {any|null} Cached data or null if expired/not found
 */
export function getCachedData(key, ttl = 60 * 60 * 1000, { allowStale = false } = {}) {
  const entry = getCachedEntry(key, ttl);
  if (!entry || (entry.stale && !allowStale)) {
    return null;
  }
  return entry.data;
}

/**
 * Fetch through `request`, falling back to the offline cache.
 *
 * - When `preferCache` is set (the app knows it is offline) a cached entry is
 *   served without touching the network. `stale` is true whenever the data
 *   did not just come from the backend, however young the entry is.
 * - Otherwise the request runs; its result is cached only when
 *   `shouldCache(data)` agrees, so a partial result never overwrites a good one.
 * - When the request fails, any cached entry is served, expired ones included,
 *   and flagged stale; the entry is left as it is. With no cache the error is
 *   rethrown. A response the service worker replayed from its cache arrives
 *   here as such a failure (services/api.js rejects it), so it is never
 *   mistaken for fresh data or written back with a new timestamp.
 *
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds
 * @param {() => Promise<any>} request - Loads fresh data
 * @param {{preferCache?: boolean, shouldCache?: (data: any) => boolean}} [options]
 * @returns {Promise<{data: any, fromCache: boolean, stale: boolean}>}
 */
export async function fetchWithCache(
  key,
  ttl,
  request,
  { preferCache = false, shouldCache = () => true } = {}
) {
  if (preferCache) {
    const entry = getCachedEntry(key, ttl);
    if (entry) {
      return { data: entry.data, fromCache: true, stale: true };
    }
  }

  try {
    const data = await request();
    if (shouldCache(data)) {
      setCachedData(key, data);
    }
    return { data, fromCache: false, stale: false };
  } catch (error) {
    const entry = getCachedEntry(key, ttl);
    if (entry) {
      return { data: entry.data, fromCache: true, stale: true };
    }
    throw error;
  }
}

/**
 * Store data in cache with timestamp.
 *
 * @param {string} key - Cache key
 * @param {any} data - Data to cache (will be JSON stringified)
 */
export function setCachedData(key, data) {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;

  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    console.error(`[Cache] Error writing cache for key ${key}:`, error);
    // If storage is full, try to clear old cache entries
    if (error.name === "QuotaExceededError") {
      clearOldCacheEntries();
      // Retry once
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(timestampKey, Date.now().toString());
      } catch (retryError) {
        console.error(`[Cache] Failed to cache after cleanup:`, retryError);
      }
    }
  }
}

/**
 * Clear cached data for a specific key.
 *
 * @param {string} key - Cache key
 */
export function clearCachedData(key) {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;

  localStorage.removeItem(cacheKey);
  localStorage.removeItem(timestampKey);
}

/**
 * Clear old cache entries to free up space.
 * Removes entries older than 24 hours.
 */
function clearOldCacheEntries() {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();
  const keysToRemove = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_TIMESTAMP_PREFIX)) {
      const timestamp = parseInt(localStorage.getItem(key), 10);
      if (timestamp && now - timestamp > maxAge) {
        // Extract the actual cache key
        const cacheKey = key.replace(CACHE_TIMESTAMP_PREFIX, CACHE_PREFIX);
        keysToRemove.push(key);
        keysToRemove.push(cacheKey);
      }
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log(`[Cache] Cleared ${keysToRemove.length / 2} old cache entries`);
}
