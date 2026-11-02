import { describe, it, expect } from "vitest";
import {
  IMAGE_VARIANT_WIDTHS,
  bucketImageWidth,
  variantWidthForRegion,
  upgradeImageWidth,
  withImageWidth,
} from "@/utils/imageVariants";

describe("image variant width buckets", () => {
  it("matches the backend buckets", () => {
    expect(IMAGE_VARIANT_WIDTHS).toEqual([640, 960, 1280, 1920, 2560]);
  });

  it("rounds up and clamps", () => {
    expect(bucketImageWidth(1000)).toBe(1280);
    expect(bucketImageWidth(3000)).toBe(2560);
    expect(bucketImageWidth(1)).toBe(640);
    expect(bucketImageWidth(640)).toBe(640);
    expect(bucketImageWidth(641)).toBe(960);
    expect(bucketImageWidth(2560)).toBe(2560);
  });

  it("returns null for invalid widths", () => {
    expect(bucketImageWidth(0)).toBeNull();
    expect(bucketImageWidth(-10)).toBeNull();
    expect(bucketImageWidth(Number.NaN)).toBeNull();
    expect(bucketImageWidth(undefined)).toBeNull();
  });

  it("multiplies the rendered region by devicePixelRatio", () => {
    expect(variantWidthForRegion(800, 1)).toBe(960);
    expect(variantWidthForRegion(800, 1.5)).toBe(1280);
    expect(variantWidthForRegion(1280, 2)).toBe(2560);
    expect(variantWidthForRegion(4000, 2)).toBe(2560);
    expect(variantWidthForRegion(800, 0)).toBe(960);
  });

  it("only upgrades to a bigger bucket", () => {
    expect(upgradeImageWidth(null, 1280)).toBe(1280);
    expect(upgradeImageWidth(1280, 960)).toBe(1280);
    expect(upgradeImageWidth(1280, 1920)).toBe(1920);
    expect(upgradeImageWidth(1280, null)).toBe(1280);
  });

  it("builds a variant URL without losing existing queries or the hash", () => {
    expect(withImageWidth("/api/images/abc", 1000)).toBe("/api/images/abc?w=1280");
    expect(withImageWidth("/api/images/abc?x=1", 700)).toBe("/api/images/abc?x=1&w=960");
    expect(withImageWidth("/api/images/abc?w=640", 3000)).toBe("/api/images/abc?w=2560");
    expect(withImageWidth("/api/images/abc#top", 640)).toBe("/api/images/abc?w=640#top");
    expect(withImageWidth("/api/images/abc", null)).toBe("/api/images/abc");
    expect(withImageWidth(null, 640)).toBeNull();
  });
});
