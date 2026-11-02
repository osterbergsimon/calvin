import { describe, it, expect } from "vitest";
import {
  normalizePhotoFit,
  resolveImageAspect,
  resolvePhotoFit,
  smartPhotoFit,
} from "@/utils/photoFit";

// Reproduces the CLV-49 bug: Smart assumed every photo region was a ~30% side
// panel (containerAspect hardcoded 0.59/1.7), so a portrait photo in a
// full-width region was cropped instead of shown whole.
describe("smartPhotoFit", () => {
  it("fills a 16:9 container with a 3:2 photo", () => {
    expect(smartPhotoFit(3 / 2, 16 / 9)).toEqual({ mode: "fill", backdrop: false });
  });

  it("shows a 2:3 portrait whole with a backdrop in a 16:9 container", () => {
    expect(smartPhotoFit(2 / 3, 16 / 9)).toEqual({ mode: "fit", backdrop: true });
  });

  it("shows a 16:9 photo whole with a backdrop in a 9:16 container", () => {
    expect(smartPhotoFit(16 / 9, 9 / 16)).toEqual({ mode: "fit", backdrop: true });
  });

  it("fills when the aspect ratio is within 20% (r between 0.8 and 1.25)", () => {
    expect(smartPhotoFit(1.4, 1.5)).toEqual({ mode: "fill", backdrop: false });
    expect(smartPhotoFit(1.5, 1.4)).toEqual({ mode: "fill", backdrop: false });
    expect(smartPhotoFit(1.2, 1.5)).toEqual({ mode: "fit", backdrop: true });
  });

  it("falls back to whole-photo while a measurement is missing", () => {
    expect(smartPhotoFit(null, 16 / 9)).toEqual({ mode: "fit", backdrop: false });
    expect(smartPhotoFit(2 / 3, null)).toEqual({ mode: "fit", backdrop: false });
  });
});

describe("normalizePhotoFit", () => {
  it("maps the retired crop option to fill", () => {
    expect(normalizePhotoFit("crop")).toBe("fill");
  });

  it("defaults to smart", () => {
    expect(normalizePhotoFit(undefined)).toBe("smart");
    expect(normalizePhotoFit("nonsense")).toBe("smart");
  });
});

describe("resolvePhotoFit", () => {
  it("Whole photo always uses contain with a backdrop", () => {
    expect(resolvePhotoFit({ fit: "fit", imageAspect: 16 / 9, containerAspect: 16 / 9 })).toEqual({
      mode: "fit",
      backdrop: true,
    });
  });

  it("Fill and crop differ: fill covers, crop is fill", () => {
    expect(resolvePhotoFit({ fit: "fill", imageAspect: 2 / 3, containerAspect: 16 / 9 })).toEqual({
      mode: "fill",
      backdrop: false,
    });
    expect(resolvePhotoFit({ fit: "crop", imageAspect: 2 / 3, containerAspect: 16 / 9 })).toEqual({
      mode: "fill",
      backdrop: false,
    });
  });

  it("Centre never crops and never adds a backdrop", () => {
    expect(resolvePhotoFit({ fit: "center", imageAspect: 2 / 3, containerAspect: 16 / 9 })).toEqual(
      {
        mode: "center",
        backdrop: false,
      }
    );
  });

  it("Smart re-evaluates against the measured container", () => {
    expect(
      resolvePhotoFit({ fit: "smart", imageAspect: 2 / 3, containerAspect: 16 / 9 }).mode
    ).toBe("fit");
    expect(resolvePhotoFit({ fit: "smart", imageAspect: 2 / 3, containerAspect: 0.59 }).mode).toBe(
      "fill"
    );
    expect(resolvePhotoFit({ fit: "smart", imageAspect: 2 / 3, containerAspect: 0.72 }).mode).toBe(
      "fill"
    );
    expect(resolvePhotoFit({ fit: "smart", imageAspect: 2 / 3, containerAspect: 0.9 }).mode).toBe(
      "fit"
    );
  });
});

describe("resolveImageAspect", () => {
  it("uses stored width and height first", () => {
    expect(resolveImageAspect({ width: 1600, height: 900 })).toBeCloseTo(16 / 9);
  });

  it("falls back to measured natural dimensions", () => {
    expect(resolveImageAspect({}, { naturalWidth: 1000, naturalHeight: 1500 })).toBeCloseTo(2 / 3);
  });

  it("returns null when neither is known", () => {
    expect(resolveImageAspect({}, null)).toBeNull();
    expect(resolveImageAspect({ width: 0, height: 0 }, { naturalWidth: 0 })).toBeNull();
  });
});
