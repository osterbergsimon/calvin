/**
 * LocalStorage-based caching utility with TTL (Time To Live) support.
 * Used for graceful degradation when offline.
 */

const CACHE_PREFIX = "calvin_cache_";
const CACHE_TIMESTAMP_PREFIX = "calvin_cache_ts_";

/**
 * Get cached data if it exists and is not expired.
 * 
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
 * @returns {any|null} Cached data or null if expired/not found
 */
export function getCachedData(key, ttl = 60 * 60 * 1000) {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;
    
    const cachedData = localStorage.getItem(cacheKey);
    const cachedTimestamp = localStorage.getItem(timestampKey);
    
    if (!cachedData || !cachedTimestamp) {
      return null;
    }
    
    const age = Date.now() - parseInt(cachedTimestamp, 10);
    if (age > ttl) {
      // Cache expired, remove it
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(timestampKey);
      return null;
    }
    
    return JSON.parse(cachedData);
  } catch (error) {
    console.error(`[Cache] Error reading cache for key ${key}:`, error);
    return null;
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
 * Clear all cache entries (for debugging/cleanup).
 */
export function clearAllCache() {
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIMESTAMP_PREFIX))) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
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
      if (timestamp && (now - timestamp) > maxAge) {
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

/**
 * Get cache statistics (for debugging).
 */
export function getCacheStats() {
  const stats = {
    totalEntries: 0,
    totalSize: 0,
    entries: [],
  };
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_PREFIX)) {
      const data = localStorage.getItem(key);
      const timestampKey = key.replace(CACHE_PREFIX, CACHE_TIMESTAMP_PREFIX);
      const timestamp = localStorage.getItem(timestampKey);
      
      stats.totalEntries++;
      stats.totalSize += (key.length + (data?.length || 0) + (timestampKey.length + (timestamp?.length || 0)));
      
      stats.entries.push({
        key: key.replace(CACHE_PREFIX, ""),
        size: data?.length || 0,
        age: timestamp ? Date.now() - parseInt(timestamp, 10) : null,
      });
    }
  }
  
  return stats;
}

