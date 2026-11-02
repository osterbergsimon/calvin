/** Width buckets for display images, shared by the slideshow and its tests. */

// Mirrors VARIANT_WIDTHS in backend/app/services/image_variant_cache.py.
export const IMAGE_VARIANT_WIDTHS = Object.freeze([640, 960, 1280, 1920, 2560]);

export const MAX_IMAGE_VARIANT_WIDTH = IMAGE_VARIANT_WIDTHS[IMAGE_VARIANT_WIDTHS.length - 1];

/**
 * Round a pixel width up to the nearest bucket the backend can serve.
 * Returns null for a missing/zero/negative width.
 */
export function bucketImageWidth(width) {
  const value = Math.ceil(Number(width));
  if (!Number.isFinite(value) || value <= 0) return null;
  return IMAGE_VARIANT_WIDTHS.find(bucket => value <= bucket) ?? MAX_IMAGE_VARIANT_WIDTH;
}

/** The bucket for a rendered region at a device pixel ratio. */
export function variantWidthForRegion(cssWidth, devicePixelRatio = 1) {
  const ratio = Number(devicePixelRatio);
  const dpr = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return bucketImageWidth(Number(cssWidth) * dpr);
}

/** Only grow the request; shrinking the region must not refetch a smaller file. */
export function upgradeImageWidth(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

/** Append (or replace) the w= bucket on an image URL. */
export function withImageWidth(url, width) {
  const bucket = bucketImageWidth(width);
  if (!url || !bucket) return url;
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const params = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");
  params.set("w", String(bucket));
  return `${path}?${params.toString()}${hash}`;
}

/**
 * Pre-load and decode an image before it is shown. Resolves to the element on
 * success and to null when the browser can't decode it (or has no decode()), so
 * callers can fall back to swapping without blocking on a failed pre-decode.
 */
export function preloadAndDecodeImage(url) {
  if (!url || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let image;
    try {
      image = new Image();
    } catch {
      finish(null);
      return;
    }
    image.onerror = () => finish(null);
    if (typeof image.decode !== "function") {
      // No decode(): don't hold the swap hostage to a load event that a test
      // host (or a browser that already cached it) may never deliver.
      finish(null);
      return;
    }
    image.src = url;
    image
      .decode()
      .then(() => finish(image))
      .catch(() => finish(null));
  });
}
