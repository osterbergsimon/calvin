# Performance Optimizations

This document outlines the performance optimizations implemented in the Calvin frontend.

## Code Splitting & Lazy Loading

### Route-level Lazy Loading
Routes are lazy-loaded to reduce initial bundle size:
- `Dashboard` - loaded on `/`
- `Settings` - loaded on `/settings`

### Component-level Lazy Loading
Heavy components are lazy-loaded when needed:
- **Settings Categories**: `LayoutCategory`, `ContentCategory`, `PluginsCategory`, `SystemCategory` - only loaded when their tab is active
- **Mode Components**: `CalendarView`, `PhotoSlideshow`, `WebServiceViewer` - only loaded when their mode is active

## Build Optimizations

### Chunk Splitting Strategy
Vite build is configured with optimized chunking:
- **Vendor Chunks**:
  - `vendor-vue`: Vue ecosystem (vue, vue-router, pinia)
  - `vendor-query`: Vue Query (@tanstack/vue-query)
  - `vendor-vueuse`: VueUse utilities
  - `vendor-utils`: Other utilities (axios, vuedraggable)
  - `vendor`: All other node_modules
- **Feature Chunks**:
  - `plugins`: Plugin components
  - `settings`: Settings components

This strategy improves caching - vendor chunks change less frequently than application code.

## Caching

### HTTP Caching
- Static assets (JS, CSS, images) are cached with hash-based filenames
- API responses are cached via Vue Query with 5-minute stale time
- Service worker provides offline caching

### Vue Query Caching
Configured with optimized defaults:
- `staleTime`: 5 minutes - data considered fresh
- `cacheTime`: 10 minutes - data kept in cache after component unmount
- `refetchOnWindowFocus`: false - reduce unnecessary refetches
- `refetchOnReconnect`: true - refetch on network reconnect

### Service Worker
Service worker (`public/sw.js`) provides:
- **Static Assets**: Cache-first strategy for JS, CSS, HTML
- **API Requests**: Network-first strategy with cache fallback
- Offline support for critical assets

The service worker is automatically registered in production mode.

## Resource Preloading

### Preconnect
Added `<link rel="preconnect">` to API endpoints for faster connection establishment.

### DNS Prefetch
Can be added for external resources if needed.

## Performance Monitoring

### Build Analysis
Run `npm run build` to see chunk sizes and identify optimization opportunities.

### Bundle Analysis
Consider using `vite-bundle-visualizer` to analyze bundle composition.

## Future Optimizations

- Image optimization (WebP, lazy loading)
- Font optimization (subsetting, preload)
- Critical CSS extraction
- Progressive Web App (PWA) features
- Virtual scrolling for large lists
- Debouncing/throttling for frequent updates
