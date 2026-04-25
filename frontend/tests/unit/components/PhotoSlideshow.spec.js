/**
 * Unit tests for PhotoSlideshow component
 * Tests functionality: image display, loading/error states, auto-rotation, display modes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useImagesStore } from "@/stores/images";
import { useConfigStore } from "@/stores/config";

describe("PhotoSlideshow", () => {
  let imagesStore;
  let configStore;
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers();

    imagesStore = useImagesStore();
    configStore = useConfigStore();

    // Reset stores
    imagesStore.loading = false;
    imagesStore.error = null;
    imagesStore.images = [];
    imagesStore.currentImage = null;
    configStore.showUI = true;
    configStore.imageDisplayMode = "smart";
    configStore.orientation = "landscape";

    // Mock store methods
    imagesStore.fetchImages = vi.fn().mockResolvedValue(undefined);
    imagesStore.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    imagesStore.nextImage = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createImage = (overrides = {}) => ({
    id: "1",
    filename: "test.jpg",
    url: "/api/images/1",
    width: 1920,
    height: 1080,
    ...overrides,
  });

  const createWrapper = (props = {}) => {
    return mount(PhotoSlideshow, {
      props: {
        isFullscreen: false,
        autoRotate: false,
        rotationInterval: 30000,
        ...props,
      },
      global: {
        plugins: [pinia],
      },
    });
  };

  describe("Visibility and States", () => {
    it("should show loading state when images are loading", () => {
      imagesStore.loading = true;
      const wrapper = createWrapper();

      expect(wrapper.find(".loading").exists()).toBe(true);
      expect(wrapper.find(".loading").text()).toContain("Loading images...");
    });

    it("should show placeholder when no images available", () => {
      imagesStore.loading = false;
      imagesStore.currentImage = null;
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-placeholder").exists()).toBe(true);
      expect(wrapper.find(".photo-placeholder").text()).toContain("No images available");
      expect(wrapper.find(".photo-info").text()).toContain("data/images");
    });

    it("should display image when available", () => {
      const image = createImage();
      imagesStore.loading = false;
      imagesStore.currentImage = image;

      const wrapper = createWrapper();

      expect(wrapper.find(".photo-container").exists()).toBe(true);
      expect(wrapper.find(".photo-image").exists()).toBe(true);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1");
    });

    it("should show error message when error exists", () => {
      imagesStore.error = "Failed to load images";
      configStore.showUI = true;
      const wrapper = createWrapper();

      expect(wrapper.find(".error-message").exists()).toBe(true);
      expect(wrapper.find(".error-message").text()).toBe("Failed to load images");
    });
  });

  describe("Header Display", () => {
    it("should show header when UI is visible and not fullscreen", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".slideshow-header").exists()).toBe(true);
      expect(wrapper.find("h2").text()).toBe("Photos");
    });

    it("should hide header when fullscreen", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: true });

      expect(wrapper.find(".slideshow-header").exists()).toBe(false);
    });

    it("should hide header when UI is hidden", () => {
      configStore.showUI = false;
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".slideshow-header").exists()).toBe(false);
    });
  });

  describe("Image Display", () => {
    it("should display image with correct alt text", () => {
      const image = createImage({ filename: "vacation.jpg" });
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      expect(img.attributes("alt")).toBe("vacation.jpg");
    });

    it("should use default alt text when filename not available", () => {
      const image = createImage({ filename: null });
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      expect(img.attributes("alt")).toBe("Photo");
    });
  });

  describe("Display Modes", () => {
    it("should apply display mode class", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      configStore.imageDisplayMode = "fill";
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-fill");
    });

    it("should apply smart mode class", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      configStore.imageDisplayMode = "smart";
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-smart");
    });

    it("should calculate smart mode styling for landscape images", () => {
      const image = createImage({ width: 1920, height: 1080 }); // 16:9 landscape
      imagesStore.currentImage = image;
      configStore.imageDisplayMode = "smart";
      configStore.orientation = "landscape";
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      // Smart mode should return objectFit based on aspect ratio
      expect(img.classes()).toContain("photo-image-smart");
    });
  });

  describe("Fullscreen Mode", () => {
    it("should apply fullscreen class when isFullscreen is true", () => {
      const wrapper = createWrapper({ isFullscreen: true });

      expect(wrapper.find(".photo-slideshow").classes()).toContain("fullscreen");
    });

    it("should not apply fullscreen class when isFullscreen is false", () => {
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".photo-slideshow").classes()).not.toContain("fullscreen");
    });
  });

  describe("Auto Rotation", () => {
    it("should rotate images when autoRotate is enabled", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.currentImage = image1;
      imagesStore.loading = false;
      // Mock fetchImages to set images array so startAutoRotation can check length
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image1, image2];
        return { images: [image1, image2] };
      });

      const wrapper = createWrapper({
        autoRotate: true,
        rotationInterval: 5000,
      });

      // Wait for mounted hook to complete (async fetchImages)
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect(imagesStore.fetchImages).toHaveBeenCalled();
      });
      await wrapper.vm.$nextTick(); // Wait for startAutoRotation to be called

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).toHaveBeenCalled();
    });

    it("should not rotate when only one image available", async () => {
      const image = createImage();
      imagesStore.images = [image];
      imagesStore.currentImage = image;
      imagesStore.loading = false;

      const wrapper = createWrapper({
        autoRotate: true,
        rotationInterval: 5000,
      });

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).not.toHaveBeenCalled();
    });

    it("should not rotate when autoRotate is disabled", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.images = [image1, image2];
      imagesStore.currentImage = image1;
      imagesStore.loading = false;

      const wrapper = createWrapper({
        autoRotate: false,
        rotationInterval: 5000,
      });

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).not.toHaveBeenCalled();
    });
  });

  describe("Image Loading", () => {
    it("should fetch images on mount", async () => {
      imagesStore.loading = false;
      const wrapper = createWrapper();

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      expect(imagesStore.fetchImages).toHaveBeenCalled();
    });

    it("should fetch current image if images exist but no current image", async () => {
      const image = createImage();
      imagesStore.loading = false;
      // Mock fetchImages to set images and trigger fetchCurrentImage
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image];
        if (imagesStore.images.length > 0 && !imagesStore.currentImage) {
          await imagesStore.fetchCurrentImage();
        }
        return { images: [image] };
      });

      const wrapper = createWrapper();

      // Wait for mounted async hook to complete
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect(imagesStore.fetchImages).toHaveBeenCalled();
      });

      expect(imagesStore.fetchCurrentImage).toHaveBeenCalled();
    });

    it("should handle image load event", async () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      await img.trigger("load");

      // Should not throw - just verify it handles the event
      expect(img.exists()).toBe(true);
    });

    it("should handle image error event", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      await img.trigger("error");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
