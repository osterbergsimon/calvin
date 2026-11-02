/**
 * Per-photo fit decisions for the photos region (CLV-49).
 *
 * Smart used to assume every photo region was a ~30% side panel and compared
 * photos against a hardcoded aspect ratio, so a portrait photo in a full-width
 * region or in photo frame came out as a cropped band. Smart now compares the
 * photo against the *measured* container: close shapes fill, everything else
 * is shown whole over a blurred copy of itself.
 */

export const PHOTO_FIT_MODES = ["smart", "fit", "fill", "center"];

/** Canonical fit value; retired `crop` was a duplicate of fill. */
export function normalizePhotoFit(value) {
  if (value === "crop") return "fill";
  return PHOTO_FIT_MODES.includes(value) ? value : "smart";
}

/**
 * The largest ratio difference Smart accepts before showing the whole photo:
 * within ±20% of the container shape, at most ~20% is cropped.
 */
const SMART_FILL_MIN = 0.8;
const SMART_FILL_MAX = 1.25;

/**
 * Decide how a photo sits in a container.
 * @param {number|null} imageAspect width / height of the photo
 * @param {number|null} containerAspect width / height of the photo area
 * @returns {{ mode: "fill"|"fit", backdrop: boolean }}
 */
export function smartPhotoFit(imageAspect, containerAspect) {
  if (!(imageAspect > 0) || !(containerAspect > 0)) {
    // Not measured yet (or dimensions not loaded): show it whole, no backdrop
    // until there is a real decision to make.
    return { mode: "fit", backdrop: false };
  }
  const r = imageAspect / containerAspect;
  return r >= SMART_FILL_MIN && r <= SMART_FILL_MAX
    ? { mode: "fill", backdrop: false }
    : { mode: "fit", backdrop: true };
}

/**
 * Apply a region's fit setting to one photo.
 * @param {{ fit?: string, imageAspect?: number|null, containerAspect?: number|null }} input
 * @returns {{ mode: "fill"|"fit"|"center", backdrop: boolean }}
 */
export function resolvePhotoFit({ fit, imageAspect, containerAspect } = {}) {
  const mode = normalizePhotoFit(fit);
  if (mode === "smart") return smartPhotoFit(imageAspect, containerAspect);
  if (mode === "fit") return { mode: "fit", backdrop: true };
  if (mode === "fill") return { mode: "fill", backdrop: false };
  return { mode: "center", backdrop: false };
}

/**
 * A photo's aspect ratio from stored metadata, falling back to the natural
 * dimensions the browser reported when it loaded the file.
 */
export function resolveImageAspect(image, natural = null) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (width > 0 && height > 0) return width / height;
  const naturalWidth = Number(natural?.naturalWidth ?? natural?.width);
  const naturalHeight = Number(natural?.naturalHeight ?? natural?.height);
  if (naturalWidth > 0 && naturalHeight > 0) return naturalWidth / naturalHeight;
  return null;
}
