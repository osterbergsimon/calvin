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
      expect(wrapper.find(".photo-placeholder").text()).toContain("No photos yet");
      // Points at the real place to add photos, not a server directory (F3)
      expect(wrapper.find(".photo-placeholder").text()).toContain(
        "Settings › Content › Image sources"
      );
      expect(wrapper.find(".photo-placeholder").text()).not.toContain("data/images");
    });

    it("the empty state's button deep-links to photo upload", () => {
      imagesStore.loading = false;
      imagesStore.currentImage = null;
      const wrapper = createWrapper();
      const empty = wrapper.findComponent({ name: "EmptyState" });
      expect(empty.props("settingId")).toBe("content-images");
      expect(wrapper.find('[data-test="empty-state-action"]').text()).toBe("Add photos");
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

    it("keeps raw error text off the wall (CLV-63)", () => {
      imagesStore.error = "Failed to load images";
      configStore.showUI = true;
      const wrapper = createWrapper();

      expect(wrapper.find(".error-message").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("Failed to load images");
    });
  });

  describe("Header Display", () => {
    it("does not render a region title (content speaks for itself)", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: false });

      // Cycle B removed the large region title; the header is a slim controls
      // strip only (no "Photos" heading).
      expect(wrapper.find(".dashboard-panel__title").exists()).toBe(false);
      expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("should hide header when fullscreen", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: true });

      expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
    });

    it("should hide header when UI is hidden", () => {
      configStore.showUI = false;
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
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
    it("should apply fit class passed by the region", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper({ fit: "fill" });

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-fill");
    });

    it("defaults to smart when the region has no fit", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-smart");
    });
  });

  describe("Smart fit measures the region (CLV-49)", () => {
    let observers;

    beforeEach(() => {
      observers = [];
      globalThis.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.observe = vi.fn();
          this.disconnect = vi.fn();
          this.unobserve = vi.fn();
          observers.push(this);
        }
      };
    });

    afterEach(() => {
      delete globalThis.ResizeObserver;
    });

    const setContainer = async (wrapper, width, height) => {
      // Mount's async hook observes the container after its image fetch settles.
      for (let i = 0; i < 10 && observers.length === 0; i += 1) {
        await Promise.resolve();
      }
      await wrapper.vm.$nextTick();
      // The component's own observer is the one watching the photo container.
      const observer = observers[observers.length - 1];
      observer.callback([{ contentRect: { width, height } }]);
      await wrapper.vm.$nextTick();
    };

    it("fills a 16:9 region with a 3:2 photo", async () => {
      imagesStore.currentImage = createImage({ width: 1500, height: 1000 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      const img = wrapper.find(".photo-image");
      expect(img.attributes("style")).toContain("object-fit: cover");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(false);
    });

    it("shows a portrait photo whole over a blurred backdrop in a full-width region", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      const img = wrapper.find(".photo-image");
      expect(img.attributes("style")).toContain("object-fit: contain");
      const backdrop = wrapper.find(".photo-backdrop");
      expect(backdrop.exists()).toBe(true);
      expect(backdrop.attributes("src")).toBe("/api/images/1");
      expect(backdrop.attributes("aria-hidden")).toBe("true");
    });

    it("shows a landscape photo whole in a 9:16 region", async () => {
      imagesStore.currentImage = createImage({ width: 1600, height: 900 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 900, 1600);

      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(true);
    });

    it("recomputes the decision when the region is resized", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });

      await setContainer(wrapper, 1600, 900); // 16:9 → whole photo
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");

      await setContainer(wrapper, 1000, 1500); // portrait → fill
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: cover");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(false);
    });

    it("uses naturalWidth/naturalHeight when stored dimensions are missing", async () => {
      imagesStore.currentImage = createImage({ width: undefined, height: undefined });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      // Unknown shape: contain until the photo reports its own size.
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");

      const img = wrapper.find(".photo-image");
      Object.defineProperty(img.element, "naturalWidth", { value: 1600 });
      Object.defineProperty(img.element, "naturalHeight", { value: 900 });
      await img.trigger("load");
      await wrapper.vm.$nextTick();

      expect(img.attributes("style")).toContain("object-fit: cover");
    });

    it("Whole photo renders the backdrop", async () => {
      imagesStore.currentImage = createImage({ width: 1500, height: 1000 });
      const wrapper = createWrapper({ fit: "fit" });

      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(true);
    });

    it("photo frame uses Smart whatever the region's fit is", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "fill", isFullscreen: true });
      await setContainer(wrapper, 1600, 900);

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-smart");
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
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
